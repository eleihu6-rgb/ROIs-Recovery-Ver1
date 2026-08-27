import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail, error } from '../../utils/response.js'
import { paginationQuerySchema } from '../../utils/pagination.js'
import {
  RosterPublishProductError,
  rosterPublishService,
} from '../../services/roster/roster-publish-service.js'

const statusSchema = z.enum(['ADD', 'UPDATE', 'DELETE', 'NO_CHANGE'])

const diffRequestSchema = z.object({
  rosterPeriodId: z.number().int().positive(),
  divisions: z.array(z.string()).optional(),
  crewFleets: z.array(z.string()).optional(),
  bases: z.array(z.string()).optional(),
  crewId: z.string().optional(),
  pairingId: z.number().int().positive().optional(),
  pairingLabel: z.string().optional(),
  publishStatus: z.enum(['ALL', 'PUBLISHED', 'UNPUBLISHED']).optional(),
  statuses: z.array(statusSchema).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().min(0).max(500).optional(),
})

const applyRequestSchema = z.object({
  rosterPeriodId: z.number().int().positive(),
  keys: z.array(z.string().min(1)).min(1),
})

export default async function rosterPublishRoutes(fastify: FastifyInstance) {
  // POST /api/roster/publish/diff — compare roster_flight with roster_publish
  fastify.post('/diff', async (request, reply) => {
    const parsed = diffRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    try {
      const result = await rosterPublishService.listDiff(fastify, parsed.data)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/roster/publish/apply — publish selected diff rows
  fastify.post('/apply', async (request, reply) => {
    const parsed = applyRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const username = request.authUser?.userCode ?? request.authUser?.userName ?? 'system'
    try {
      const result = await rosterPublishService.applyDiff(fastify, parsed.data, username)
      return success(reply, result)
    } catch (err) {
      if (err instanceof RosterPublishProductError) {
        return error(reply, err.statusCode, err.message)
      }
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/roster/publish — publish roster
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = request.authUser?.userCode ?? request.authUser?.userName ?? 'system'

    try {
      const result = await rosterPublishService.publish(fastify, body as never, username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/roster/publish/:crewId — get published roster for a crew
  fastify.get('/:crewId', async (request, reply) => {
    const { crewId } = request.params as { crewId: string }
    if (!crewId) {
      return fail(reply, 400, 'crewId is required')
    }

    const result = await rosterPublishService.getByCrewId(fastify, crewId)
    return success(reply, result)
  })

  // POST /api/roster/publish/adjust — record post-publish adjustment
  fastify.post('/adjust', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await rosterPublishService.createAdjust(fastify, body as never, username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/roster/publish/adjust/:crewId — list adjustments for a crew
  fastify.get('/adjust/:crewId', async (request, reply) => {
    const { crewId } = request.params as { crewId: string }
    if (!crewId) {
      return fail(reply, 400, 'crewId is required')
    }

    const parsed = paginationQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await rosterPublishService.listAdjustByCrewId(fastify, crewId, parsed.data)
    return success(reply, result)
  })
}
