import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { getCrewMandayDaily, isYmd } from '../../services/crew/crew-manday-daily-service.js'

const querySchema = z.object({
  crewId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
})

/**
 * GET /api/scenario/:id/manday-daily?crewId=&start=&end=
 * Scenario-schema daily manday (credit + blh) for one crew.
 */
export default async function scenarioMandayDailyRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>('/:id/manday-daily', async (request, reply) => {
    const scenarioId = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(scenarioId)) {
      return fail(reply, 400, 'Invalid scenario id')
    }

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
      const data = await getCrewMandayDaily(fastify, { crewId, start, end, scenarioId })
      if (!data) return fail(reply, 404, 'Crew not found')
      return success(reply, data)
    } catch (err) {
      fastify.log.error(err, 'scenario manday-daily query failed')
      return fail(reply, 500, 'Failed to fetch scenario manday daily')
    }
  })
}
