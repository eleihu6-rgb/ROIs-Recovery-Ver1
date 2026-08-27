// TS port of scripts/load-scenario-roster.mjs (roster transcription).
//
// On a completed optimizer result, transcribe the solver gz pair into the
// partition-backed scenario schema so the DB read path (buildGanttDataFromDb)
// can serve it:
//   - scenario.roster_flight       — one row per pairing segment (flying) + one per ground item
//   - scenario.crew_manday_*        — 7502/8002 credit model via the UNIFIED manday driver
//     (manday-tool.ts → Rust `ruletool`), the same tool Live uses; no duplicate DB plumbing.
// and mark the scenario DONE with live pairing/flight pointers (0/0) — a freshly
// run scenario uses the live data it was optimized against; frozen copies are a
// separate, explicit action.

import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { isPbsAwardExplanationComment } from '../../../../packages/contracts/pbs-award-results.js'
import { parseSections } from './scenario-result-service.js'
import { recompute as recomputeManday } from '../manday/manday-tool.js'
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'
import { recalculateAccRefTz } from '../rule-check/acc-ref-tz-service.js'

type Pool = pg.Pool
type Queryable = Pick<pg.PoolClient, 'query'>
type Sections = Record<string, Record<string, string>[]>

// Every scenario-schema table the optimizer result is written into (see
// insertRosterRows + writeManday). Reverting a scenario to DRAFT ("Remove result")
// or deleting it must clear these partitions, or the gantt — which reads them
// directly and uncached (scenario.roster_flight + crew_manday_*_monthly) — keeps
// serving the stale result.
export const SCENARIO_RESULT_TABLES = [
  'roster_flight',
  'crew_manday_fd_daily', 'crew_manday_cc_am_daily',
  'crew_manday_fd_period', 'crew_manday_cc_am_period',
  'crew_manday_fd_yearly', 'crew_manday_cc_am_yearly',
] as const

/** Delete a scenario's optimization-result partitions from the scenario schema.
 *  Idempotent: a scenario with no result simply deletes zero rows. */
