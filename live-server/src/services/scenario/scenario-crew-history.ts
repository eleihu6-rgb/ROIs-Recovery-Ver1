// live-server/src/services/scenario/scenario-crew-history.ts
import { sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { liveSchema } from '../../utils/db-schema.js'

type Db = ReturnType<typeof drizzle>

/**
 * Crew rank/base history embedded into scenario gantt data so the client can resolve the
 * effective rank/base for an arbitrary task date (roster header + assignment gate) without
 * per-crew round-trips. Filtered to rows overlapping the scenario window.
 */
export interface CrewHistoryRow {
  crewId: string
  rank: string
  base: string
  effDt: string
  expDt: string | null
}

interface HasCrewId { crewId: string }

export async function attachCrewHistories(
  db: Db,
  crew: Array<HasCrewId & { ranks?: CrewHistoryRow[]; bases?: CrewHistoryRow[] }>,
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const crewIds = crew.map((c) => c.crewId).filter(Boolean)
  if (crewIds.length === 0) return
  const schema = liveSchema()
  // Bind as a text[] literal (ARRAY[...]::text[]) — matching the codebase convention —
  // because parameterizing a JS array as ANY($1) does not coerce to a Postgres array.
  const idArray = sql`ARRAY[${sql.join(crewIds.map((id) => sql`${id}`), sql`, `)}]::text[]`
  const [ranks, bases] = await Promise.all([
    db.execute<{ crew_id: string; rank: string; eff_dt: Date; exp_dt: Date | null }>(sql`
      SELECT crew_id, rank, eff_dt, exp_dt
        FROM ${sql.raw(schema)}.crew_rank
       WHERE crew_id = ANY(${idArray})
         AND eff_dt <= ${windowEnd}
         AND (exp_dt IS NULL OR exp_dt >= ${windowStart})
       ORDER BY eff_dt`),
    db.execute<{ crew_id: string; base: string; eff_dt: Date; exp_dt: Date | null }>(sql`
      SELECT crew_id, base, eff_dt, exp_dt
        FROM ${sql.raw(schema)}.crew_base
       WHERE crew_id = ANY(${idArray})
         AND eff_dt <= ${windowEnd}
         AND (exp_dt IS NULL OR exp_dt >= ${windowStart})
       ORDER BY eff_dt`),
  ])
  const byCrew = <T extends { crew_id: string }>(rows: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>()
    for (const r of rows) {
      const list = map.get(r.crew_id) ?? []
      list.push(r)
      map.set(r.crew_id, list)
    }
    return map
  }
  const rankMap = byCrew(ranks.rows)
  const baseMap = byCrew(bases.rows)
  const iso = (v: Date | string | null | undefined): string | null => {
    if (v == null) return null
    return v instanceof Date ? v.toISOString() : String(v)
  }
  for (const c of crew) {
    c.ranks = (rankMap.get(c.crewId) ?? []).map((r) => ({
      crewId: r.crew_id,
      rank: r.rank,
      base: '',
      effDt: iso(r.eff_dt) ?? '',
      expDt: iso(r.exp_dt),
    }))
    c.bases = (baseMap.get(c.crewId) ?? []).map((r) => ({
      crewId: r.crew_id,
      rank: '',
      base: r.base,
      effDt: iso(r.eff_dt) ?? '',
      expDt: iso(r.exp_dt),
    }))
  }
}
