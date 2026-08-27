// load-scenario-roster.mjs — load a solver gz pair into scenario.roster_flight.
//
//   node scripts/load-scenario-roster.mjs <scenarioId> <input.gz> <output.gz>
//
// Builds scenario.roster_flight rows from the ## format gz: each optimizer ASSIGNMENT
// (crew→pairing) expands into one row per pairing segment (flt_id/duty_seq/seg_seq/times/
// credit from input.gz pairing_segment); each ROSTER ground item becomes a pairing_id=NULL
// row. base from crew_base (latest eff), flight_acting_rank from the assignment/crew rank.
// Idempotent: deletes scenario_id first. (manday is a separate step — see ruletool.mjs.)

import 'dotenv/config'
import pg from 'pg'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const [scenarioIdArg, inputPath, outputPath] = process.argv.slice(2)
const SCENARIO_ID = Number(scenarioIdArg)
if (!SCENARIO_ID || !inputPath || !outputPath) {
  console.error('usage: node scripts/load-scenario-roster.mjs <scenarioId> <input.gz> <output.gz>')
  process.exit(2)
}
const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  throw new Error('DATABASE_URL is required')
}
const LIVE_SCHEMA = process.env.LIVE_SCHEMA ?? 'f8'
const SCENARIO_SCHEMA = process.env.SCENARIO_SCHEMA ?? 'scenario'
const rewriteSql = (text) => text.replaceAll('f8.', `${LIVE_SCHEMA}.`).replaceAll('scenario.', `${SCENARIO_SCHEMA}.`)
const makeDb = (client) => ({
  connect: () => client.connect(),
  end: () => client.end(),
  query: (text, params) => client.query(rewriteSql(text), params),
})

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
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const dt = (v) => (v && String(v).trim() ? String(v).trim() : null)

const inp = parseSections(readFileSync(inputPath))
const out = parseSections(readFileSync(outputPath))

const crewBase = new Map(), bestEff = new Map()
for (const r of inp.crew_base ?? []) { const e = r.eff_dt ?? ''; const c = bestEff.get(r.crew_id); if (!c || e > c) { bestEff.set(r.crew_id, e); crewBase.set(r.crew_id, r.base) } }
const crewRank = new Map()
for (const r of inp.crew_rank ?? []) if (!crewRank.has(r.crew_id)) crewRank.set(r.crew_id, r.rank)
const pairingById = new Map()
for (const r of inp.pairing ?? []) pairingById.set(String(r.id), r)
const segsByPairing = new Map()
for (const s of inp.pairing_segment ?? []) { const k = String(s.pairing_id); (segsByPairing.get(k) ?? segsByPairing.set(k, []).get(k)).push(s) }

const rows = []
for (const a of out.ASSIGNMENTS ?? []) {
  const p = pairingById.get(String(a.pairing_id))
  for (const s of segsByPairing.get(String(a.pairing_id)) ?? []) {
    rows.push({
      crew_id: a.crew_id, pairing_id: num(a.pairing_id),
      base: crewBase.get(a.crew_id) || p?.base || 'UNK',
      assignment_group: p?.assignment_group || 'FLT', assignment: p?.assignment || 'FLT', source: a.source === 'leadin' ? 'leadin' : 'CR',
      flight_acting_rank: (a.acting_rank || crewRank.get(a.crew_id) || 'NA').slice(0, 10),
      roster_acting_rank: (a.acting_rank || '').slice(0, 10) || null, division: p?.division || null,
      flt_id: num(s.flt_id), duty_seq: num(s.duty_seq), seg_seq: num(s.seg_seq), flt_dt: dt(s.flt_dt),
      sch_str_dt_utc: dt(s.sch_str_dt_utc), sch_end_dt_utc: dt(s.sch_end_dt_utc),
      act_credited_minutes: num(s.duty_act_credited_minutes),
    })
  }
}
for (const r of out.ROSTER ?? []) {
  if (!r.crew_id || !(r.source === 'CR' || r.source === 'leadin' || !r.source)) continue
  rows.push({
    crew_id: r.crew_id, pairing_id: null, base: crewBase.get(r.crew_id) || 'UNK',
    assignment_group: r.assignment_group || 'GRD', assignment: r.assignment || r.assignment_group || 'GRD', source: r.source === 'CR' ? 'CR' : 'leadin',
    flight_acting_rank: (r.acting_rank || crewRank.get(r.crew_id) || 'NA').slice(0, 10),
    roster_acting_rank: (r.acting_rank || '').slice(0, 10) || null, division: null,
    flt_id: null, duty_seq: null, seg_seq: null, flt_dt: null,
    sch_str_dt_utc: dt(r.sch_str_dt_utc), sch_end_dt_utc: dt(r.sch_end_dt_utc), act_credited_minutes: null,
  })
}
console.log(`built ${rows.length} roster_flight rows (${rows.filter(r => r.pairing_id).length} flying, ${rows.filter(r => !r.pairing_id).length} ground)`)

