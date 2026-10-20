#!/usr/bin/env node
// Flight-level month copy — replicate real `flight` rows from a source month into one or
// more future months, with a whole-month calendar shift (time-of-day preserved, end-of-month
// clamped by PostgreSQL interval math) and NO duplicate flights.
//
// Scope: the `flight` table ONLY. It does NOT copy pairing / pairing_segment / roster_flight.
// (For a pairing-level copy use data-migration/f8/live_pairing_month_copy.py instead.)
//
// Usage (run from a service dir so `pg` resolves, e.g. `cd live-server`):
//   set -a; source .env >/dev/null 2>&1; set +a      # loads DATABASE_URL + schema
//   node ../.agents/skills/149-flight-copy/scripts/flight-copy.mjs \
//     --source-month=2026-09 --target-range=2026-10:2027-03 --airline=ET,EK --schema=f8_sit_live
//   # add --execute to actually write (default is a dry-run that INSERTs then ROLLBACKs)
//
// Flags:
//   --source-month=YYYY-MM          (required) month to copy FROM (by flight.sch_dep_dt_utc)
//   --target-range=YYYY-MM:YYYY-MM  inclusive month range to copy INTO
//   --target-months=YYYY-MM,...     explicit target months (alternative to --target-range)
//   --airline=ET,EK                 (required) IATA carrier codes to copy; others are ignored
//   --schema=f8_sit_live            live schema (default: SCHEMA env, else f8_sit_live)
//   --execute                       commit the writes (omit = dry-run rollback)
//
// Dedup key (never creates a duplicate): airline + flt_num + dep_arp + arv_arp + shifted sch_dep_dt_utc.
// Copied rows get flight_flag='S' (future = scheduled), interface_flt_id=NULL, fresh audit
// (created_by/updated_by='flight-copy'). Every datetime column except created_at/updated_at is shifted.

import pg from 'pg';

const SAFE_IDENT = /^[a-z][a-z0-9_]*$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const AIRLINE_RE = /^[A-Z0-9]{2,3}$/;
const MARKER = 'flight-copy';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const dryRun = !process.argv.includes('--execute');
const sourceMonth = arg('source-month');
const targetRange = arg('target-range');
const targetMonthsArg = arg('target-months');
const airlineArg = arg('airline');
const schema = arg('schema') || process.env.SCHEMA || 'f8_sit_live';

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set — source the target service .env first.');
if (!sourceMonth || !MONTH_RE.test(sourceMonth)) fail('--source-month=YYYY-MM is required');
if (!airlineArg) fail('--airline=ET,EK is required');
if (!SAFE_IDENT.test(schema)) fail(`unsafe schema identifier: ${schema}`);

const airlines = airlineArg.split(',').map((s) => s.trim()).filter(Boolean);
for (const a of airlines) if (!AIRLINE_RE.test(a)) fail(`invalid airline code: ${a}`);