export const clearScenarioResult = async (pool: Queryable, scenarioId: number): Promise<void> => {
  const scenario = scenarioSchema()
  for (const t of SCENARIO_RESULT_TABLES) {
    await pool.query(`delete from ${scenario}.${t} where scenario_id=$1`, [scenarioId])
  }
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const dt = (v: unknown): string | null => (v && String(v).trim() ? String(v).trim() : null)

// ── roster_flight rows from the gz pair ──────────────────────────────────────
interface RosterRow {
  crew_id: string
  pairing_id: number | null
  live_id: number | null
  base: string
  label: string | null
  assignment_group: string
  assignment: string
  role: string | null
  source: string
  flight_acting_rank: string
  roster_acting_rank: string | null
  division: string | null
  flt_id: number | null
  duty_seq: number | null
  seg_seq: number | null
  flt_dt: string | null
  sch_str_dt_utc: string | null
  sch_end_dt_utc: string | null
  act_str_dt_utc?: string | null
  act_end_dt_utc?: string | null
  sch_credited_minutes: number | null
  act_credited_minutes: number | null
  dep_arp: string | null
  arv_arp: string | null
  comments: string | null
}

interface LiveRosterOverlay {
  id: number
  label: string | null
  role: string | null
  division: string | null
  roster_acting_rank: string | null
  dep_arp: string | null
  arv_arp: string | null
  sch_credited_minutes: number | null
  act_credited_minutes: number | null
}

// Ground assignment_group must mirror LIVE (e.g. VAC → GRD), not the solver's
// per-code value. `groundGroup` maps an assignment code → its canonical ground
// group (resolved from f8.assignment_group_map); empty map = preserve gz value.
export const buildRosterRows = (inp: Sections, out: Sections, groundGroup: Map<string, string>): RosterRow[] => {
  const crewBase = new Map<string, string>()
  const bestEff = new Map<string, string>()
  for (const r of inp.crew_base ?? []) {
    const e = r.eff_dt ?? ''
    const c = bestEff.get(r.crew_id)
    if (!c || e > c) {
      bestEff.set(r.crew_id, e)
      crewBase.set(r.crew_id, r.base)
    }
  }
  const crewRank = new Map<string, string>()
  for (const r of inp.crew_rank ?? []) if (!crewRank.has(r.crew_id)) crewRank.set(r.crew_id, r.rank)
  const pairingById = new Map<string, Record<string, string>>()
  for (const r of inp.pairing ?? []) pairingById.set(String(r.id), r)
  const segsByPairing = new Map<string, Record<string, string>[]>()
  for (const s of inp.pairing_segment ?? []) {
    const k = String(s.pairing_id)
    const list = segsByPairing.get(k) ?? []
    list.push(s)
    segsByPairing.set(k, list)
  }

  const assignments = out.ASSIGNMENTS ?? []
  const assignmentKeys = new Set<string>()

  for (const assignment of assignments) {
    const key = `${assignment.crew_id}\u001f${assignment.pairing_id}`

    if (assignmentKeys.has(key)) {
      throw new Error(
        `Invalid optimizer result: duplicate ASSIGNMENTS row for crew ${assignment.crew_id} and pairing ${assignment.pairing_id}`,
      )
    }

    assignmentKeys.add(key)
  }

  const rows: RosterRow[] = []
  const rosterByCrewPairing = new Map<string, Record<string, string>>()
  for (const r of out.ROSTER ?? []) {
    if (r.crew_id && r.pairing_id && r.pairing_id !== '0') {
      rosterByCrewPairing.set(`${r.crew_id}\u001f${r.pairing_id}`, r)
    }
  }
  for (const a of assignments) {
    const p = pairingById.get(String(a.pairing_id))
    const roster = rosterByCrewPairing.get(`${a.crew_id}\u001f${a.pairing_id}`)
    const comments = isPbsAwardExplanationComment(a.comments) && a.comments.length <= 180
      ? a.comments
      : null

    for (const s of segsByPairing.get(String(a.pairing_id)) ?? []) {
      const dutyActCredit = num(s.duty_act_credited_minutes)
      const dutySchCredit = num(s.duty_sch_credited_minutes) ?? dutyActCredit
      rows.push({
        crew_id: a.crew_id,
        pairing_id: num(a.pairing_id),
        live_id: num(roster?.old_id),
        base: crewBase.get(a.crew_id) || p?.base || 'UNK',
        label: null,
        assignment_group: p?.assignment_group || 'FLT',
        assignment: p?.assignment || 'FLT',
        role: null,
        // Preserve optimizer source semantics: rows carried from Live are PA;
        // optimizer-created rows are CR.
        source: a.source !== 'CR' ? 'PA' : 'CR',
        flight_acting_rank: (a.acting_rank || crewRank.get(a.crew_id) || 'NA').slice(0, 10),
        roster_acting_rank: (a.acting_rank || '').slice(0, 10) || null,
        division: p?.division || null,
        flt_id: num(s.flt_id),
        duty_seq: num(s.duty_seq),
        seg_seq: num(s.seg_seq),
        flt_dt: dt(s.flt_dt),
        sch_str_dt_utc: dt(s.sch_str_dt_utc),
        sch_end_dt_utc: dt(s.sch_end_dt_utc),
        act_str_dt_utc: dt(s.act_str_dt_utc),
        act_end_dt_utc: dt(s.act_end_dt_utc),
        sch_credited_minutes: dutySchCredit,
        act_credited_minutes: dutyActCredit,
        dep_arp: dt(s.dep_arp),
        arv_arp: dt(s.arv_arp),
        comments,
      })
    }
  }
  for (const r of out.ROSTER ?? []) {
    if (r.pairing_id && r.pairing_id !== '0') continue
    if (!r.crew_id || !(r.source === 'CR' || r.source === 'PA' || r.source === 'leadin' || !r.source)) continue
    rows.push({
      crew_id: r.crew_id,
      pairing_id: null,
      live_id: num(r.old_id),
      base: crewBase.get(r.crew_id) || 'UNK',
      label: null,
      // Mirror live: resolve the ground group from the assignment code (VAC → GRD).
      // Falls back to the gz value only when the code is absent from the map.
      assignment_group: groundGroup.get((r.assignment || r.assignment_group || '').toUpperCase())
        || r.assignment_group || 'GRD',
      assignment: r.assignment || r.assignment_group || 'GRD',
      role: null,
      // Preserve optimizer source semantics: rows carried from Live are PA;
      // optimizer-created rows are CR.
      source: r.source === 'CR' ? 'CR' : 'PA',
      flight_acting_rank: (r.acting_rank || crewRank.get(r.crew_id) || 'NA').slice(0, 10),
      roster_acting_rank: (r.acting_rank || '').slice(0, 10) || null,
      division: null,
      flt_id: null,
      duty_seq: null,
      seg_seq: null,
      flt_dt: null,
      sch_str_dt_utc: dt(r.sch_str_dt_utc),
      sch_end_dt_utc: dt(r.sch_end_dt_utc),
      act_str_dt_utc: dt(r.act_str_dt_utc),
      act_end_dt_utc: dt(r.act_end_dt_utc),
      sch_credited_minutes: null,
      act_credited_minutes: null,
      dep_arp: null,
      arv_arp: null,
      comments: null,
    })
  }
  return rows
}

const applyLiveOverlay = (row: RosterRow, live: LiveRosterOverlay): void => {
  row.live_id = live.id
  row.label = live.label ?? row.label
  row.role = live.role ?? row.role
  row.division = live.division ?? row.division
  row.roster_acting_rank = live.roster_acting_rank ?? row.roster_acting_rank
  row.dep_arp = live.dep_arp ?? row.dep_arp
  row.arv_arp = live.arv_arp ?? row.arv_arp
  row.sch_credited_minutes = live.sch_credited_minutes ?? row.sch_credited_minutes
  row.act_credited_minutes = live.act_credited_minutes ?? row.act_credited_minutes
}

const liveOverlayColumns = [
  'id',
  'label',
  'role',
  'division',
  'roster_acting_rank',
  'dep_arp',
  'arv_arp',
  'sch_credited_minutes',
  'act_credited_minutes',
] as const

const selectLiveOverlayColumns = liveOverlayColumns.join(', ')
const selectQualifiedLiveOverlayColumns = liveOverlayColumns.map((column) => `rf.${column}`).join(', ')

export const overlayLiveRosterFields = async (pool: Queryable, rows: RosterRow[]): Promise<void> => {
  const live = liveSchema()
  const explicitLiveIds = [...new Set(rows.map((r) => r.live_id).filter((id): id is number => id !== null))]
  const byId = new Map<number, LiveRosterOverlay>()
  if (explicitLiveIds.length) {
    const explicit = await pool.query(
      `select ${selectLiveOverlayColumns}
         from ${live}.roster_flight
        where id = any($1)`,
      [explicitLiveIds],
    )
    for (const r of explicit.rows) {
      byId.set(Number(r.id), {
        id: Number(r.id),
        label: r.label ?? null,
        role: r.role ?? null,
        division: r.division ?? null,
        roster_acting_rank: r.roster_acting_rank ?? null,
        dep_arp: r.dep_arp ?? null,
        arv_arp: r.arv_arp ?? null,
        sch_credited_minutes: num(r.sch_credited_minutes),
        act_credited_minutes: num(r.act_credited_minutes),
      })
    }
  }
  for (const row of rows) {
    if (row.live_id === null) continue
    const liveRow = byId.get(row.live_id)
    if (liveRow) applyLiveOverlay(row, liveRow)
  }

  const candidates = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.source === 'PA' && row.live_id === null)
  if (!candidates.length) return

  const ords: number[] = []
  const crewIds: string[] = []
  const pairingIds: Array<number | null> = []
  const fltIds: Array<number | null> = []
  const assignments: string[] = []
  const starts: Array<string | null> = []
  const ends: Array<string | null> = []
  for (const candidate of candidates) {
    const row = candidate.row
    ords.push(candidate.index)
    crewIds.push(row.crew_id)
    pairingIds.push(row.pairing_id)
    fltIds.push(row.flt_id)
    assignments.push(row.assignment)
    starts.push(row.sch_str_dt_utc)
    ends.push(row.sch_end_dt_utc)
  }
  const fallback = await pool.query(
    `with candidates as (
       select *
       from unnest(
         $1::int[],
         $2::text[],
         $3::bigint[],
         $4::bigint[],
         $5::text[],
         $6::text[],
         $7::text[]
       ) as c(ord, crew_id, pairing_id, flt_id, assignment, sch_str_dt_utc, sch_end_dt_utc)
     )
     select distinct on (c.ord)
       c.ord,
       ${selectQualifiedLiveOverlayColumns}
     from candidates c
     join ${live}.roster_flight rf
       on rf.crew_id = c.crew_id
      and rf.is_deleted = 0
      and (
        (
          c.pairing_id is not null
          and rf.pairing_id = c.pairing_id
          and rf.flt_id = c.flt_id
        )
        or (
          c.pairing_id is null
          and rf.pairing_id is null
          and coalesce(rf.assignment, '') = coalesce(c.assignment, '')
          and rf.sch_str_dt_utc = nullif(c.sch_str_dt_utc, '')::timestamp
          and rf.sch_end_dt_utc = nullif(c.sch_end_dt_utc, '')::timestamp
        )
     )
     order by c.ord,
       rf.id`,
    [ords, crewIds, pairingIds, fltIds, assignments, starts, ends],
  )
  for (const r of fallback.rows) {
    applyLiveOverlay(rows[Number(r.ord)], {
      id: Number(r.id),
      label: r.label ?? null,
      role: r.role ?? null,
      division: r.division ?? null,
      roster_acting_rank: r.roster_acting_rank ?? null,
      dep_arp: r.dep_arp ?? null,
      arv_arp: r.arv_arp ?? null,
      sch_credited_minutes: num(r.sch_credited_minutes),
      act_credited_minutes: num(r.act_credited_minutes),
    })
  }
}

