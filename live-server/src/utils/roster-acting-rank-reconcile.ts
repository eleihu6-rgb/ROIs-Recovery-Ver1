import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

type AnyDb = Pick<NodePgDatabase, 'execute'>

export interface RankMove {
  pairingId: number
  crewId: string
  toRank: string
}

interface CrewRankRecord {
  rank: string
  effDt: Date | null
  expDt: Date | null
}

interface RosterRow {
  pairingId: number
  crewId: string
  activeRank: string | null
  rosterActingRank: string | null
  flightActingRank: string | null
}

/**
 * drizzle's execute() returns `timestamp without time zone` columns as
 * 'YYYY-MM-DD HH:MM:SS' STRINGS (it overrides pg's default Date parser), unlike raw pg.
 * The columns are stored as UTC — parse accordingly so date math is timezone-consistent.
 */
const toUtcDate = (v: string | null | undefined): Date | null =>
  v ? new Date(String(v).replace(' ', 'T') + 'Z') : null

/**
 * Reconcile acting ranks for pairings whose total roster headcount matches the
 * composition plan but where one rank is over-filled and another under-filled.
 *
 * Rule (product-confirmed): among the crews in an over-filled rank, move the one
 * whose CrewRank start time for that rank is the MOST RECENT (刚转职级) into the
 * under-filled rank. A crew with NO crew_rank record covering the pairing date is
 * treated as the anomaly and moved first.
 *
 * Safe cases only: total_plan == total_fill AND has_over AND has_short. Pairings
 * whose totals do not balance are left untouched.
 *
 * @returns the computed moves (does not touch the database)
 */
export function computeActingRankMoves(params: {
  planByPairing: Record<number, Record<string, number>>
  fillByPairing: Record<number, Record<string, number>>
  rosterByPairing: Record<number, RosterRow[]>
  crewRankByCrew: Record<string, CrewRankRecord[]>
  pairingDateByPairing: Record<number, Date | null>
}): RankMove[] {
  const { planByPairing, fillByPairing, rosterByPairing, crewRankByCrew, pairingDateByPairing } = params
  const moves: RankMove[] = []

  for (const pid of Object.keys(planByPairing)) {
    const pidN = Number(pid)
    const plan = planByPairing[pidN] ?? {}
    const fill = fillByPairing[pidN] ?? {}
    const ranks = new Set([...Object.keys(plan), ...Object.keys(fill)])
    const totalPlan = [...ranks].reduce((s, rk) => s + (plan[rk] ?? 0), 0)
    const totalFill = [...ranks].reduce((s, rk) => s + (fill[rk] ?? 0), 0)
    if (totalPlan <= 0 || totalPlan !== totalFill) continue

    const delta: Record<string, number> = {}
    for (const rk of ranks) delta[rk] = (fill[rk] ?? 0) - (plan[rk] ?? 0)
    const overRanks = Object.keys(delta).filter((rk) => delta[rk] > 0).sort((a, b) => delta[b] - delta[a])
    const shortRanks = Object.keys(delta).filter((rk) => delta[rk] < 0).sort((a, b) => delta[a] - delta[b])
    if (overRanks.length === 0 || shortRanks.length === 0) continue

    const flightDate = pairingDateByPairing[pidN] ?? null
    const crews = rosterByPairing[pidN] ?? []
    for (const ork of overRanks) {
      const need = delta[ork]
      const candidates = crews
        .filter((r) => r.rosterActingRank === ork || r.flightActingRank === ork)
        .map((r) => ({ row: r, start: latestRankStart(crewRankByCrew[r.crewId] ?? [], ork, flightDate) }))
      // No-record anomalies first; then most-recent rank start (刚转职级) first.
      candidates.sort((a, b) => {
        if (a.start === null && b.start !== null) return -1
        if (a.start !== null && b.start === null) return 1
        return (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0)
      })
      for (const c of candidates.slice(0, need)) {
        moves.push({ pairingId: pidN, crewId: c.row.crewId, toRank: shortRanks[0] })
      }
    }
  }
  return moves
}

/** Most recent eff_dt where the crew held `rank` covering flightDate (or null). */
function latestRankStart(records: CrewRankRecord[], rank: string, flightDate: Date | null): Date | null {
  let best: Date | null = null
  for (const rec of records) {
    if (rec.rank !== rank || rec.effDt === null) continue
    if (flightDate !== null) {
      const effDay = new Date(rec.effDt.getTime())
      effDay.setHours(0, 0, 0, 0)
      if (effDay.getTime() > flightDate.getTime()) continue
      if (rec.expDt !== null) {
        const expDay = new Date(rec.expDt.getTime())
        expDay.setHours(0, 0, 0, 0)
        if (expDay.getTime() <= flightDate.getTime()) continue
      }
    }
    if (best === null || rec.effDt.getTime() > best.getTime()) best = rec.effDt
  }
  return best
}

