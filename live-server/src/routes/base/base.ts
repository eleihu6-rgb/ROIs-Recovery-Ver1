import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { baseService } from '../../services/base/base-service.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const createBaseSchema = z.object({
  filiale: z.string().max(6),
  base: z.string().max(3),
  name: z.string().max(20).nullish(),
  displayOrder: z.number().int(),
  isPrimeDisplayBase: z.number().int(),
})

const updateBaseSchema = createBaseSchema.partial()

export default async function baseRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    const data = await baseService.list(fastify)
    return success(reply, data)
  })

  fastify.get('/timezone-options', async (_request, reply) => {
    const data = await baseService.getTimezoneOptions(fastify)
    return success(reply, data)
  })

  fastify.get('/airport-timezones', async (_request, reply) => {
    const data = await baseService.getAirportTimezones(fastify)
    return success(reply, data)
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await baseService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createBaseSchema.parse(request.body)
    const data = await baseService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateBaseSchema.parse(request.body)
    const data = await baseService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await baseService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