const db = makeDb(new pg.Client({ connectionString: DB_URL }))
await db.connect()

// Mirror live: ground duties' assignment_group must be the canonical group (VAC → GRD),
// not the solver's per-code value. Resolve from f8.assignment_group_map (prefer GRD, else
// first non-FLY). Keeps scenario.roster_flight consistent with the TS result loader.
{
  const r = await db.query(`select upper(a.assignment) code, array_agg(g.assignment_group) groups
     from f8.assignment a join f8.assignment_group_map m on m.assignment_id=a.id
     join f8.assignment_group g on g.id=m.assignment_group_id group by upper(a.assignment)`)
  const gg = new Map()
  for (const x of r.rows) {
    const gs = x.groups.map(String)
    const ground = gs.includes('GRD') ? 'GRD' : (gs.find((z) => z !== 'FLY') ?? gs[0])
    if (ground) gg.set(x.code, ground)
  }
  for (const row of rows) {
    if (row.pairing_id == null) row.assignment_group = gg.get(String(row.assignment).toUpperCase()) || row.assignment_group
  }
}

await db.query('begin')
try {
  await db.query('delete from scenario.roster_flight where scenario_id=$1', [SCENARIO_ID])
  const cols = ['scenario_id', 'crew_id', 'pairing_id', 'base', 'assignment_group', 'assignment', 'source', 'flight_acting_rank', 'roster_acting_rank', 'division', 'flt_id', 'duty_seq', 'seg_seq', 'flt_dt', 'sch_str_dt_utc', 'sch_end_dt_utc', 'act_credited_minutes', 'created_by', 'updated_by']
  const B = 500
  for (let i = 0; i < rows.length; i += B) {
    const chunk = rows.slice(i, i + B), vals = [], ph = []
    chunk.forEach((r, j) => {
      const base = j * cols.length
      ph.push('(' + cols.map((_, k) => `$${base + k + 1}`).join(',') + ')')
      vals.push(SCENARIO_ID, r.crew_id, r.pairing_id, r.base, r.assignment_group, r.assignment, r.source, r.flight_acting_rank, r.roster_acting_rank, r.division, r.flt_id, r.duty_seq, r.seg_seq, r.flt_dt, r.sch_str_dt_utc, r.sch_end_dt_utc, r.act_credited_minutes, 'scenario_loader', 'scenario_loader')
    })
    await db.query(`insert into scenario.roster_flight (${cols.join(',')}) values ${ph.join(',')}`, vals)
  }
  // The roster changed → bump the legality version + mark STALE so the next open recomputes
  // (scenario persisted legality; see docs/.../2026-06-15-scenario-persisted-legality-design.md §6).
  await db.query(
    `insert into scenario.legality_status (scenario_id, rule_group_code, roster_version, status)
       values ($1, coalesce((select ruleset_id from f8.scenario where id=$1), 'pbs_solver_ruleset'), 1, 'STALE')
     on conflict (scenario_id) do update
       set roster_version = scenario.legality_status.roster_version + 1, status = 'STALE', updated_at = now()`,
    [SCENARIO_ID],
  )
  await db.query('commit')
} catch (e) { await db.query('rollback'); console.error('FAILED, rolled back:', e.message); process.exit(1) }
const v = await db.query(`select count(*)::int total, count(pairing_id)::int flying, count(*) filter (where pairing_id is null)::int ground, count(distinct crew_id)::int crews from scenario.roster_flight where scenario_id=$1`, [SCENARIO_ID])
console.log(`scenario.roster_flight scenario_id=${SCENARIO_ID}:`, JSON.stringify(v.rows[0]))
await db.end()
