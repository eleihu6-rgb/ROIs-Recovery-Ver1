// ruletool.mjs — populate scenario.crew_manday_* from a solver result, two ways:
//
//   node scripts/ruletool.mjs <scenarioId> gz <input.gz> <output.gz>   compute from the gz, write
//   node scripts/ruletool.mjs <scenarioId> roster                      recompute from scenario.roster_flight, write
//   node scripts/ruletool.mjs <scenarioId> compare <input.gz> <output.gz>
//                                                                      compute BOTH, diff, prove they match (no write)
//
// Both paths feed the SAME Rust `ruletool` binary (7502/8002 credit model) and must
// produce identical manday rows. Credit: flying = gz/roster duty_act_credited_minutes
// (MAX per pairing-duty); ground = assignment fixed_credit_min only.
// Routed by crew.division ('P'→fd, else→cc_am).

import 'dotenv/config'
import pg from 'pg'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUST_BIN = path.resolve(__dirname, '../../rule-engine-rs/target/release/ruletool')
const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  throw new Error('DATABASE_URL is required')
}
const LIVE_SCHEMA = process.env.LIVE_SCHEMA ?? 'f8'
const SCENARIO_SCHEMA = process.env.SCENARIO_SCHEMA ?? 'scenario'
const rewriteSql = (text) => text.replaceAll('f8.', `${LIVE_SCHEMA}.`).replaceAll('scenario.', `${SCENARIO_SCHEMA}.`)

const [scenarioIdArg, mode, inputPath, outputPath] = process.argv.slice(2)
const SCENARIO_ID = Number(scenarioIdArg)
if (!SCENARIO_ID || !['gz', 'roster', 'compare'].includes(mode)) {
  console.error('usage: node scripts/ruletool.mjs <scenarioId> gz|roster|compare [<input.gz> <output.gz>]')
  process.exit(2)
}
if ((mode === 'gz' || mode === 'compare') && (!inputPath || !outputPath)) {
  console.error(`mode "${mode}" needs <input.gz> <output.gz>`)
  process.exit(2)
}

// ── shared helpers ────────────────────────────────────────────────────────────
function parseSections(buf) {
  const text = gunzipSync(buf).toString('utf-8')
  const sections = {}; let cur = null, header = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) { cur = line.slice(3).trim(); header = []; sections[cur] = [] }
    else if (!line || !cur) continue
    else if (header.length === 0) header = line.split(',')
    else { const cells = line.split(','); const row = {}; header.forEach((h, i) => row[h] = cells[i] ?? ''); sections[cur].push(row) }
  }
  return sections
}
// gz timestamps are UTC but unsuffixed ("2026-06-01T12:49:00"); pin them to UTC so date
// bucketing matches the roster path (whose pg timestamps round-trip as ...Z).
const asUtc = (s) => {
  if (!s) return null
  const t = String(s).replace(' ', 'T')
  return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'
}
const toLocalDate = (utcIso, zoneId) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zoneId, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(utcIso))
  } catch { return String(utcIso).slice(0, 10) }
}

async function resolveZoneOf(db, crewMeta) {
  const bases = [...new Set([...crewMeta.values()].map((m) => m.base).filter(Boolean))]
  const tz = new Map()
  if (bases.length) {
    const rows = await db.query(`select airport, zone_id from f8.airport where airport = any($1)`, [bases])
    for (const r of rows.rows) if (r.zone_id) tz.set(r.airport, r.zone_id)
  }
  return (crewId) => tz.get(crewMeta.get(crewId)?.base) ?? 'UTC'
}
async function loadAsgDefs(db) {
  const m = new Map()
  const rows = await db.query(`select assignment, fixed_credit_min from f8.assignment`)
  for (const r of rows.rows) m.set(r.assignment, {
    fixed: r.fixed_credit_min == null ? -1 : Number(r.fixed_credit_min),
  })
  return m
}