export const insertRosterRows = async (pool: Queryable, scenarioId: number, rows: RosterRow[]): Promise<void> => {
  const scenario = scenarioSchema()
  await pool.query(`delete from ${scenario}.roster_flight where scenario_id=$1`, [scenarioId])
  const cols = [
    'scenario_id', 'crew_id', 'pairing_id', 'live_id', 'base', 'label', 'assignment_group', 'assignment', 'role', 'source',
    'flight_acting_rank', 'roster_acting_rank', 'division', 'flt_id', 'duty_seq', 'seg_seq',
    'flt_dt', 'sch_str_dt_utc', 'sch_end_dt_utc', 'act_str_dt_utc', 'act_end_dt_utc', 'sch_credited_minutes', 'act_credited_minutes', 'dep_arp', 'arv_arp', 'comments', 'created_by', 'updated_by',
  ]
  const B = 500
  for (let i = 0; i < rows.length; i += B) {
    const chunk = rows.slice(i, i + B)
    const vals: unknown[] = []
    const ph: string[] = []
    chunk.forEach((r, j) => {
      const base = j * cols.length
      ph.push('(' + cols.map((_, k) => `$${base + k + 1}`).join(',') + ')')
      vals.push(
        scenarioId, r.crew_id, r.pairing_id, r.live_id, r.base, r.label, r.assignment_group, r.assignment, r.role, r.source,
        r.flight_acting_rank, r.roster_acting_rank, r.division, r.flt_id, r.duty_seq, r.seg_seq,
        r.flt_dt, r.sch_str_dt_utc, r.sch_end_dt_utc, r.act_str_dt_utc, r.act_end_dt_utc, r.sch_credited_minutes, r.act_credited_minutes, r.dep_arp, r.arv_arp, r.comments,
        'scenario_loader', 'scenario_loader',
      )
    })
    await pool.query(`insert into ${scenario}.roster_flight (${cols.join(',')}) values ${ph.join(',')}`, vals)
  }
}

