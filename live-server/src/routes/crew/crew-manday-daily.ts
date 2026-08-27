import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { getCrewMandayDaily, isYmd } from '../../services/crew/crew-manday-daily-service.js'

const querySchema = z.object({
  crewId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
})

export default async function crewMandayDailyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/crew/manday-daily?crewId=&start=YYYY-MM-DD&end=YYYY-MM-DD
   *
   * Per-day credit + blh (minutes) for one crew over a crew_base_dt range.
   * FD/CC table chosen from crew.division.
   */
  fastify.get('/manday-daily', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, `Invalid query: ${parsed.error.message}`)
    }
    const { crewId, start, end } = parsed.data
    if (!isYmd(start) || !isYmd(end)) {
      return fail(reply, 400, 'start and end must be YYYY-MM-DD')
    }
    if (start > end) {
      return fail(reply, 400, 'start must be <= end')
    }

    try {
      const data = await getCrewMandayDaily(fastify, { crewId, start, end })
      if (!data) return fail(reply, 404, 'Crew not found')
      return success(reply, data)
    } catch (err) {
      fastify.log.error(err, 'crew manday-daily query failed')
      return fail(reply, 500, 'Failed to fetch crew manday daily')
    }
  })
}