// ── source A: the gz pair ───────────────────────────────────────────────────
// Intermediate shape: { crewMeta: Map(crew→{division,base}),
//   flyingDuties: [{crewId, creditMin, startUtc}], groundItems: [{crewId, assignment, startUtc, endUtc}] }
function loadFromGz(inPath, outPath) {
  const inp = parseSections(readFileSync(inPath))
  const out = parseSections(readFileSync(outPath))
  const crewMeta = new Map()
  for (const r of inp.crew ?? []) crewMeta.set(r.crew_id, { division: r.division || '', base: '' })
  const bestEff = new Map()
  for (const r of inp.crew_base ?? []) {
    const e = r.eff_dt ?? ''; const c = bestEff.get(r.crew_id)
    if (!c || e > c) { bestEff.set(r.crew_id, e); const m = crewMeta.get(r.crew_id); if (m) m.base = r.base }
  }
  // per (pairing,duty): MAX credit + MIN segment start
  const duty = new Map()
  const pairingDuties = new Map()
  for (const s of inp.pairing_segment ?? []) {
    const k = `${s.pairing_id}:${s.duty_seq}`
    const credit = Number(s.duty_act_credited_minutes || 0)
    const start = asUtc(s.sch_str_dt_utc)
    const ex = duty.get(k)
    if (!ex) duty.set(k, { credit, start })
    else { if (credit > ex.credit) ex.credit = credit; if (start && (!ex.start || start < ex.start)) ex.start = start }
    const set = pairingDuties.get(String(s.pairing_id)) ?? new Set(); set.add(String(s.duty_seq)); pairingDuties.set(String(s.pairing_id), set)
  }
  const flyingDuties = []
  for (const a of out.ASSIGNMENTS ?? []) {
    if (!crewMeta.has(a.crew_id)) continue
    const duties = pairingDuties.get(String(a.pairing_id)); if (!duties) continue
    for (const seq of duties) {
      const d = duty.get(`${a.pairing_id}:${seq}`); if (!d || !d.start) continue
      flyingDuties.push({ crewId: a.crew_id, creditMin: Math.round(d.credit), startUtc: d.start })
    }
  }
  const groundItems = []
  for (const r of out.ROSTER ?? []) {
    if (!r.crew_id || !(r.source === 'CR' || r.source === 'leadin' || !r.source)) continue
    if (!r.sch_str_dt_utc || !r.sch_end_dt_utc) continue
    groundItems.push({ crewId: r.crew_id, assignment: r.assignment || r.assignment_group || '', startUtc: asUtc(r.sch_str_dt_utc), endUtc: asUtc(r.sch_end_dt_utc) })
  }
  return { crewMeta, flyingDuties, groundItems }
}

// ── source B: the persisted scenario.roster_flight ───────────────────────────
async function loadFromRoster(db, scenarioId) {
  // crew meta from live crew/crew_base (scenario reuses live crew), limited to crews in this scenario
  const crewIdsRes = await db.query(`select distinct crew_id from scenario.roster_flight where scenario_id=$1`, [scenarioId])
  const crewIds = crewIdsRes.rows.map((r) => r.crew_id)
  const crewMeta = new Map()
  if (crewIds.length) {
    const cr = await db.query(`select crew_id, division from f8.crew where crew_id = any($1)`, [crewIds])
    for (const r of cr.rows) crewMeta.set(r.crew_id, { division: r.division || '', base: '' })
    const cb = await db.query(
      `select distinct on (crew_id) crew_id, base from f8.crew_base where crew_id = any($1) order by crew_id, eff_dt desc`, [crewIds])
    for (const r of cb.rows) { const m = crewMeta.get(r.crew_id) ?? { division: '', base: '' }; m.base = r.base; crewMeta.set(r.crew_id, m) }
  }
  // flying: one entry per (crew,pairing,duty) — MAX credit, MIN start (mirrors gz duty bucketing).
  // Read timestamps as UTC wall-clock TEXT — the column is `timestamp` (no tz) holding UTC, and
  // node-pg would otherwise reinterpret it in machine-local time, shifting near-midnight dates.
  const TS = (c) => `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS')`
  const fly = await db.query(
    `select crew_id, max(act_credited_minutes) credit, ${TS('min(sch_str_dt_utc)')} start_utc
       from scenario.roster_flight where scenario_id=$1 and pairing_id is not null and is_deleted=0
      group by crew_id, pairing_id, duty_seq`, [scenarioId])
  const flyingDuties = fly.rows.map((r) => ({ crewId: r.crew_id, creditMin: Math.round(Number(r.credit || 0)), startUtc: asUtc(r.start_utc) }))
  // ground: pairing_id null rows
  const gnd = await db.query(
    `select crew_id, assignment, assignment_group, ${TS('sch_str_dt_utc')} s, ${TS('sch_end_dt_utc')} e
       from scenario.roster_flight where scenario_id=$1 and pairing_id is null and is_deleted=0`, [scenarioId])
  const groundItems = gnd.rows.map((r) => ({
    crewId: r.crew_id, assignment: r.assignment || r.assignment_group || '',
    startUtc: asUtc(r.s), endUtc: asUtc(r.e),
  }))
  return { crewMeta, flyingDuties, groundItems }
}

