import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { rankActingService } from '../../services/base/rank-acting-service.js'

/**
 * GET /api/rank-acting — list active rank_acting mappings for the request's filiale.
 * Used by gantt to feed the drag-drop pre-check.
 */
export default async function rankActingRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    try {
      // The auth schema is the database namespace (e.g. f8_sit_live), while
      // rank_acting.filiale stores the airline code (e.g. F8).
      const schema = request.authUser?.schema ?? ''
      const filiale = schema.split('_', 1)[0].toUpperCase()
      if (!filiale) {
        return fail(reply, 400, 'No schema in auth context')
      }
      const data = await rankActingService.listForFiliale(fastify, filiale)
      return success(reply, data)
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })
}
