import { z } from 'zod'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { recompute, findStaleFdCrews } from '../../services/manday/manday-tool.js'
import { liveSchemaName } from '../../utils/db-schema.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const MANDAY_REFRESH_MENU_CODE = 'MANDAY_REFRESH'

const querySchema = z.object({
  startDt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDt:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // 'ghosts' = repair only the stale FD crews in the window (credit > 0, zero flying duties).
  scope: z.enum(['all', 'ghosts']).optional(),
})

export default async function mandayCreditRefreshAdminRoutes(fastify: FastifyInstance) {
  const requireMandayRefreshPermission = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return false
    }
    return requireMenuAccess(fastify, authUser, reply, MANDAY_REFRESH_MENU_CODE)
  }

  /**
   * POST /api/admin/manday-credit-refresh
   *
   * Recompute crew-manday credit/blh/flags from roster_flight via the unified driver.
   * blh is always recomputed from flight.blk_min (roster_flight.flt_id → flight).
   *
   * Optional query params:
   *   startDt  YYYY-MM-DD  only duties with sch_str_dt_utc >= startDt
   *   endDt    YYYY-MM-DD  only duties with sch_str_dt_utc <  endDt + 1 day
   *   scope    'all' (default) | 'ghosts'  — 'ghosts' scopes the recompute to FD crews whose
   *            monthly credit is stale (>0) yet have no flying duty in the window (startDt
   *            required).
   *
   * Requires MANDAY_REFRESH menu permission (admins always pass).
   */
  fastify.post('/manday-credit-refresh', async (request, reply) => {
    if (!(await requireMandayRefreshPermission(request, reply))) return reply

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })
    }
    const { startDt, endDt, scope = 'all' } = parsed.data
    const updatedBy = `admin:${request.authUser!.userCode}`

    if (scope === 'ghosts') {
      if (!startDt || !endDt) {
        return reply.status(400).send({ code: 400, data: null, message: 'ghosts scope requires startDt and endDt' })
      }
      const ghosts = await findStaleFdCrews(fastify.pgPool, { startDt, endDt })
      const result = ghosts.length
        ? await recompute(fastify.pgPool, { schema: liveSchemaName(), crewIds: ghosts, startDt, endDt, updatedBy })
        : { crews: 0, daily: 0, monthly: 0, yearly: 0 }
      fastify.log.info({ scope, startDt, endDt, ghosts: ghosts.length, ...result, triggeredBy: request.authUser!.userCode }, 'manday ghost-repair completed')
      return reply.send({ code: 200, data: { scope, ghosts: ghosts.length, crewIds: ghosts, ...result, startDt, endDt }, message: 'ok' })
    }

    const result = await recompute(fastify.pgPool, { schema: liveSchemaName(), startDt, endDt, updatedBy })
    fastify.log.info({ scope, startDt, endDt, ...result, triggeredBy: request.authUser!.userCode }, 'manday-credit-refresh completed')
    return reply.send({ code: 200, data: { scope, ...result, startDt: startDt ?? null, endDt: endDt ?? null }, message: 'ok' })
  })
}