// ── intermediate → activity TSV → Rust ───────────────────────────────────────
function buildTsv({ crewMeta, flyingDuties, groundItems }, zoneOf, asgDefs) {
  const tsv = []
  for (const f of flyingDuties) {
    const m = crewMeta.get(f.crewId); if (!m || !f.startUtc) continue
    const date = toLocalDate(f.startUtc, zoneOf(f.crewId))
    tsv.push(`${f.crewId}\t${m.division}\t${date}\tFLY\t${f.creditMin}\t-1\t0\t`)
  }
  for (const g of groundItems) {
    const m = crewMeta.get(g.crewId); if (!m || !g.startUtc || !g.endUtc) continue
    const dutyMin = Math.round((new Date(g.endUtc) - new Date(g.startUtc)) / 60000)
    const code = (g.assignment || '').toUpperCase()
    const def = asgDefs.get(g.assignment) || asgDefs.get(code) || { fixed: -1 }
    const flag = code === 'DO' ? 'DO' : code === 'VAC' ? 'VAC' : code === 'ILL' ? 'ILL' : ''
    const date = toLocalDate(g.startUtc, zoneOf(g.crewId))
    tsv.push(`${g.crewId}\t${m.division}\t${date}\tGND\t${dutyMin}\t${def.fixed}\t0\t${flag}`)
  }
  return tsv
}
function runRust(tsv) {
  const res = spawnSync(RUST_BIN, ['--band-min', '3900', '--band-max', '4500'], { input: tsv.join('\n'), encoding: 'utf-8', maxBuffer: 1 << 28 })
  if (res.status !== 0) { console.error('ruletool failed:', res.stderr); process.exit(1) }
  process.stderr.write(res.stderr)
  const D = [], M = [], Y = []
  for (const line of res.stdout.split('\n')) {
    if (!line) continue
    const f = line.split('\t')
    if (f[0] === 'D') D.push(f); else if (f[0] === 'M') M.push(f); else if (f[0] === 'Y') Y.push(f)
  }
  return { D, M, Y }
}

// ── upsert ────────────────────────────────────────────────────────────────────
async function tableCols(db, t) {
  const r = await db.query(`select column_name from information_schema.columns where table_schema='scenario' and table_name=$1`, [t])
  return new Set(r.rows.map((x) => x.column_name))
}
async function loadGrain(db, rows, fdTable, ccTable, mapRow) {
  const fdCols = await tableCols(db, fdTable), ccCols = await tableCols(db, ccTable)
  const buckets = { [fdTable]: [], [ccTable]: [] }
  for (const f of rows) {
    const isFd = f[2] === 'P'
    const present = isFd ? fdCols : ccCols
    const rec = mapRow(f, isFd)
    const cols = Object.keys(rec).filter((c) => present.has(c))
    buckets[isFd ? fdTable : ccTable].push({ cols, vals: cols.map((c) => rec[c]) })
  }
  for (const [table, data] of Object.entries(buckets)) {
    await db.query(`delete from scenario.${table} where scenario_id=$1`, [SCENARIO_ID])
    if (!data.length) continue
    const cols = data[0].cols, B = 500
    for (let i = 0; i < data.length; i += B) {
      const chunk = data.slice(i, i + B), vals = [], ph = []
      chunk.forEach((row, j) => { const base = j * cols.length; ph.push('(' + cols.map((_, k) => `$${base + k + 1}`).join(',') + ')'); vals.push(...row.vals) })
      await db.query(`insert into scenario.${table} (${cols.join(',')}) values ${ph.join(',')}`, vals)
    }
    console.log(`  ${table}: ${data.length} rows`)
  }
}
async function writeAll(db, { D, M, Y }) {
  const mk = (f, isFd) => ({
    scenario_id: SCENARIO_ID, crew_id: f[1],
    blh: Number(f[4]), credit: Number(f[5]), is_day_off: Number(f[6]),
    ...(isFd ? { is_al: Number(f[7]) } : { is_leave: Number(f[8]) }),
    created_by: 'ruletool', updated_by: 'ruletool',
  })
  await db.query('begin')
  try {
    await loadGrain(db, D, 'crew_manday_fd_daily', 'crew_manday_cc_am_daily', (f, fd) => ({ ...mk(f, fd), crew_base_dt: f[3] }))
    await loadGrain(db, M, 'crew_manday_fd_monthly', 'crew_manday_cc_am_monthly', (f, fd) => ({ ...mk(f, fd), year_month: f[3] }))
    await loadGrain(db, Y, 'crew_manday_fd_yearly', 'crew_manday_cc_am_yearly', (f, fd) => ({ ...mk(f, fd), year: f[3] }))
    await db.query('commit'); console.log('COMMIT ok')
  } catch (e) { await db.query('rollback'); console.error('UPSERT FAILED, rolled back:', e.message); process.exit(1) }
}

