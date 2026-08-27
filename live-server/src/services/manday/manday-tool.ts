import type pg from 'pg'
import { runRust, type ActivityRow } from './manday-tool-rust.js'
import { splitBlhByBaseMidnight, splitDutyDpByBaseMidnight } from './manday-blh-split.js'
import { liveSchema, logicalSchema, scenarioSchema } from '../../utils/db-schema.js'
import { resolvePartitions } from '../scenario/scenario-partition.js'
import { localDateInZone } from '../../utils/zoned-time.js'

export interface RecomputeOpts {
  schema: string
  scenarioId?: number
  crewIds?: string[]
  startDt?: string // YYYY-MM-DD inclusive
  endDt?: string // YYYY-MM-DD inclusive
  updatedBy?: string
}
export interface RecomputeResult {
  crews: number
  daily: number
  monthly: number
  yearly: number
}

type Queryable = Pick<pg.Pool, 'query'>

const isDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

const asUtc = (s: string | null): string | null => {
  if (!s) return null
  const t = String(s).replace(' ', 'T')
  return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'
}
const nullableNumber = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)
const toLocalDate = (utcIso: string, zoneId: string): string => localDateInZone(utcIso, zoneId)

/**
 * Resolve which physical flight / pairing_segment tables a scenario manday recompute
 * should join. RO DONE scenarios keep `flight_scenario_id`/`pairing_scenario_id` = 0 and
 * reuse live flt_ids — joining scenario.flight would miss blk_min (BLH=0 with credit>0).
 * Mirrors resolvePartitions used by scenario Gantt DB reads.
 */
async function resolveScenarioActivityJoins(
  db: Queryable,
  scenarioId: number,
): Promise<{ flightTable: string; flightPartFilter: string; segmentTable: string; segmentPartFilter: string }> {
  const live = liveSchema()
  const ptr = await db.query(
    `SELECT COALESCE(pairing_scenario_id, 0)::int AS pairing_scenario_id,
            COALESCE(flight_scenario_id, 0)::int AS flight_scenario_id
       FROM ${live}.scenario WHERE id = $1`,
    [scenarioId],
  )
  if (!ptr.rows[0]) throw new Error(`scenario ${scenarioId} not found`)
  const parts = resolvePartitions({
    id: scenarioId,
    pairingScenarioId: Number(ptr.rows[0].pairing_scenario_id),
    flightScenarioId: Number(ptr.rows[0].flight_scenario_id),
  })
  const scen = scenarioSchema()
  // Frozen scenario copies are keyed by scenario_id; live rows are joined by id alone
  // (live flight / pairing_segment ids are what RO roster_flight.flt_id already stores).
  const flightPartFilter = parts.flightTable.startsWith(scen)
    ? ` AND f.scenario_id = ${parts.flightPart}`
    : ''
  const segmentPartFilter = parts.segmentTable.startsWith(scen)
    ? ` AND scenario_id = ${parts.pairingPart}`
    : ''
  return {
    flightTable: parts.flightTable,
    flightPartFilter,
    segmentTable: parts.segmentTable,
    segmentPartFilter,
  }
}

interface CrewBasePeriod {
  zoneId: string
  effMs: number
  expMs: number | null
  isPrime: boolean
}

interface CrewMeta {
  division: string
  base: string
  bases: CrewBasePeriod[]
}

