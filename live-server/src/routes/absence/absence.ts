import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { listCrewAbsences } from '../../services/absence/crew-absence-service.js'
import { error, fail, success } from '../../utils/response.js'

/**
 * Planner-side crew absence records (crew recovery story 101, step 5).
 * JWT-protected; the crew-app submission endpoint lives under /api/crew-app/v1.
 */
const listSchema = z.object({
  crewId: z.string().trim().max(30).optional(),
  status: z.enum(['active', 'cancelled']).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export default async function absenceRoutes(fastify: FastifyInstance) {
  // GET /api/absence?crewId=&status=&fromDate=&toDate=
  fastify.get('/', async (request, reply) => {
    const parsed = listSchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }
    try {
      return success(reply, await listCrewAbsences(fastify, parsed.data))
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status && status >= 400 && status < 500) return error(reply, status, (err as Error).message)
      fastify.log.error(err, 'crew absence list failed')
      return error(reply, 500, 'Unable to load crew absences.')
    }
  })
}