// ── compare two Rust outputs (daily + monthly) ────────────────────────────────
function diff(a, b, grain, keyIdx, valIdxs, labels) {
  const key = (f) => `${f[1]}|${f[keyIdx]}`
  const ma = new Map(a.map((f) => [key(f), f])), mb = new Map(b.map((f) => [key(f), f]))
  const allKeys = new Set([...ma.keys(), ...mb.keys()])
  let mism = 0; const samples = []
  for (const k of allKeys) {
    const fa = ma.get(k), fb = mb.get(k)
    if (!fa || !fb) { mism++; if (samples.length < 8) samples.push(`${grain} ${k}: ${!fa ? 'missing in gz' : 'missing in roster'}`); continue }
    for (let i = 0; i < valIdxs.length; i++) {
      if (String(fa[valIdxs[i]]) !== String(fb[valIdxs[i]])) {
        mism++; if (samples.length < 8) samples.push(`${grain} ${k} ${labels[i]}: gz=${fa[valIdxs[i]]} roster=${fb[valIdxs[i]]}`); break
      }
    }
  }
  return { total: allKeys.size, mism, samples }
}

// ── main ──────────────────────────────────────────────────────────────────────
const rawDb = new pg.Client({ connectionString: DB_URL })
const db = {
  connect: () => rawDb.connect(),
  end: () => rawDb.end(),
  query: (text, params) => rawDb.query(rewriteSql(text), params),
}
await db.connect()
const asgDefs = await loadAsgDefs(db)

if (mode === 'compare') {
  const gz = loadFromGz(inputPath, outputPath)
  const ro = await loadFromRoster(db, SCENARIO_ID)
  console.log(`gz:     ${gz.flyingDuties.length} flying-duties, ${gz.groundItems.length} ground, ${gz.crewMeta.size} crew`)
  console.log(`roster: ${ro.flyingDuties.length} flying-duties, ${ro.groundItems.length} ground, ${ro.crewMeta.size} crew`)
  const zoneGz = await resolveZoneOf(db, gz.crewMeta)
  const zoneRo = await resolveZoneOf(db, ro.crewMeta)
  const a = runRust(buildTsv(gz, zoneGz, asgDefs))
  const b = runRust(buildTsv(ro, zoneRo, asgDefs))
  // daily: blh(4) credit(5) is_do(6) is_al(7) is_leave(8); monthly key idx 3 = ym, daily key idx 3 = date
  const dDiff = diff(a.D, b.D, 'daily', 3, [4, 5, 6, 7, 8], ['blh', 'credit', 'is_do', 'is_al', 'is_leave'])
  const mDiff = diff(a.M, b.M, 'monthly', 3, [4, 5, 6, 7, 8], ['blh', 'credit', 'do_cnt', 'al_cnt', 'leave_cnt'])
  console.log(`\nDAILY  : ${dDiff.total} keys, ${dDiff.mism} mismatched`)
  console.log(`MONTHLY: ${mDiff.total} keys, ${mDiff.mism} mismatched`)
  for (const s of [...dDiff.samples, ...mDiff.samples]) console.log('  ⚠ ' + s)
  const ok = dDiff.mism === 0 && mDiff.mism === 0
  console.log(ok ? '\n✅ PASS — gz and roster paths produce identical manday' : '\n❌ FAIL — paths diverge')
  await db.end(); process.exit(ok ? 0 : 1)
}

// roster → delegate the WRITE to the unified driver (one tool for Live + Scenario), so this
// dev CLI never drifts from production. `compare` above still uses the local roster reader to
// audit gz-vs-roster parity; only the roster→DB write path is unified.
if (mode === 'roster') {
  await db.end()
  const { spawnSync } = await import('node:child_process')
  const res = spawnSync('npx', ['tsx', 'scripts/manday-recompute.ts', String(SCENARIO_ID)], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: DB_URL },
  })
  process.exit(res.status ?? 1)
}

// gz → compute + write + verify (reads the solver gz files, not roster_flight)
const src = loadFromGz(inputPath, outputPath)
console.log(`[${mode}] ${src.flyingDuties.length} flying-duties, ${src.groundItems.length} ground, ${src.crewMeta.size} crew`)
const zoneOf = await resolveZoneOf(db, src.crewMeta)
const result = runRust(buildTsv(src, zoneOf, asgDefs))
console.log(`rust → ${result.D.length} daily, ${result.M.length} monthly, ${result.Y.length} yearly rows`)
await writeAll(db, result)
for (const t of ['crew_manday_fd_daily', 'crew_manday_fd_monthly', 'crew_manday_fd_yearly', 'crew_manday_cc_am_daily', 'crew_manday_cc_am_monthly', 'crew_manday_cc_am_yearly']) {
  const r = await db.query(`select count(*)::int n, count(distinct crew_id)::int crews, coalesce(sum(credit),0)::int credit_min, coalesce(sum(blh),0)::int blh_min from scenario.${t} where scenario_id=$1`, [SCENARIO_ID])
  console.log(`scenario.${t}: ${JSON.stringify(r.rows[0])}`)
}
await db.end()
