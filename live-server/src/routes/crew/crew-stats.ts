import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { crewStatsService } from '../../services/crew/crew-stats-service.js'

const statsQuerySchema = z.object({
  crewIds:       z.string().min(1),
  rosterPeriod:  z.string().regex(/^\d{4}RP\d{2}$/, 'rosterPeriod must be YYYYRPMM').optional(),
})

export default async function crewStatsRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/crew/stats?crewIds=C001,C002&rosterPeriod=2026RP07
   *
   * Returns manday stats (YBH/MBH/MCred/YAL/MAL/YDO/MDO) for multiple crews for the
   * given roster period. M* = that RP's totals; Y* = year-to-date across all RPs in
   * the RP's year. rosterPeriod defaults to a heuristic current RP (callers should
   * pass the real one resolved from the viewport).
   */
  fastify.get('/stats', async (request, reply) => {
    const parsed = statsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, `Invalid query: ${parsed.error.message}`)
    }

    const { crewIds: crewIdsStr, rosterPeriod } = parsed.data
    const crewIds = crewIdsStr.split(',').map((s) => s.trim()).filter(Boolean)
    if (crewIds.length === 0) {
      return fail(reply, 400, 'crewIds must contain at least one id')
    }

    const now = new Date()
    const rp = rosterPeriod ?? `${now.getUTCFullYear()}RP${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    try {
      const stats = await crewStatsService.getStats(fastify, crewIds, rp)
      return success(reply, stats)
    } catch (err) {
      fastify.log.error(err, 'crew stats query failed')
      return fail(reply, 500, 'Failed to fetch crew stats')
    }
  })
}
