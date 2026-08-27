import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { compositionService } from '../../services/base/composition-service.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

// ── Composition schemas ──

const createCompositionSchema = z.object({
  filiale: z.string().max(6).nullish(),
  division: z.string().max(2),
  name: z.string().max(30),
  nameDesc: z.string().max(50).nullish(),
  displayOrder: z.number().int(),
  hierarchy: z.number().int().nullish(),
})

const updateCompositionSchema = createCompositionSchema.partial()

// ── Composition Load schemas ──

const createLoadSchema = z.object({
  filiale: z.string().max(20),
  division: z.string().max(20),
  sequence: z.number().int(),
  fltNum: z.string().max(500).nullish(),
  fleet: z.string().max(30).nullish(),
  flightFlag: z.string().max(20).nullish(),
  fltType: z.string().max(1).nullish(),
  segType: z.string().max(5).nullish(),
  routeId: z.number().int().nullish(),
  loadFactor: z.string().max(15).nullish(),
  effDt: z.coerce.date(),
  expDt: z.coerce.date().nullish(),
  dow: z.string().max(7).default('1234567'),
  description: z.string().max(255).nullish(),
  compId: z.number().int().nullish(),
  subFleet: z.string().max(30).nullish(),
  flightAssignment: z.string().max(20).nullish(),
  serviceType: z.string().max(20).nullish(),
  paxNum: z.string().max(20).nullish(),
  restFacility: z.number().int().nullish(),
  departureTime: z.string().max(200).nullish(),
  arrivalTime: z.string().max(200).nullish(),
  optionId: z.number().int().nullish(),
  blhLow: z.string().max(200).nullish(),
  blhUpper: z.string().max(200).nullish(),
})

const updateLoadSchema = createLoadSchema.partial()

// ── Composition Rank schemas ──

const createRankSchema = z.object({
  compId: z.number().int().positive(),
  rank: z.string().max(30),
  planValue: z.number().int(),
  planValueExtra: z.number().int(),
  options: z.number().int().default(1),
})

const updateRankSchema = createRankSchema.partial()

export default async function compositionRoutes(fastify: FastifyInstance) {
  // ── Composition CRUD ──

  fastify.get('/', async (_request, reply) => {
    const data = await compositionService.list(fastify)
    return success(reply, data)
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await compositionService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.get('/:id/detail', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await compositionService.getDetailById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createCompositionSchema.parse(request.body)
    const data = await compositionService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateCompositionSchema.parse(request.body)
    const data = await compositionService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await compositionService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })

  // ── Composition Load ──

  fastify.get('/load', async (_request, reply) => {
    const data = await compositionService.listLoads(fastify)
    return success(reply, data)
  })

  fastify.get('/load/comp/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await compositionService.getLoadsByCompId(fastify, id)
    return success(reply, data)
  })

  fastify.post('/load', async (request, reply) => {
    const body = createLoadSchema.parse(request.body)
    const data = await compositionService.createLoad(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/load/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateLoadSchema.parse(request.body)
    const data = await compositionService.updateLoad(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/load/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await compositionService.removeLoad(fastify, id)
    return success(reply, null, 'Deleted')
  })

  // ── Composition Rank ──

  fastify.get('/rank', async (_request, reply) => {
    const data = await compositionService.listRanks(fastify)
    return success(reply, data)
  })

  fastify.get('/rank/comp/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await compositionService.getRanksByCompId(fastify, id)
    return success(reply, data)
  })

  fastify.post('/rank', async (request, reply) => {
    const body = createRankSchema.parse(request.body)
    const data = await compositionService.createRank(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/rank/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateRankSchema.parse(request.body)
    const data = await compositionService.updateRank(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/rank/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await compositionService.removeRank(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
