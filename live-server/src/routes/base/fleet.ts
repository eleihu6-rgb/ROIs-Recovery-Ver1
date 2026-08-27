import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { fleetService } from '../../services/base/fleet-service.js'
import { filterByScope, resolveRequestDataScope } from '../../services/permission/scope-option.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const createFleetSchema = z.object({
  fleet: z.string().max(10),
  description: z.string().max(30).nullish(),
  displayOrder: z.number().int(),
  fleetGrp: z.string().max(20),
  acType: z.string().max(10),
  restfacility: z.number().int().default(0),
  marketAcType: z.string().max(30).nullish(),
  body: z.string().max(1).nullish(),
})

const updateFleetSchema = createFleetSchema.partial()

export default async function fleetRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const data = await fleetService.list(fastify)
    const scope = await resolveRequestDataScope(fastify.db, fastify.redis, request.authUser)
    return success(reply, filterByScope(data, scope, 'FLEET', (f) => f.fleet))
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await fleetService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createFleetSchema.parse(request.body)
    const data = await fleetService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateFleetSchema.parse(request.body)
    const data = await fleetService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await fleetService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
