import type { FastifyInstance } from 'fastify'
import { success } from '../../utils/response.js'
import { dashboardService } from '../../services/dashboard/dashboard-service.js'

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // GET /api/dashboard/overview
  fastify.get('/overview', async (_request, reply) => {
    const data = await dashboardService.overview(fastify)
    return success(reply, data)
  })
}
