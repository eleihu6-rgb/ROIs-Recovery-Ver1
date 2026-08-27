import type { FastifyInstance } from 'fastify'
import { env } from '../../config/index.js'
import { success, fail } from '../../utils/response.js'
import { getSysParamMap } from '../../services/base/dictionary-service.js'
import { asSafeIdentifier } from '../../utils/schema-identifier.js'

const asDateOnly = (value: Date | string): string => {
  if (typeof value === 'string') {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
    if (dateOnly) return dateOnly
  }
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

interface RosterPeriodRow {
  id: string | number
  roster_period: string
  name: string | null
  rp_start: string | Date
  rp_end: string | Date
  is_current?: boolean
  pbs_period_code?: string | null
}

/**
 * GET /api/roster-periods
 * Non-admin. Two modes:
 * - no query → windowed list around the current RP (back/forward), plus `hasMore`
 *   (whether older RPs exist), `maxSpan` and `loadMoreCount`.
 * - `?before=<YYYY-MM-DD>&limit=N` → the N RPs immediately older than `before`,
 *   returned ascending (historical load-more); `hasMore` detected via an N+1 probe.
 * Sizes come from SYS_PARAM RP_SELECT_BACK_COUNT / RP_SELECT_FORWARD_COUNT (6/6),
 * RP_GANTT_MAX_PERIODS (6) and RP_SELECT_LOAD_MORE_COUNT (12).
 */
export default async function rosterPeriodsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const params = await getSysParamMap(fastify)
    const back = Number(params.get('RP_SELECT_BACK_COUNT')) || 6
    const forward = Number(params.get('RP_SELECT_FORWARD_COUNT')) || 6
    const maxSpan = Number(params.get('RP_GANTT_MAX_PERIODS')) || 6
    const loadMoreCount = Number(params.get('RP_SELECT_LOAD_MORE_COUNT')) || 12
    const liveSchema = asSafeIdentifier(request.authUser?.schema ?? env.LIVE_SCHEMA)
    const { before, limit } = request.query as { before?: string; limit?: string }
    const client = await fastify.pgPool.connect()
    try {
      let rows: RosterPeriodRow[]
      let hasMore: boolean

      if (before) {
        if (!DATE_ONLY_RE.test(before)) {
          return fail(reply, 400, 'Invalid `before` date (expected YYYY-MM-DD).')
        }
        const parsed = Number(limit)
        const batch = Number.isFinite(parsed) && parsed > 0
          ? Math.min(Math.floor(parsed), loadMoreCount)
          : loadMoreCount
        const result = await client.query<RosterPeriodRow>(`
          select id, roster_period, name, rp_start, rp_end, pbs_period_code, false as is_current
          from ${liveSchema}.roster_period
          where rp_start < $1::date
          order by rp_start asc, id asc
          limit $2
        `, [before, batch + 1])
        hasMore = result.rows.length > batch
        // Ascending query returns the OLDEST batch+1; the load-more must surface the
        // batch nearest to `before`, so take the tail (keeps the response ascending).
        // Taking the head instead drops the period just before the window (e.g.
        // 2026RP01), making it unreachable in the UI.
        rows = result.rows.slice(-batch)
      } else {
        const result = await client.query<RosterPeriodRow>(`
          with periods as (
            select id, roster_period, name, rp_start, rp_end, pbs_period_code,
                   row_number() over (order by rp_start asc, id asc) as rn
            from ${liveSchema}.roster_period
          ),
          current_period as (
            select rn
            from periods
            -- rp_end is stored at midnight on the inclusive end date. Compare
            -- calendar dates so the current RP remains active for that whole day.
            where current_date between rp_start::date and rp_end::date
            order by rp_start asc
            limit 1
          )
          select p.id, p.roster_period, p.name, p.rp_start::date::text as rp_start,
                 p.rp_end::date::text as rp_end, p.pbs_period_code, (p.rn = c.rn) as is_current
          from periods p
          join current_period c on p.rn between c.rn - $1 and c.rn + $2
          order by p.rp_start asc, p.id asc
        `, [back, forward])
        if (result.rows.length === 0) {
          return fail(reply, 404, 'No roster period contains the current time.')
        }
        rows = result.rows
        const check = await client.query<{ has_more: boolean }>(`
          select exists(select 1 from ${liveSchema}.roster_period where rp_start < $1::date) as has_more
        `, [asDateOnly(rows[0].rp_start)])
        hasMore = Boolean(check.rows[0]?.has_more)
      }

      return success(reply, {
        maxSpan,
        loadMoreCount,
        hasMore,
        items: rows.map((row) => ({
          id: Number(row.id),
          rosterPeriod: row.roster_period,
          name: row.name ?? row.roster_period,
          rpStart: asDateOnly(row.rp_start),
          rpEnd: asDateOnly(row.rp_end),
          pbsPeriodCode: row.pbs_period_code ?? null,
          isCurrent: Boolean(row.is_current),
        })),
      })
    } finally {
      client.release()
    }
  })
}
