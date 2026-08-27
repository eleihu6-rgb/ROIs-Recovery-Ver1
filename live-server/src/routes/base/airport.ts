import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { airportService } from '../../services/base/airport-service.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const createAirportSchema = z.object({
  airport: z.string().max(3),
  airportName: z.string().max(100).nullish(),
  airportNativeName: z.string().max(100).nullish(),
  airportIcao: z.string().max(4).nullish(),
  airportAbbr: z.string().max(30).nullish(),
  city: z.string().max(3),
  category: z.string().max(3).nullish(),
  dir: z.string().max(1),
  zoneId: z.string().max(50),
  utcStandardOffset: z.number().int(),
  dstGrp: z.string().max(4).nullish(),
  plateauType: z.string().max(5).nullish(),
  cats: z.string().max(5).nullish(),
  rnp: z.string().max(5).nullish(),
  latitude: z.string().nullish(),
  longitude: z.string().nullish(),
  suitableAccommodation: z.number().int().nullish(),
  inPhone: z.string().max(200).nullish(),
  outPhone: z.string().max(200).nullish(),
  country: z.string().max(2).nullish(),
  state: z.number().int().nullish(),
  email: z.string().max(256).nullish(),
  icRoute: z.string().max(5).nullish(),
})

const updateAirportSchema = createAirportSchema.partial()

export default async function airportRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    const data = await airportService.list(fastify)
    return success(reply, data)
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await airportService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createAirportSchema.parse(request.body)
    const data = await airportService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateAirportSchema.parse(request.body)
    const data = await airportService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await airportService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
