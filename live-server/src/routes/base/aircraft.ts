import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { aircraftService } from '../../services/base/aircraft-service.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const createAircraftSchema = z.object({
  filiale: z.string().max(6),
  acReg: z.string().max(20),
  fleet: z.string().max(12),
  fleetGrp: z.string().max(12).nullish(),
  acType: z.string().max(12).nullish(),
  dow: z.number().int().default(0),
  dowL: z.number().int().default(0),
  doi: z.string().default('0'),
  doiL: z.string().default('0'),
  flyDevice: z.string().max(12).nullish(),
  maxDepartWeight: z.number().int().default(0),
  maxLandfallWeight: z.number().int().default(0),
  maxNoOilWeight: z.number().int().default(0),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  seats: z.number().int().default(0),
  isCat2: z.number().int().default(0),
  restfacility: z.number().int().default(0),
  maxSlideWeight: z.number().int().nullish(),
  longAcType: z.string().max(20).nullish(),
  subFleet: z.string().max(12).nullish(),
})

const updateAircraftSchema = createAircraftSchema.partial()

export default async function aircraftRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    const data = await aircraftService.list(fastify)
    return success(reply, data)
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await aircraftService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createAircraftSchema.parse(request.body)
    const data = await aircraftService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateAircraftSchema.parse(request.body)
    const data = await aircraftService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await aircraftService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