function monthIndex(m) {
  const [y, mm] = m.split('-').map(Number);
  return y * 12 + (mm - 1);
}
function monthBounds(m) {
  const [y, mm] = m.split('-').map(Number);
  const start = `${m}-01 00:00:00`;
  const next = mm === 12 ? `${y + 1}-01-01 00:00:00` : `${y}-${String(mm + 1).padStart(2, '0')}-01 00:00:00`;
  return { start, next };
}
function expandRange(start, end) {
  const out = [];
  for (let i = monthIndex(start); i <= monthIndex(end); i++) {
    out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

let targets = [];
if (targetRange) {
  const [s, e] = targetRange.split(':');
  if (!MONTH_RE.test(s) || !MONTH_RE.test(e)) fail('--target-range=YYYY-MM:YYYY-MM');
  targets = expandRange(s, e);
} else if (targetMonthsArg) {
  targets = targetMonthsArg.split(',').map((x) => x.trim());
  for (const t of targets) if (!MONTH_RE.test(t)) fail(`invalid target month: ${t}`);
} else {
  fail('provide --target-range=YYYY-MM:YYYY-MM or --target-months=YYYY-MM,...');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function introspectColumns(client) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, identity_generation, generation_expression
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'flight'
      ORDER BY ordinal_position`,
    [schema],
  );
  if (!rows.length) fail(`${schema}.flight not found`);
  const insertable = [];
  for (const r of rows) {
    const name = r.column_name;
    if (!SAFE_IDENT.test(name)) fail(`unsafe column identifier: ${name}`);
    if (r.identity_generation || r.generation_expression) continue; // skip id / generated
    insertable.push({ name, type: r.data_type });
  }
  return insertable;
}

// SELECT expression for one column, given the month offset placeholder ($4).
function selectExpr(col) {
  const n = col.name;
  if (n === 'created_at' || n === 'updated_at') return 'now()';
  if (n === 'created_by' || n === 'updated_by') return '$5';
  if (n === 'interface_flt_id') return 'NULL';
  if (n === 'flight_flag') return `'S'`;
  if (n === 'flt_dt' || col.type === 'date') return `(s.${n} + make_interval(months => $4::int))::date`;
  if (col.type.startsWith('timestamp')) return `s.${n} + make_interval(months => $4::int)`;
  return `s.${n}`;
}

async function run() {
  const client = await pool.connect();
  try {
    const cols = await introspectColumns(client);
    const colList = cols.map((c) => c.name).join(', ');
    const selList = cols.map(selectExpr).join(', ');

    const src = monthBounds(sourceMonth);
    const { rows: candRows } = await client.query(
      `SELECT count(*)::int n FROM ${schema}.flight
        WHERE airline = ANY($1) AND sch_dep_dt_utc >= $2 AND sch_dep_dt_utc < $3`,
      [airlines, src.start, src.next],
    );
    const candidates = candRows[0].n;

    const insertSql =
      `INSERT INTO ${schema}.flight (${colList})\n` +
      `SELECT ${selList}\n` +
      `  FROM ${schema}.flight s\n` +
      ` WHERE s.airline = ANY($1) AND s.sch_dep_dt_utc >= $2 AND s.sch_dep_dt_utc < $3\n` +
      // Skip source days that do not exist in the target month (e.g. copying a 30/31-day month
      // into February). Without this, make_interval CLAMPS day-29/30/31 onto the last target day,
      // collapsing several source days of a daily flight onto one date -> duplicate keys. A flight
      // on a day the target month lacks simply has no equivalent, so it is dropped, not clamped.
      `   AND extract(day from s.sch_dep_dt_utc) = extract(day from (s.sch_dep_dt_utc + make_interval(months => $4::int)))\n` +
      `   AND NOT EXISTS (\n` +
      `     SELECT 1 FROM ${schema}.flight t\n` +
      `      WHERE t.airline = s.airline\n` +
      `        AND t.flt_num IS NOT DISTINCT FROM s.flt_num\n` +
      `        AND t.dep_arp IS NOT DISTINCT FROM s.dep_arp\n` +
      `        AND t.arv_arp IS NOT DISTINCT FROM s.arv_arp\n` +
      `        AND t.sch_dep_dt_utc = s.sch_dep_dt_utc + make_interval(months => $4::int))`;

    console.log(`flight-copy ${dryRun ? '(DRY-RUN — rolled back)' : '(EXECUTE)'}`);
    console.log(`  schema=${schema}  airlines=[${airlines.join(',')}]  source=${sourceMonth} (${candidates} source flights)`);
    console.log(`  targets=${targets.join(', ')}\n`);

    await client.query('BEGIN');
    // Resync the IDENTITY sequence to max(id) — imported rows can leave it lagging, which would
    // collide on INSERT (see skill 142). setval is non-transactional, so it is safe/correct even
    // under a dry-run rollback; advancing a sequence forward is always harmless.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${schema}.flight','id'), (SELECT max(id) FROM ${schema}.flight))`,
    );

    let totalInserted = 0;
    const report = [];
    for (const tm of targets) {
      const off = monthIndex(tm) - monthIndex(sourceMonth);
      if (off <= 0) fail(`target ${tm} is not after source ${sourceMonth}`);
      const res = await client.query(insertSql, [airlines, src.start, src.next, off, MARKER]);
      const inserted = res.rowCount;
      totalInserted += inserted;
      // skipped = candidates not inserted: either a pre-existing dedup match OR a source day
      // that does not exist in this (shorter) target month.
      report.push({ target: tm, offset_months: off, candidates, inserted, skipped: candidates - inserted });
    }

    console.table(report);
    console.log(`TOTAL new flights ${dryRun ? 'that WOULD be created' : 'created'}: ${totalInserted}`);

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\nDRY-RUN rolled back — nothing written. Re-run with --execute to commit.');
    } else {
      await client.query('COMMIT');
      console.log('\nCOMMITTED. Remember to invalidate live-server caches (see SKILL.md).');
    }
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