/** Load date-effective CrewBase history. Scenario reuses live crew/base records. */
async function loadCrewMeta(db: Queryable, crewIds: string[]): Promise<Map<string, CrewMeta>> {
  const meta = new Map<string, CrewMeta>()
  if (!crewIds.length) return meta
  const live = liveSchema()
  const cr = await db.query(`SELECT crew_id, division FROM ${live}.crew WHERE crew_id = ANY($1)`, [crewIds])
  for (const r of cr.rows) meta.set(r.crew_id, { division: r.division || '', base: '', bases: [] })
  const cb = await db.query(
    `SELECT cb.crew_id, cb.base, cb.eff_dt, cb.exp_dt, cb.is_prime_base, a.zone_id
       FROM ${live}.crew_base cb
       LEFT JOIN ${live}.airport a ON a.airport = cb.base
      WHERE cb.crew_id = ANY($1)
      ORDER BY cb.crew_id, cb.eff_dt DESC, cb.is_prime_base DESC`, [crewIds])
  for (const r of cb.rows) {
    const m = meta.get(r.crew_id) ?? { division: '', base: '', bases: [] }
    const effMs = new Date(r.eff_dt).getTime()
    m.bases.push({
      zoneId: r.zone_id || 'UTC',
      effMs: Number.isFinite(effMs) ? effMs : Number.NEGATIVE_INFINITY,
      expMs: r.exp_dt ? new Date(r.exp_dt).getTime() : null,
      isPrime: Number(r.is_prime_base ?? 1) === 1,
    })
    if (!m.base) m.base = r.base
    meta.set(r.crew_id, m)
  }
  return meta
}
const zoneResolver = (meta: Map<string, CrewMeta>): ((crewId: string, utcIso?: string | null) => string) =>
  (crewId, utcIso) => {
    const m = meta.get(crewId)
    if (!m) return 'UTC'
    const atMs = utcIso ? new Date(utcIso).getTime() : Number.POSITIVE_INFINITY
    const effective = m.bases
      .filter((b) => b.effMs <= atMs && (b.expMs == null || atMs < b.expMs))
      .sort((a, b) => Number(b.isPrime) - Number(a.isPrime) || b.effMs - a.effMs)[0]
    return effective?.zoneId ?? m.bases[0]?.zoneId ?? 'UTC'
  }
async function loadAsgDefs(db: Queryable): Promise<Map<string, { fixed: number; dpPct: number }>> {
  const m = new Map<string, { fixed: number; dpPct: number }>()
  const rows = await db.query(`SELECT assignment, fixed_credit_min, dp_pct FROM ${liveSchema()}.assignment`)
  for (const r of rows.rows) m.set(String(r.assignment).toUpperCase(), {
    fixed: r.fixed_credit_min == null ? -1 : Number(r.fixed_credit_min),
    dpPct: r.dp_pct == null ? 0 : Number(r.dp_pct),
  })
  return m
}

// Read timestamps as UTC wall-clock TEXT (columns are `timestamp` w/o tz holding UTC).
const TS = (c: string): string => `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS')`

interface RosterActivity {
  // flying: one row per (crew, pairing, duty) — credit only (all on duty-start local date).
  flying: Array<{ crewId: string; creditMin: number; startUtc: string | null }>
  flyingDuties: Array<{
    crewId: string
    assignment: string
    dutyMin: number
    startUtc: string | null
    endUtc: string | null
  }>
  // flyingLegs: one row per roster_flight flying leg — BLH split at crew-base midnight.
  flyingLegs: Array<{
    crewId: string
    blkMin: number
    depUtc: string | null
    arvUtc: string | null
    hasAct: boolean
  }>
  ground: Array<{
    crewId: string
    assignment: string
    startUtc: string | null
    endUtc: string | null
    actCreditMin: number | null
    schCreditMin: number | null
    dpMin: number | null
  }>
}

