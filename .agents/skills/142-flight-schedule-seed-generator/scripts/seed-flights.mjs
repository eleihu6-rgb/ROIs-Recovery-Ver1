#!/usr/bin/env node
// Idempotent flight schedule seed generator — inserts `flight` rows for a themed
// carrier/fleet/route set over a date range (no scraping — see SKILL.md for why).
// Usage:
//   node seed-flights.mjs <config.json> [--dry-run] [--as-of=YYYY-MM-DD]
// Requires DATABASE_URL in the environment (source the target service .env first).

import pg from 'pg';
import fs from 'node:fs';

const configPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const asOfArg = process.argv.find((a) => a.startsWith('--as-of='));
const asOf = asOfArg ? asOfArg.slice('--as-of='.length) : new Date().toISOString().slice(0, 10);

if (!configPath) {
  console.error('Usage: node seed-flights.mjs <config.json> [--dry-run] [--as-of=YYYY-MM-DD]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — source the target service .env first.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Normalize both fixture shapes into a flat list of { fleet, routes } groups —
// the EK fixture puts routes directly under one fleet, the ET fixture has
// multiple fleets (B787 long-haul + 737 regional) sharing one base/airline.
function fleetGroups(cfg) {
  if (Array.isArray(cfg.fleets)) return cfg.fleets;
  return [{ fleet: cfg.fleet, routes: cfg.routes }];
}

function eachDate(startIso, endIso) {
  const dates = [];
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// `airport.utc_standard_offset` is a fixed non-DST offset — using it directly produces a
// 1h error for zones that observe DST during Aug-Sep (e.g. Europe/London is BST +60, not
// standard GMT 0; America/New_York is EDT -240, not standard EST -300). Compute the real
// offset for the given date from the IANA `zone_id` instead (built into Node/ICU, no new
// dependency): format the same instant in the target zone vs UTC and diff the wall clocks.
function tzOffsetMinutesForDate(zoneId, dateIso) {
  const instant = new Date(`${dateIso}T12:00:00Z`); // representative instant for that local date
  // Read the GMT offset directly from Intl's formatted output instead of round-tripping
  // through `new Date(localeString)` — that round-trip silently reinterprets the string
  // using the *runtime's* local timezone (e.g. America/Vancouver in CI), corrupting the diff.
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: zoneId, timeZoneName: 'longOffset', hour: '2-digit' });
  const tzName = dtf.formatToParts(instant).find((p) => p.type === 'timeZoneName').value; // "GMT+01:00"
  const m = tzName.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

// localDate + "HH:MM" in the departure airport's actual (DST-aware) offset for that date -> UTC Date.
function localToUtc(dateIso, hhmm, zoneId) {
  const [h, m] = hhmm.split(':').map(Number);
  const offsetMin = tzOffsetMinutesForDate(zoneId, dateIso);
  const utcMs = Date.parse(`${dateIso}T00:00:00Z`) + (h * 60 + m - offsetMin) * 60_000;
  return new Date(utcMs);
}

async function loadAirportOffsets(client, codes) {
  const { rows } = await client.query(
    'select airport, zone_id from airport where airport = any($1)',
    [codes]
  );
  const missing = codes.filter((c) => !rows.some((r) => r.airport === c));
  if (missing.length) {
    throw new Error(`airport(s) not found, add them first: ${missing.join(', ')}`);
  }
  const withoutZone = rows.filter((r) => !r.zone_id);
  if (withoutZone.length) {
    throw new Error(`airport(s) missing zone_id: ${withoutZone.map((r) => r.airport).join(', ')}`);
  }
  return Object.fromEntries(rows.map((r) => [r.airport, r.zone_id]));
}

function buildRow({ airline, fleet, flightAssignment, flt_num, depArp, arvArp, date, depLocal, blockMin, offsets, asOf }) {
  const schDep = localToUtc(date, depLocal, offsets[depArp]);
  const schArv = new Date(schDep.getTime() + blockMin * 60_000);
  const flightFlag = date <= asOf ? 'A' : 'S';
  return {
    airline,
    flt_dt: date,
    flt_dt_utc: schDep.toISOString().slice(0, 10),
    flt_num,
    dep_arp: depArp,
    arv_arp: arvArp,
    sch_dep_dt_utc: schDep.toISOString(),
    sch_arv_dt_utc: schArv.toISOString(),
    // Synthetic demo data has no independent "actual" ops feed — actual times mirror
    // schedule, and flight_flag distinguishes already-elapsed (A) vs upcoming (S) dates.
    act_dep_dt_utc: schDep.toISOString(),
    act_arv_dt_utc: schArv.toISOString(),
    act_dep_arp: depArp,
    act_arv_arp: arvArp,
    flight_flag: flightFlag,
    flight_assignment: flightAssignment ?? null,
    blk_min: blockMin,
    fleet,
    // No real tail is discoverable for schedule-only (and mostly future) dates — left
    // null on purpose. The Gantt Flight pane already groups untailed flights by fleet
    // (see gantt/src/stores/flight-store.ts upsertFlight), so this renders as one
    // `[fleet]` row per fleet instead of one row per flight.
    register: null,
    seg_type: 'I',
    flt_type: 'PAX',
    voyage_status: 0,
    is_locked: 0,
    sch_id: 0,
    vr_add: 0,
    scenario_id: 0,
    is_deleted: 0,
    manual_comp_flag: 0,
    flight_key: `${flt_num}-${date}-${depArp}`,
  };
}

async function existingFlightKeys(client, airline, startIso, endIso) {
  const { rows } = await client.query(
    'select flight_key from flight where airline = $1 and flt_dt between $2 and $3',
    [airline, startIso, endIso]
  );
  return new Set(rows.map((r) => r.flight_key));
}

const COLUMNS = [
  'airline', 'flt_dt', 'flt_dt_utc', 'flt_num', 'dep_arp', 'arv_arp',
  'sch_dep_dt_utc', 'sch_arv_dt_utc', 'act_dep_dt_utc', 'act_arv_dt_utc',
  'act_dep_arp', 'act_arv_arp', 'flight_flag', 'flight_assignment', 'blk_min',
  'fleet', 'register', 'seg_type', 'flt_type', 'voyage_status', 'is_locked',
  'sch_id', 'vr_add', 'scenario_id', 'is_deleted', 'manual_comp_flag', 'flight_key',
];

async function insertRows(client, rows) {
  if (!rows.length) return;
  const CHUNK = 200; // keep each statement's placeholder count sane
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const tuples = chunk.map((row, ri) => {
      const placeholders = COLUMNS.map((_, ci) => `$${ri * COLUMNS.length + ci + 1}`);
      values.push(...COLUMNS.map((c) => row[c]));
      return `(${placeholders.join(',')})`;
    });
    await client.query(
      `insert into flight (${COLUMNS.join(',')}) values ${tuples.join(',')}`,
      values
    );
  }
}

async function seedCarrier(client, cfg) {
  const groups = fleetGroups(cfg);
  const allAirports = new Set([cfg.base]);
  for (const g of groups) for (const r of g.routes) allAirports.add(r.otherAirport);
  const offsets = await loadAirportOffsets(client, [...allAirports]);

  const dates = eachDate(cfg.dateRange.start, cfg.dateRange.end);
  const existing = await existingFlightKeys(client, cfg.airline, cfg.dateRange.start, cfg.dateRange.end);

  const rows = [];
  for (const group of groups) {
    for (const route of group.routes) {
      for (const date of dates) {
        const out = buildRow({
          airline: cfg.airline,
          fleet: group.fleet,
          flightAssignment: cfg.flightAssignment,
          flt_num: route.out.fltNum,
          depArp: cfg.base,
          arvArp: route.otherAirport,
          date,
          depLocal: route.out.depLocal,
          blockMin: route.out.blockMin,
          offsets,
          asOf,
        });
        const inbound = buildRow({
          airline: cfg.airline,
          fleet: group.fleet,
          flightAssignment: cfg.flightAssignment,
          flt_num: route.in.fltNum,
          depArp: route.otherAirport,
          arvArp: cfg.base,
          date,
          depLocal: route.in.depLocal,
          blockMin: route.in.blockMin,
          offsets,
          asOf,
        });
        for (const row of [out, inbound]) {
          if (existing.has(row.flight_key)) continue;
          rows.push(row);
        }
      }
    }
  }

  console.log(`\n=== ${cfg.airline} (${groups.map((g) => g.fleet).join('/')}) ===`);
  console.log(`  ${dates.length} days x routes -> ${rows.length} new rows (${existing.size} already existed, skipped)`);
  if (dryRun) {
    console.log('  [dry-run] sample row:', rows[0]);
    return;
  }
  await insertRows(client, rows);
  console.log(`  inserted ${rows.length}`);
}

async function main() {
  const client = await pool.connect();
  try {
    await seedCarrier(client, config);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
