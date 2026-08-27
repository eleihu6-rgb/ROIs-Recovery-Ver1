import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { rankService } from '../../services/base/rank-service.js'
import { filterByScope, resolveRequestDataScope } from '../../services/permission/scope-option.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const createRankSchema = z.object({
  rank: z.string().max(10),
  division: z.string().max(10),
  displayOrder: z.number().int(),
  description: z.string().max(100).nullish(),
  isIncludeInFt: z.number().int().default(1),
  isActingRank: z.number().int().default(1),
  isCrewRank: z.number().int().default(1),
  isMustCrewRank: z.number().int().default(0),
})

const updateRankSchema = createRankSchema.partial()

export default async function rankRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const data = await rankService.list(fastify)
    const scope = await resolveRequestDataScope(fastify.db, fastify.redis, request.authUser)
    return success(reply, filterByScope(data, scope, 'RANK', (r) => r.rank))
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await rankService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createRankSchema.parse(request.body)
    const data = await rankService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateRankSchema.parse(request.body)
    const data = await rankService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await rankService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