async function loadActivity(db: Queryable, opts: RecomputeOpts): Promise<{ crewIds: string[]; act: RosterActivity }> {
  const sch = logicalSchema(opts.schema)
  const table = `${sch}.roster_flight`
  const where: string[] = []
  const params: unknown[] = []
  if (opts.schema === 'scenario') { params.push(opts.scenarioId); where.push(`rf.scenario_id = $${params.length}`) }
  if (opts.crewIds?.length) { params.push(opts.crewIds); where.push(`rf.crew_id = ANY($${params.length})`) }
  // The public window is a CrewBase-local calendar window. Keep a UTC guard band so
  // activities around midnight can be converted before the local-date filter below.
  if (isDate(opts.startDt)) { params.push(opts.startDt); where.push(`rf.sch_str_dt_utc >= ($${params.length}::date - INTERVAL '1 day')`) }
  if (isDate(opts.endDt)) { params.push(opts.endDt); where.push(`rf.sch_str_dt_utc < ($${params.length}::date + INTERVAL '2 days')`) }
  where.push(`rf.is_deleted = 0`)
  const W = where.join(' AND ')

  // Real block hours from flight.blk_min via roster_flight.flt_id. For scenario RO runs
  // with flight_scenario_id=0, flt_ids are live ids — join live.flight (same as Gantt).
  let flightTable = `${sch}.flight`
  let flightPartFilter = ''
  let segmentTable = `${sch}.pairing_segment`
  let segmentPartFilter = ''
  if (opts.schema === 'scenario') {
    if (opts.scenarioId == null) throw new Error('scenario loadActivity requires scenarioId')
    const joins = await resolveScenarioActivityJoins(db, opts.scenarioId)
    flightTable = joins.flightTable
    flightPartFilter = joins.flightPartFilter
    segmentTable = joins.segmentTable
    segmentPartFilter = joins.segmentPartFilter
  }

  const blkJoin = `LEFT JOIN ${flightTable} f ON f.id = rf.flt_id${flightPartFilter}`
  // FLY credit prefers roster_flight.act_credited_minutes; when null (legacy imports
  // that never wrote credit columns), fall back to pairing_segment duty credit.
  const dutyInfoJoin = `LEFT JOIN (
    SELECT DISTINCT ON (pairing_id, duty_seq)
           pairing_id, duty_seq,
           COALESCE(duty_act_credited_minutes, duty_sch_credited_minutes, 0) AS duty_credit,
           COALESCE(duty_act_duty_min, duty_sch_duty_min, 0) AS duty_min,
           COALESCE(duty_act_dp_min, duty_sch_dp_min, duty_act_duty_min, duty_sch_duty_min, 0) AS duty_dp_min,
           COALESCE(duty_act_str_dt_utc, duty_sch_str_dt_utc) AS duty_start_utc,
           COALESCE(duty_act_end_dt_utc, duty_sch_end_dt_utc) AS duty_end_utc
      FROM ${segmentTable}
     WHERE is_deleted = 0${segmentPartFilter}
     ORDER BY pairing_id, duty_seq, seg_seq
  ) ps ON ps.pairing_id = rf.pairing_id AND ps.duty_seq = rf.duty_seq`

  // Credit: duty-level (unchanged) — entire credit on duty-start local date.
  const fly = await db.query(
    `SELECT rf.crew_id, rf.assignment,
            COALESCE(ps.duty_min, 0) duty_min,
            MAX(COALESCE(rf.act_credited_minutes, ps.duty_credit, 0)) credit,
            ${TS('MIN(COALESCE(ps.duty_start_utc, rf.sch_str_dt_utc))')} start_utc,
            ${TS('MIN(COALESCE(ps.duty_end_utc, rf.sch_end_dt_utc))')} end_utc
       FROM ${table} rf ${dutyInfoJoin}
      WHERE ${W} AND rf.pairing_id IS NOT NULL
      GROUP BY rf.crew_id, rf.pairing_id, rf.duty_seq, rf.assignment, ps.duty_min`, params)
  // BLH: leg-level times from flight (act preferred) for base-midnight split.
  const legs = await db.query(
    `SELECT rf.crew_id,
            COALESCE(f.blk_min, 0) blk,
            ${TS('COALESCE(f.act_dep_dt_utc, f.sch_dep_dt_utc)')} dep_utc,
            ${TS('COALESCE(f.act_arv_dt_utc, f.sch_arv_dt_utc)')} arv_utc,
            (f.act_dep_dt_utc IS NOT NULL AND f.act_arv_dt_utc IS NOT NULL) AS has_act
       FROM ${table} rf ${blkJoin}
      WHERE ${W} AND rf.pairing_id IS NOT NULL AND rf.flt_id IS NOT NULL`, params)
  const gnd = await db.query(
    `SELECT rf.crew_id, rf.assignment, rf.assignment_group,
            rf.act_credited_minutes, rf.sch_credited_minutes, rf.dp_min,
            ${TS('rf.sch_str_dt_utc')} s, ${TS('rf.sch_end_dt_utc')} e
       FROM ${table} rf WHERE ${W} AND rf.pairing_id IS NULL`, params)

  const flying = fly.rows.map((r) => ({
    crewId: r.crew_id, creditMin: Math.round(Number(r.credit || 0)),
    startUtc: asUtc(r.start_utc),
  }))
  const flyingDuties = fly.rows.map((r) => ({
    crewId: r.crew_id,
    assignment: r.assignment || '',
    dutyMin: Math.round(Number(r.duty_min || 0)),
    startUtc: asUtc(r.start_utc),
    endUtc: asUtc(r.end_utc),
  }))
  const flyingLegs = legs.rows.map((r) => ({
    crewId: r.crew_id,
    blkMin: Math.round(Number(r.blk || 0)),
    depUtc: asUtc(r.dep_utc),
    arvUtc: asUtc(r.arv_utc),
    hasAct: Boolean(r.has_act),
  }))
  const ground = gnd.rows.map((r) => ({
    crewId: r.crew_id,
    assignment: r.assignment || r.assignment_group || '',
    startUtc: asUtc(r.s),
    endUtc: asUtc(r.e),
    actCreditMin: nullableNumber(r.act_credited_minutes),
    schCreditMin: nullableNumber(r.sch_credited_minutes),
    dpMin: nullableNumber(r.dp_min),
  }))
  const crewIds = opts.crewIds?.length
    ? opts.crewIds
    : [...new Set([...flying, ...flyingLegs, ...ground].map((x) => x.crewId))]
  return { crewIds, act: { flying, flyingDuties, flyingLegs, ground } }
}