// assignment code → canonical GROUND group (mirrors live), from f8.assignment_group_map.
// An assignment may map to several groups (e.g. DHD → FLY + GRD); for ground duties we
// prefer GRD, else the first non-FLY group, else the only group. Used so a pre-assigned
// VAC (group GRD in live) is stored as GRD — not the solver's per-code 'VAC' — in scenario.
const loadGroundGroupMap = async (pool: Pool): Promise<Map<string, string>> => {
  const m = new Map<string, string>()
  const live = liveSchema()
  const rows = await pool.query(
    `select upper(a.assignment) as code, array_agg(g.assignment_group) as groups
       from ${live}.assignment a
       join ${live}.assignment_group_map gm on gm.assignment_id = a.id
       join ${live}.assignment_group g on g.id = gm.assignment_group_id
      group by upper(a.assignment)`)
  for (const r of rows.rows) {
    const groups: string[] = (r.groups ?? []).map((x: string) => String(x))
    const ground = groups.includes('GRD') ? 'GRD' : (groups.find((x) => x !== 'FLY') ?? groups[0])
    if (ground) m.set(String(r.code), ground)
  }
  return m
}
export interface LoadResultOptions {
  /** When true, mark the scenario row DONE with live pointers (0/0). Default true. */
  setScenarioDone?: boolean
}

