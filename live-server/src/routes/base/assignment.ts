import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { assignmentService } from '../../services/base/assignment-service.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

// ── Assignment schemas ──

const createAssignmentSchema = z.object({
  assignment: z.string().max(20),
  description: z.string().max(100),
  type: z.enum(['L', 'O', 'W', 'T', 'S']),
  isRest: z.number().int().min(0).max(1).default(0),
  colorHex: z.string().max(6),
  label: z.string().max(100).nullish(),
  standalone: z.string().max(1).nullish(),
  btPct: z.string().nullish(),
  fdpPct: z.string().nullish(),
  dpPct: z.string().nullish(),
  isAdhoc: z.number().int().default(0),
  defaultLocation: z.string().max(3).nullish(),
  isRecency: z.number().int().default(0),
  fixedStrTm: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  fixedEndTm: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  fixedDurationMin: z.number().int().nullish(),
  displayLabelWhenAvailable: z.string().max(1).default('N'),
  defaultAssignmentGroup: z.string().max(20).nullish(),
  ftPct: z.string().default('0'),
  isQualifier: z.number().int().default(0),
  wpPct: z.string().default('0'),
  restTime: z.number().int().nullish(),
  divideCrewManday: z.string().max(1).default('E'),
  recaLabel: z.string().max(1).default('Y'),
  orientation: z.string().max(20).nullish(),
  pairingLabelColorHex: z.string().max(6).nullish(),
  segmentLabelColorHex: z.string().max(6).nullish(),
  tmCreditFlag: z.number().int().nullish(),
  assignmentUnitType: z.string().max(20).nullish(),
  dpGap: z.number().int().default(0),
  beforePctDpGapMin: z.number().int().nullish(),
  afterPctDpGapMin: z.number().int().nullish(),
})

const updateAssignmentSchema = createAssignmentSchema.partial()

// ── Assignment Group schemas ──

const createGroupSchema = z.object({
  assignmentGroup: z.string().max(15),
  name: z.string().max(100),
  allowOverlap: z.number().int().default(0),
  optimizerIndicator: z.number().int(),
})

const updateGroupSchema = createGroupSchema.partial()

// ── Assignment Group Map schema ──

const createGroupMapSchema = z.object({
  assignmentGroupId: z.number().int().positive(),
  assignmentId: z.number().int().positive(),
})

export default async function assignmentRoutes(fastify: FastifyInstance) {
  // ── Assignment CRUD ──

  fastify.get('/', async (_request, reply) => {
    const data = await assignmentService.list(fastify)
    return success(reply, data)
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await assignmentService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createAssignmentSchema.parse(request.body)
    const data = await assignmentService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateAssignmentSchema.parse(request.body)
    const data = await assignmentService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await assignmentService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })

  // ── Assignment Group ──

  fastify.get('/group', async (_request, reply) => {
    const data = await assignmentService.listGroups(fastify)
    return success(reply, data)
  })

  fastify.get('/group/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await assignmentService.getGroupById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/group', async (request, reply) => {
    const body = createGroupSchema.parse(request.body)
    const data = await assignmentService.createGroup(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/group/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateGroupSchema.parse(request.body)
    const data = await assignmentService.updateGroup(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/group/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await assignmentService.removeGroup(fastify, id)
    return success(reply, null, 'Deleted')
  })

  // ── Assignment Group Map ──

  fastify.get('/group-map', async (_request, reply) => {
    const data = await assignmentService.listGroupMaps(fastify)
    return success(reply, data)
  })

  fastify.get('/group-map/group/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await assignmentService.getGroupMapsByGroupId(fastify, id)
    return success(reply, data)
  })

  fastify.post('/group-map', async (request, reply) => {
    const body = createGroupMapSchema.parse(request.body)
    const data = await assignmentService.createGroupMap(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.delete('/group-map/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await assignmentService.removeGroupMap(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
