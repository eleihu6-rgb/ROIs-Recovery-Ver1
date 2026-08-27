import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

export interface CrewStats {
  crewId: string
  ybh: number   // Year Block Hours (minutes)
  mbh: number   // Month Block Hours (minutes)
  mcred: number // Month Credit
  yal: number   // Year Annual Leave (days)
  mal: number   // Month Annual Leave (days)
  ydo: number   // Year Day Off (days)
  mdo: number   // Month Day Off (days)
}

export const crewStatsService = {
  /**
   * Fetch manday stats for a set of crew members.
   *
   * Division routing:
   *   - division = 'P' → crew_manday_fd_period  (uses is_al for leave)
   *   - other          → crew_manday_cc_am_period (uses is_leave for leave)
   *
   * Y* = cumulative sum for all roster periods in the given year (roster_period LIKE 'YYYYRP%').
   * M* = value for the specific roster_period only.
   */
  async getStats(
    fastify: FastifyInstance,
    crewIds: string[],
    rosterPeriod: string, // YYYYRPMM (e.g. '2026RP07')
  ): Promise<Record<string, CrewStats>> {
    if (crewIds.length === 0) return {}

    const year = rosterPeriod.slice(0, 4)
    const yearPattern = `${year}RP%`
    const crewIdList = sql.join(crewIds.map((id) => sql`${id}`), sql`, `)

    const { rows } = await fastify.db.execute(sql`
      WITH crew_divs AS (
        -- crew_id = crew.crew_id (external employee code, used as FK in all manday/roster tables)
        SELECT crew_id, division
        FROM crew
        WHERE crew_id IN (${crewIdList})
      ),
      cc_stats AS (
        SELECT
          m.crew_id,
          COALESCE(SUM(m.blh), 0)::int                                                           AS ybh,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.blh    ELSE 0 END), 0)::int  AS mbh,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.credit ELSE 0 END), 0)       AS mcred,
          COALESCE(SUM(m.is_leave), 0)::int                                                      AS yal,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.is_leave   ELSE 0 END), 0)::int AS mal,
          COALESCE(SUM(m.is_day_off), 0)::int                                                    AS ydo,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.is_day_off ELSE 0 END), 0)::int AS mdo
        FROM crew_manday_cc_am_period m
        JOIN crew_divs d ON d.crew_id = m.crew_id AND d.division <> 'P'
        WHERE m.roster_period LIKE ${yearPattern}
        GROUP BY m.crew_id
      ),
      fd_stats AS (
        SELECT
          m.crew_id,
          COALESCE(SUM(m.blh), 0)::int                                                          AS ybh,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.blh    ELSE 0 END), 0)::int AS mbh,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.credit ELSE 0 END), 0)      AS mcred,
          COALESCE(SUM(m.is_al), 0)::int                                                        AS yal,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.is_al      ELSE 0 END), 0)::int AS mal,
          COALESCE(SUM(m.is_day_off), 0)::int                                                   AS ydo,
          COALESCE(SUM(CASE WHEN m.roster_period = ${rosterPeriod} THEN m.is_day_off ELSE 0 END), 0)::int AS mdo
        FROM crew_manday_fd_period m
        JOIN crew_divs d ON d.crew_id = m.crew_id AND d.division = 'P'
        WHERE m.roster_period LIKE ${yearPattern}
        GROUP BY m.crew_id
      )
      SELECT * FROM cc_stats
      UNION ALL
      SELECT * FROM fd_stats
    `)

    const result: Record<string, CrewStats> = {}
    for (const row of rows as Record<string, unknown>[]) {
      const crewId = row.crew_id as string
      result[crewId] = {
        crewId,
        ybh:   Number(row.ybh   ?? 0),
        mbh:   Number(row.mbh   ?? 0),
        mcred: Number(row.mcred ?? 0),
        yal:   Number(row.yal   ?? 0),
        mal:   Number(row.mal   ?? 0),
        ydo:   Number(row.ydo   ?? 0),
        mdo:   Number(row.mdo   ?? 0),
      }
    }
    return result
  },
}
