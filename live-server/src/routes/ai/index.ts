import type { FastifyInstance } from 'fastify'
import { success } from '../../utils/response.js'
import { hintsService } from '../../services/ai/hints-service.js'

export default async function aiRoutes(fastify: FastifyInstance) {
  // Representative base/rank/fleet/crewId for R'Bot example prompts (client-specific,
  // cached). The Gantt frontend stores this in localStorage so the suggestion block
  // renders instantly without a per-open API pull.
  fastify.get('/api/ai/hints', async (_request, reply) => {
    const data = await hintsService.get(fastify)
    return success(reply, data)
  })
}
