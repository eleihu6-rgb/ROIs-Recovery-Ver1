import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  authenticateAndLoadMobileRoster,
  MobileRosterServiceError,
} from '../../services/mobile-roster/mobile-roster-service.js'
import { error, fail, success } from '../../utils/response.js'

const loginSchema = z.object({
  airline: z.literal('F8'),
  crewId: z.string().trim().min(1),
  password: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()

export default async function mobileRosterRoutes(fastify: FastifyInstance) {
  fastify.post('/session', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    try {
      const roster = await authenticateAndLoadMobileRoster(
        { pgPool: fastify.pgPool },
        parsed.data,
      )
      return success(reply, roster)
    } catch (err) {
      if (err instanceof MobileRosterServiceError) {
        return error(reply, err.statusCode, err.message)
      }
      fastify.log.error(err, 'mobile roster session failed')
      return error(reply, 500, 'Unable to load mobile roster.')
    }
  })
}
