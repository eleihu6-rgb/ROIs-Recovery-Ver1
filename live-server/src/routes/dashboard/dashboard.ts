import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { dashboardService } from '../../services/dashboard/dashboard-service.js'
import { handoverService } from '../../services/dashboard/handover-service.js'

const handoverQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const handoverBodySchema = z.object({
  shiftLabel: z.string().min(1).max(30),
  author: z.string().min(1).max(60),
  severity: z.enum(['info', 'watch', 'critical']).optional(),
  caseRef: z.string().max(20).optional(),
  note: z.string().min(1).max(2000),
})

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // GET /api/dashboard/overview
  fastify.get('/overview', async (_request, reply) => {
    const data = await dashboardService.overview(fastify)
    return success(reply, data)
  })

  // GET /api/dashboard/handover?limit=20
  fastify.get('/handover', async (request, reply) => {
    const result = handoverQuerySchema.safeParse(request.query)
    if (!result.success) {
      return fail(reply, 400, result.error.message)
    }
    const data = await handoverService.listRecent(fastify, result.data.limit ?? 20)
    return success(reply, data)
  })

  // POST /api/dashboard/handover
  fastify.post('/handover', async (request, reply) => {
    const result = handoverBodySchema.safeParse(request.body)
    if (!result.success) {
      return fail(reply, 400, result.error.message)
    }
    const userId = request.authUser?.userCode ?? result.data.author ?? 'system'
    const entry = await handoverService.addEntry(fastify, result.data, userId)
    return success(reply, entry)
  })
}