const dateInWindow = (date: string, opts: RecomputeOpts): boolean =>
  (!isDate(opts.startDt) || date >= opts.startDt!) && (!isDate(opts.endDt) || date <= opts.endDt!)

const overlapsWindow = (startUtc: string, endUtc: string | null, zoneId: string, opts: RecomputeOpts): boolean => {
  const start = toLocalDate(startUtc, zoneId)
  if (dateInWindow(start, opts)) return true
  if (!endUtc) return false
  return dateInWindow(toLocalDate(endUtc, zoneId), opts)
}

function buildRows(
  act: RosterActivity,
  meta: Map<string, CrewMeta>,
  zoneOf: (crewId: string, utcIso?: string | null) => string,
  defs: Map<string, { fixed: number; dpPct: number }>,
  opts: RecomputeOpts,
): ActivityRow[] {
  const rows: ActivityRow[] = []
  for (const f of act.flying) {
    const m = meta.get(f.crewId)
    if (!m || !f.startUtc) continue
    const zoneId = zoneOf(f.crewId, f.startUtc)
    const localDate = toLocalDate(f.startUtc, zoneId)
    if (!dateInWindow(localDate, opts)) continue
    rows.push({ crewId: f.crewId, division: m.division, localDate, kind: 'FLY', a1: f.creditMin, a2: -1, a3: 0, flag: '' })
  }
  for (const g of act.ground) {
    const m = meta.get(g.crewId)
    if (!m || !g.startUtc || !g.endUtc) continue
    const zoneId = zoneOf(g.crewId, g.startUtc)
    const localDate = toLocalDate(g.startUtc, zoneId)
    if (!dateInWindow(localDate, opts)) continue
    const dutyMin = Math.round((new Date(g.endUtc).getTime() - new Date(g.startUtc).getTime()) / 60000)
    const code = (g.assignment || '').toUpperCase()
    const def = defs.get(code) || defs.get(g.assignment) || { fixed: -1, dpPct: 0 }
    const flag: ActivityRow['flag'] = code === 'DO' ? 'DO' : code === 'VAC' ? 'VAC' : code === 'ILL' ? 'ILL' : ''
    rows.push({
      crewId: g.crewId,
      division: m.division,
      localDate,
      kind: 'GND',
      a1: dutyMin,
      a2: def.fixed,
      a3: 0,
      flag,
      actCreditMin: g.actCreditMin,
      schCreditMin: g.schCreditMin,
      dpMin: g.dpMin,
    })
  }
  return rows
}

/**
 * Find "ghost" FD crews for the roster period covering startDt: their `crew_manday_fd_period.credit`
 * is > `minCreditMin` yet they have **no** flying duty in the window — the stale-credit signature
 * the old async recalc queue produced (e.g. crew 386: 84:25 on an empty roster). Used by the
 * admin repair. The period is identified via the denormalized rp_start/rp_end columns.
 */
export async function findStaleFdCrews(
  pool: pg.Pool,
  opts: { startDt: string; endDt: string; minCreditMin?: number },
): Promise<string[]> {
  const db = pool as unknown as Queryable
  const min = opts.minCreditMin ?? 0
  const r = await db.query(
    `SELECT m.crew_id FROM ${liveSchema()}.crew_manday_fd_period m
      WHERE m.rp_start::date <= $1::date AND m.rp_end::date >= $1::date AND m.credit > $2
        AND NOT EXISTS (
          SELECT 1 FROM ${liveSchema()}.roster_flight rf
           WHERE rf.crew_id = m.crew_id AND rf.is_deleted = 0 AND rf.pairing_id IS NOT NULL
             AND rf.sch_str_dt_utc >= $3::date AND rf.sch_str_dt_utc < ($4::date + INTERVAL '1 day'))
      ORDER BY m.crew_id`,
    [opts.startDt, min, opts.startDt, opts.endDt])
  return r.rows.map((x) => String(x.crew_id))
}