const numberArray = (values: number[]): ReturnType<typeof sql> =>
  sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::bigint[]`

/**
 * Detect and correct acting-rank mismatches on the given pairings, then return the
 * number of roster_flight rows changed. Callers should run
 * `refreshPairingCompositionFillBulk` afterwards so fill reflects the corrections.
 */
export async function reconcilePairingActingRanks(
  db: AnyDb,
  pairingIds: number[],
  username: string,
): Promise<{ correctedPairings: number; correctedRows: number }> {
  if (pairingIds.length === 0) return { correctedPairings: 0, correctedRows: 0 }
  const pidArray = numberArray(pairingIds)

  const perRank = await db.execute(sql`
    WITH fill AS (
      SELECT pairing_id, roster_acting_rank AS rk, COUNT(DISTINCT crew_id) AS f
      FROM roster_flight
      WHERE is_deleted = 0 AND pairing_id = ANY(${pidArray})
      GROUP BY pairing_id, roster_acting_rank
    ),
    comp AS (
      SELECT pairing_id, acting_rank AS rk, plan
      FROM pairing_composition
      WHERE is_deleted = 0 AND plan > 0 AND pairing_id = ANY(${pidArray})
    )
    SELECT COALESCE(c.pairing_id, f.pairing_id) AS pairing_id,
           COALESCE(c.rk, f.rk) AS rk,
           COALESCE(c.plan, 0) AS plan,
           COALESCE(f.f, 0) AS fill
    FROM comp c FULL OUTER JOIN fill f ON c.pairing_id = f.pairing_id AND c.rk = f.rk
  `)

  const planByPairing: Record<number, Record<string, number>> = {}
  const fillByPairing: Record<number, Record<string, number>> = {}
  const rows = (perRank.rows ?? []) as Array<{ pairing_id: number; rk: string; plan: number; fill: number }>
  for (const row of rows) {
    const pid = Number(row.pairing_id)
    ;(planByPairing[pid] ??= {})[row.rk] = Number(row.plan)
    ;(fillByPairing[pid] ??= {})[row.rk] = Number(row.fill)
  }
  const pairingIdsSet = Object.keys(planByPairing)
  if (pairingIdsSet.length === 0) return { correctedPairings: 0, correctedRows: 0 }

  // Only pairings whose totals balance AND have both over + short are safe to correct.
  const mismatchIds = pairingIdsSet
    .map(Number)
    .filter((pid) => {
      const ranks = new Set([...Object.keys(planByPairing[pid] ?? {}), ...Object.keys(fillByPairing[pid] ?? {})])
      const totalPlan = [...ranks].reduce((s, rk) => s + (planByPairing[pid][rk] ?? 0), 0)
      const totalFill = [...ranks].reduce((s, rk) => s + (fillByPairing[pid][rk] ?? 0), 0)
      if (totalPlan <= 0 || totalPlan !== totalFill) return false
      const delta = [...ranks].map((rk) => (fillByPairing[pid][rk] ?? 0) - (planByPairing[pid][rk] ?? 0))
      return delta.some((d) => d > 0) && delta.some((d) => d < 0)
    })
  if (mismatchIds.length === 0) return { correctedPairings: 0, correctedRows: 0 }
  const mmArray = numberArray(mismatchIds)

  const pairingDates = await db.execute(sql`
    SELECT id, sch_str_dt_utc FROM pairing WHERE id = ANY(${mmArray})
  `)
  const pairingDateByPairing: Record<number, Date | null> = {}
  for (const r of (pairingDates.rows ?? []) as Array<{ id: number; sch_str_dt_utc: string | null }>) {
    pairingDateByPairing[Number(r.id)] = toUtcDate(r.sch_str_dt_utc)
  }

  const rosterRows = await db.execute(sql`
    SELECT pairing_id, crew_id, active_rank, roster_acting_rank, flight_acting_rank
    FROM roster_flight
    WHERE pairing_id = ANY(${mmArray}) AND is_deleted = 0
  `)
  const rosterByPairing: Record<number, RosterRow[]> = {}
  const crewIds = new Set<string>()
  for (const r of (rosterRows.rows ?? []) as Array<{
    pairing_id: number; crew_id: string; active_rank: string | null
    roster_acting_rank: string | null; flight_acting_rank: string | null
  }>) {
    const pid = Number(r.pairing_id)
    ;(rosterByPairing[pid] ??= []).push({
      pairingId: pid,
      crewId: r.crew_id,
      activeRank: r.active_rank,
      rosterActingRank: r.roster_acting_rank,
      flightActingRank: r.flight_acting_rank,
    })
    crewIds.add(r.crew_id)
  }
  if (crewIds.size === 0) return { correctedPairings: 0, correctedRows: 0 }
  const crewArray = sql`ARRAY[${sql.join([...crewIds].map((c) => sql`${c}`), sql`, `)}]::text[]`

  const rankRows = await db.execute(sql`
    SELECT crew_id, rank, eff_dt, exp_dt FROM crew_rank WHERE crew_id = ANY(${crewArray})
  `)
  const crewRankByCrew: Record<string, CrewRankRecord[]> = {}
  for (const r of (rankRows.rows ?? []) as Array<{
    crew_id: string; rank: string; eff_dt: string | null; exp_dt: string | null
  }>) {
    // crew_rank.eff_dt / exp_dt are `timestamp without time zone` — drizzle's execute
    // returns them as 'YYYY-MM-DD HH:MM:SS' strings. latestRankStart calls .getTime() on
    // them, so normalize to Date here or the reconcile throws on any mismatched pairing.
    ;(crewRankByCrew[r.crew_id] ??= []).push({
      rank: r.rank,
      effDt: toUtcDate(r.eff_dt),
      expDt: toUtcDate(r.exp_dt),
    })
  }

  const moves = computeActingRankMoves({ planByPairing, fillByPairing, rosterByPairing, crewRankByCrew, pairingDateByPairing })
  if (moves.length === 0) return { correctedPairings: 0, correctedRows: 0 }

  let correctedRows = 0
  const correctedPairings = new Set<number>()
  for (const move of moves) {
    const res = await db.execute(sql`
      UPDATE roster_flight
      SET active_rank = ${move.toRank}, roster_acting_rank = ${move.toRank},
          flight_acting_rank = ${move.toRank}, position = ${move.toRank},
          updated_at = now(), updated_by = ${username}
      WHERE pairing_id = ${move.pairingId} AND crew_id = ${move.crewId} AND is_deleted = 0
    `)
    correctedRows += res.rowCount ?? 0
    correctedPairings.add(move.pairingId)
  }
  return { correctedPairings: correctedPairings.size, correctedRows }
}
