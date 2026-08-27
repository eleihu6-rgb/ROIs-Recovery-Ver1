import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

export interface DashboardOverview {
  flightsToday: number
  totalActiveCrew: number
  violations: null
  pendingApprovals: null
  crewByRank: Array<{ rank: string; count: number }>
  flightsByDay: Array<{ date: string; count: number }>
}

export const dashboardService = {
  async overview(fastify: FastifyInstance): Promise<DashboardOverview> {
    // today in Asia/Shanghai as YYYY-MM-DD string (matches flt_dt format)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

    const { rows: flightsTodayRows } = await fastify.db.execute(sql`
      SELECT COUNT(*) AS count
      FROM roster_flight
      WHERE flt_dt = ${today}
        AND COALESCE(is_deleted, 0) = 0
    `)
    const flightsToday = Number((flightsTodayRows[0] as Record<string, unknown>)?.count ?? 0)

    const { rows: activeCrewRows } = await fastify.db.execute(sql`
      SELECT COUNT(*) AS count
      FROM crew
      WHERE status = 0
    `)
    const totalActiveCrew = Number((activeCrewRows[0] as Record<string, unknown>)?.count ?? 0)

    const { rows: crewByRankRows } = await fastify.db.execute(sql`
      SELECT r.rank, r.display_order, COUNT(DISTINCT cr.crew_id) AS count
      FROM crew_rank cr
      JOIN rank r ON r.rank = cr.rank
      JOIN crew c ON c.crew_id = cr.crew_id
      WHERE cr.eff_dt <= NOW()
        AND (cr.exp_dt IS NULL OR cr.exp_dt > NOW())
        AND c.status = 0
      GROUP BY r.rank, r.display_order
      ORDER BY r.display_order
    `)
    const crewByRank = (crewByRankRows as Record<string, unknown>[]).map((r) => ({
      rank: r.rank as string,
      count: Number(r.count),
    }))

    const { rows: flightsByDayRows } = await fastify.db.execute(sql`
      SELECT flt_dt AS date, COUNT(*) AS count
      FROM roster_flight
      WHERE flt_dt >= TO_CHAR(NOW() - INTERVAL '13 days', 'YYYY-MM-DD')
        AND COALESCE(is_deleted, 0) = 0
      GROUP BY flt_dt
      ORDER BY flt_dt
    `)
    const flightsByDay = (flightsByDayRows as Record<string, unknown>[]).map((r) => ({
      date: r.date as string,
      count: Number(r.count),
    }))

    return {
      flightsToday,
      totalActiveCrew,
      violations: null,
      pendingApprovals: null,
      crewByRank,
      flightsByDay,
    }
  },
}