export async function recompute(pool: pg.Pool, opts: RecomputeOpts): Promise<RecomputeResult> {
  const db = pool as unknown as Queryable
  const updatedBy = opts.updatedBy ?? 'MANDAY_TOOL'
  const sch = logicalSchema(opts.schema)
  const logicalSch = opts.schema
  const scoped = !!opts.crewIds?.length
  if (logicalSch === 'scenario' && !opts.scenarioId) throw new Error('scenario recompute requires scenarioId')

  const { crewIds, act } = await loadActivity(db, opts)
  // Nothing in scope (e.g. an import window with no roster activity) → no-op.
  if (!crewIds.length) return { crews: 0, daily: 0, monthly: 0, yearly: 0 }
  const meta = await loadCrewMeta(db, crewIds)
  const zoneOf = zoneResolver(meta)
  const defs = await loadAsgDefs(db)
  const grains = runRust(buildRows(act, meta, zoneOf, defs, opts))

  // BLH: split each flying leg at crew-base local midnight (credit stays on duty-start day).
  const realBlh = new Map<string, number>()
  const realDp = new Map<string, number>()
  for (const leg of act.flyingLegs) {
    if (!leg.depUtc || !leg.arvUtc) continue
    const zoneId = zoneOf(leg.crewId, leg.depUtc)
    if (!overlapsWindow(leg.depUtc, leg.arvUtc, zoneId, opts)) continue
    const shares = splitBlhByBaseMidnight({
      depUtc: leg.depUtc,
      arvUtc: leg.arvUtc,
      blkMin: leg.blkMin,
      hasAct: leg.hasAct,
      zoneId,
    })
    for (const s of shares) {
      const key = `${leg.crewId}\t${s.localDate}`
      realBlh.set(key, (realBlh.get(key) ?? 0) + s.minutes)
    }
  }
  for (const duty of act.flyingDuties) {
    if (!duty.startUtc || !duty.endUtc) continue
    const zoneId = zoneOf(duty.crewId, duty.startUtc)
    if (!overlapsWindow(duty.startUtc, duty.endUtc, zoneId, opts)) continue
    const dpPct = defs.get(duty.assignment.toUpperCase())?.dpPct ?? 0
    const dpShares = splitDutyDpByBaseMidnight({
      startUtc: duty.startUtc,
      endUtc: duty.endUtc,
      totalDutyMinutes: duty.dutyMin,
      dpPct,
      zoneId,
    })
    for (const s of dpShares) {
      const key = `${duty.crewId}\t${s.localDate}`
      realDp.set(key, (realDp.get(key) ?? 0) + s.minutes)
    }
  }

  // blh is always recomputed from flight times / blk_min (leg split at base midnight).
  const ownsBlh = true
  const dailyBlh = (f: string[]): number => realBlh.get(`${f[1]}\t${f[3]}`) ?? 0
  const dailyDp = (f: string[]): number =>
    (realDp.get(`${f[1]}\t${f[3]}`) ?? 0) + (Number(f[9]) || 0)

  const scenFilter = logicalSch === 'scenario' ? ` AND scenario_id = ${Number(opts.scenarioId)}` : ''
  const idCol = logicalSch === 'scenario' ? 'scenario_id, ' : ''
  const idVal = logicalSch === 'scenario' ? `${Number(opts.scenarioId)}, ` : ''
  const cKey = logicalSch === 'scenario' ? 'scenario_id, crew_id' : 'crew_id'
  const winFilter = (col: string): string =>
    (isDate(opts.startDt) ? ` AND ${col} >= '${opts.startDt}'::date` : '') + (isDate(opts.endDt) ? ` AND ${col} <= '${opts.endDt}'::date` : '')
  // Always operate on a concrete crew set: caller-supplied (Live edit / repair) OR the crew
  // that had activity in the window (imports / scenario). This keeps the all-crew "full" path
  // from re-aggregating untouched crew — only window-active crew change, so the result is
  // identical to the SQL engine's all-crew rollup but far cheaper.
  const crewFilter = ` AND crew_id = ANY($1)`
  const scopeParams = [crewIds]
  const ubP = '$2' // updatedBy placeholder for scope-param statements

  // ── Daily: column-preserving. Zero credit-model cols in the window first (scoped or scenario
  //    full-rebuild) so days that lost all events drop to 0 — WITHOUT deleting rows (the live
  //    tables carry import-fed columns like fdp/per_diem). Import full mode does not zero
  //    (matches the SQL engine: it overwrites active days and re-aggregates rollups).
  const zeroFirst = scoped || logicalSch === 'scenario'
  if (zeroFirst) {
    for (const [t, flagCol] of [['crew_manday_fd_daily', 'is_al'], ['crew_manday_cc_am_daily', 'is_leave']] as const) {
      await db.query(
        `UPDATE ${sch}.${t} SET credit=0, dp=0, is_day_off=0, ${flagCol}=0${ownsBlh ? ', blh=0' : ''}, updated_by=${ubP}, updated_at=NOW()
         WHERE TRUE${scenFilter}${crewFilter}${winFilter('crew_base_dt')}`,
        [...scopeParams, updatedBy])
    }
  }

  // Batched multi-row upsert (chunked) — one round-trip per CHUNK rows, not per row, so a
  // full-mode import of hundreds of crew-days stays fast over the (remote) pool.
  const CHUNK = 500
  const upsertDaily = async (rows: string[][], t: string, flagIdx: number, flagCol: 'is_al' | 'is_leave'): Promise<number> => {
    const setBlh = ownsBlh ? `blh=EXCLUDED.blh, ` : ``
    let n = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const params: unknown[] = []
      const tuples = slice.map((f) => {
        const b = params.length
        params.push(f[1], f[3], dailyBlh(f), dailyDp(f), Number(f[5]), Number(f[6]), Number(f[flagIdx]))
        return `(${idVal}$${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$U,$U,NOW())`
      })
      const ub = params.length + 1
      params.push(updatedBy)
      await db.query(
        `INSERT INTO ${sch}.${t} (${idCol}crew_id, crew_base_dt, blh, dp, credit, is_day_off, ${flagCol}, created_by, updated_by, updated_at)
         VALUES ${tuples.join(',').replaceAll('$U', `$${ub}`)}
         ON CONFLICT (${cKey}, crew_base_dt) DO UPDATE SET
           ${setBlh}dp=EXCLUDED.dp, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off,
           ${flagCol}=EXCLUDED.${flagCol}, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        params)
      n += slice.length
    }
    return n
  }
  // Inject metric-only local dates (cross-midnight tails) so they upsert with credit=0.
  const grainKeys = new Set(grains.D.map((f) => `${f[1]}\t${f[3]}`))
  const metricOnlyFd: string[][] = []
  const metricOnlyCc: string[][] = []
  const missingKeys = new Set<string>()
  for (const key of realBlh.keys()) missingKeys.add(key)
  for (const key of realDp.keys()) missingKeys.add(key)
  for (const key of missingKeys) {
    if (grainKeys.has(key)) continue
    const [crewId, localDate] = key.split('\t')
    const division = meta.get(crewId)?.division || ''
    // Rust D row: [tag, crewId, division, localDate, ..., credit, is_day_off, is_al, is_leave]
    const row = ['D', crewId, division, localDate, '0', '0', '0', '0', '0', '0']
    if (division === 'P') metricOnlyFd.push(row)
    else metricOnlyCc.push(row)
  }

  const fdRows = grains.D.filter((f) => f[2] === 'P').concat(metricOnlyFd)
  const ccRows = grains.D.filter((f) => f[2] !== 'P').concat(metricOnlyCc)
  const daily = (await upsertDaily(fdRows, 'crew_manday_fd_daily', 7, 'is_al'))
    + (await upsertDaily(ccRows, 'crew_manday_cc_am_daily', 8, 'is_leave'))

  // ── Monthly + Yearly: re-aggregate from the daily table (source of truth). Credit + flags
  //    always; blh only when the driver owns it (else monthly/yearly blh stays import-fed).
  const reCrewFilter = ` AND crew_id = ANY($1)`
  const aggParam = [crewIds, updatedBy]
  const byP = '$2'
  const blhSel = ownsBlh ? `SUM(blh)::int` : `0`
  const blhSet = ownsBlh ? `blh=EXCLUDED.blh, ` : ``

  // Re-aggregate daily → period by roster_period (RP grain). Daily is the source of
  // truth; each crew_base_dt maps to exactly one RP via roster_period [rp_start, rp_end]
  // (roster_period has no crew_id/scenario_id/crew_base_dt, so those stay unqualified).
  const reaggMonthly = async (dailyT: string, periodT: string, flag: 'is_al' | 'is_leave'): Promise<number> => {
    const res = await db.query(
      `INSERT INTO ${sch}.${periodT} (${idCol}crew_id, roster_period, rp_start, rp_end, blh, dp, credit, is_day_off, ${flag}, created_by, updated_by, updated_at)
       SELECT ${idVal}crew_id, rp.roster_period, rp.rp_start, rp.rp_end, ${blhSel}, SUM(dp)::int, SUM(credit)::numeric(8,2), SUM(is_day_off)::int, SUM(${flag})::int, ${byP}, ${byP}, NOW()
         FROM ${sch}.${dailyT}
         JOIN ${liveSchema()}.roster_period rp ON crew_base_dt::date >= rp.rp_start::date AND crew_base_dt::date <= rp.rp_end::date
        WHERE TRUE${scenFilter}${reCrewFilter}
        GROUP BY crew_id, rp.roster_period, rp.rp_start, rp.rp_end
       ON CONFLICT (${cKey}, roster_period) DO UPDATE SET
         ${blhSet}dp=EXCLUDED.dp, rp_start=EXCLUDED.rp_start, rp_end=EXCLUDED.rp_end, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off, ${flag}=EXCLUDED.${flag}, updated_by=EXCLUDED.updated_by, updated_at=NOW()
       RETURNING 1`, aggParam)
    return res.rowCount ?? 0
  }
  let monthly = 0
  monthly += await reaggMonthly('crew_manday_fd_daily', 'crew_manday_fd_period', 'is_al')
  monthly += await reaggMonthly('crew_manday_cc_am_daily', 'crew_manday_cc_am_period', 'is_leave')

  // Yearly: fd has no is_al column → only is_day_off; cc has is_leave.
  const yearlyFd = await db.query(
    `INSERT INTO ${sch}.crew_manday_fd_yearly (${idCol}crew_id, year, blh, dp, credit, is_day_off, created_by, updated_by, updated_at)
     SELECT ${idVal}crew_id, to_char(crew_base_dt,'YYYY'), ${blhSel}, SUM(dp)::int, SUM(credit)::numeric(8,2), SUM(is_day_off)::int, ${byP}, ${byP}, NOW()
       FROM ${sch}.crew_manday_fd_daily WHERE TRUE${scenFilter}${reCrewFilter} GROUP BY crew_id, to_char(crew_base_dt,'YYYY')
     ON CONFLICT (${cKey}, year) DO UPDATE SET ${blhSet}dp=EXCLUDED.dp, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off, updated_by=EXCLUDED.updated_by, updated_at=NOW()
     RETURNING 1`, aggParam)
  const yearlyCc = await db.query(
    `INSERT INTO ${sch}.crew_manday_cc_am_yearly (${idCol}crew_id, year, blh, dp, credit, is_day_off, is_leave, created_by, updated_by, updated_at)
     SELECT ${idVal}crew_id, to_char(crew_base_dt,'YYYY'), ${blhSel}, SUM(dp)::int, SUM(credit)::numeric(8,2), SUM(is_day_off)::int, SUM(is_leave)::int, ${byP}, ${byP}, NOW()
       FROM ${sch}.crew_manday_cc_am_daily WHERE TRUE${scenFilter}${reCrewFilter} GROUP BY crew_id, to_char(crew_base_dt,'YYYY')
     ON CONFLICT (${cKey}, year) DO UPDATE SET ${blhSet}dp=EXCLUDED.dp, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off, is_leave=EXCLUDED.is_leave, updated_by=EXCLUDED.updated_by, updated_at=NOW()
     RETURNING 1`, aggParam)
  const yearly = (yearlyFd.rowCount ?? 0) + (yearlyCc.rowCount ?? 0)

  return { crews: crewIds.length, daily, monthly, yearly }
}
