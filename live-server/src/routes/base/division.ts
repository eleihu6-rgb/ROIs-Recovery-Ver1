import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { divisionService } from '../../services/base/division-service.js'
import { filterByScope, resolveRequestDataScope } from '../../services/permission/scope-option.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const createDivisionSchema = z.object({
  division: z.string().max(1),
  description: z.string().max(20).nullish(),
})

const updateDivisionSchema = createDivisionSchema.partial()

export default async function divisionRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const data = await divisionService.list(fastify)
    const scope = await resolveRequestDataScope(fastify.db, fastify.redis, request.authUser)
    return success(reply, filterByScope(data, scope, 'DIVISION', (d) => d.division))
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await divisionService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createDivisionSchema.parse(request.body)
    const data = await divisionService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateDivisionSchema.parse(request.body)
    const data = await divisionService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await divisionService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
