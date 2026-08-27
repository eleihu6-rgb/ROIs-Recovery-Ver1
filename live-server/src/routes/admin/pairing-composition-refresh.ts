import { z } from 'zod'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { invalidatePattern } from '../../utils/cache.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const LEGALITY_COMPOSITION_MENU_CODE = 'LEGALITY_COMPOSITION'

const querySchema = z.object({
  startDt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDt:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export default async function pairingCompositionRefreshAdminRoutes(fastify: FastifyInstance) {
  const requirePairingCompositionRefreshPermission = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return false
    }
    return requireMenuAccess(fastify, authUser, reply, LEGALITY_COMPOSITION_MENU_CODE)
  }

  /**
   * POST /api/admin/pairing-composition-refresh
   *
   * Recompute pairing_composition.fill for all (or a date-range-filtered subset of) pairings.
   * fill = COUNT(DISTINCT crew_id) from roster_flight per (pairing_id, acting_rank).
   *
   * Optional query params:
   *   startDt  YYYY-MM-DD  only pairings with sch_str_dt_utc >= startDt
   *   endDt    YYYY-MM-DD  only pairings with sch_str_dt_utc <  endDt + 1 day
   *
   * Requires LEGALITY_COMPOSITION menu permission (admins always pass).
   */
  fastify.post('/pairing-composition-refresh', async (request, reply) => {
    if (!(await requirePairingCompositionRefreshPermission(request, reply))) return reply

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })
    }

    const { startDt, endDt } = parsed.data

    const result = await (startDt || endDt
      ? fastify.db.execute(sql`
          UPDATE pairing_composition pc
          SET fill       = (
                SELECT COUNT(DISTINCT rf.crew_id)
                FROM   roster_flight rf
                WHERE  rf.pairing_id         = pc.pairing_id
                  AND  rf.roster_acting_rank = pc.acting_rank
                  AND  rf.is_deleted         = 0
              ),
              updated_at = now(),
              updated_by = ${'admin:' + request.authUser!.userCode}
          WHERE pc.is_deleted = 0
            AND pc.pairing_id IN (
                  SELECT id FROM pairing
                  WHERE  is_deleted = 0
                    AND  (${startDt ?? null}::date IS NULL OR sch_str_dt_utc >= ${startDt ?? null}::date)
                    AND  (${endDt   ?? null}::date IS NULL OR sch_str_dt_utc <  (${endDt ?? null}::date + INTERVAL '1 day'))
                )
        `)
      : fastify.db.execute(sql`
          UPDATE pairing_composition pc
          SET fill       = (
                SELECT COUNT(DISTINCT rf.crew_id)
                FROM   roster_flight rf
                WHERE  rf.pairing_id         = pc.pairing_id
                  AND  rf.roster_acting_rank = pc.acting_rank
                  AND  rf.is_deleted         = 0
              ),
              updated_at = now(),
              updated_by = ${'admin:' + request.authUser!.userCode}
          WHERE pc.is_deleted = 0
        `))

    const updatedCount = result.rowCount ?? 0
    await invalidatePattern(fastify.redis, 'pairing:list:*')

    fastify.log.info(
      { startDt, endDt, updatedCount, triggeredBy: request.authUser!.userCode },
      'pairing-composition-refresh completed',
    )

    return reply.send({
      code: 200,
      data: { updatedCount, startDt: startDt ?? null, endDt: endDt ?? null },
      message: 'ok',
    })
  })
}