/**
 * Core loader: transcribe a solver gz pair into scenario.roster_flight +
 * scenario.crew_manday_* for `scenarioId`. Idempotent (deletes the partition
 * first). Runs roster + manday in one transaction so a partial load can't leave
 * the DB read path serving inconsistent data.
 */
export const loadResultGzIntoDb = async (
  pool: Pool,
  scenarioId: number,
  inputGz: Buffer,
  outputGz: Buffer,
  opts: LoadResultOptions = {},
): Promise<{ roster: number; daily: number; monthly: number; yearly: number }> => {
  const inp = parseSections(inputGz)
  const out = parseSections(outputGz)

  // Ground groups mirror live (VAC → GRD) for the roster transcription; manday itself is
  // computed by the unified driver below (reads the roster_flight we insert, in-tx).
  const groundGroup = await loadGroundGroupMap(pool)
  const rosterRows = buildRosterRows(inp, out, groundGroup)

  const client = await pool.connect()
  try {
    await client.query('begin')
    await overlayLiveRosterFields(client, rosterRows)
    await insertRosterRows(client, scenarioId, rosterRows)
    const ruleset = await client.query<{ ruleset_id: number | null }>(
      `select ruleset_id
         from ${liveSchema()}.scenario
        where id = $1`,
      [scenarioId],
    )
    await recalculateAccRefTz(client, {
      schema: 'scenario',
      scenarioId,
      rulesetId: Number(ruleset.rows[0]?.ruleset_id ?? 103),
    })
    // Manday via the SAME unified driver Live uses — it reads the roster_flight we just
    // inserted (within this tx, via the pinned client) and writes scenario.crew_manday_*.
    // One credit tool for Live + Scenario; no duplicated gz manday plumbing here.
    const manday = await recomputeManday(client as unknown as Pool, { schema: 'scenario', scenarioId, updatedBy: 'ruletool' })
    if (opts.setScenarioDone !== false) {
      await client.query(
        `update ${liveSchema()}.scenario set status='DONE', pairing_scenario_id=0, flight_scenario_id=0, updated_at=now() where id=$1`,
        [scenarioId],
      )
    }
    await client.query('commit')
    return { roster: rosterRows.length, daily: manday.daily, monthly: manday.monthly, yearly: manday.yearly }
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}

/**
 * Fetch the completed result's gz pair from engine-server, then load it into the
 * scenario schema. Best-effort: callers should `.catch` so a load failure never
 * fails the result callback.
 */
export const loadScenarioResultIntoDb = async (
  fastify: FastifyInstance,
  args: { scenarioId: number; taskId: string; token: string; airline: string },
): Promise<{ roster: number; daily: number; monthly: number; yearly: number }> => {
  const { engineServerClient } = await import('../engine-server-client.js')
  const [inputGz, outputGz] = await Promise.all([
    engineServerClient.fetchInputFile(args.taskId, args.token, args.airline, args.scenarioId),
    engineServerClient.fetchResultFile(args.taskId, args.token, args.airline, args.scenarioId),
  ])
  return loadResultGzIntoDb(fastify.pgPool, args.scenarioId, inputGz, outputGz)
}
