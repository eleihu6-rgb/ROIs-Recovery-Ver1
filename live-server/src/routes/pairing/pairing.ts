import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { paginationQuerySchema } from '../../utils/pagination.js'
import { pairingService } from '../../services/pairing/pairing-service.js'
import { updateDutyNodes } from '../../services/pairing/pairing-duty-node-service.js'

const doubleSchema = z.object({
  restAfterSegSeq: z.number().int().positive(),
  pickupStartUtc:  z.string().datetime(),
  briefStartUtc:   z.string().datetime(),
  debriefEndUtc:   z.string().datetime(),
  dropoffEndUtc:   z.string().datetime(),
})

const dutySchema = z.object({
  dutySeq:        z.number().int().positive(),
  pickupStartUtc: z.string().datetime(),
  briefStartUtc:  z.string().datetime(),
  debriefEndUtc:  z.string().datetime(),
  dropoffEndUtc:  z.string().datetime(),
  double:         doubleSchema.nullable().optional(),
})

const bodySchema = z.object({
  duties: z.array(dutySchema).min(1),
})

export default async function pairingRoutes(fastify: FastifyInstance) {
  // GET /api/pairing — list with date range + pagination + filters
  fastify.get('/', async (request, reply) => {
    const schema = paginationQuerySchema.extend({
      startDate: z.string().default(new Date().toISOString().slice(0, 10)),
      endDate: z.string().default(new Date().toISOString().slice(0, 10)),
      sortBy: z.enum(['schStrDtUtc', 'pairingLabel', 'tafb', 'fleet', 'base', 'segCount', 'durationDays']).default('schStrDtUtc'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
      // Filter params
      label: z.string().max(50).optional(),
      fleet: z.string().max(20).optional(),
      base: z.string().max(3).optional(),
      division: z.string().max(1).optional(),
      segFltNum: z.string().max(10).optional(),
      depArp: z.string().max(3).optional(),
      isFull: z.coerce.boolean().optional(),
      // Payload mode: 'detail' (default, unchanged) returns full per-pairing segment arrays;
      // 'summary' omits segments for lighter Gantt list rows (composition kept for coverage badges).
      view: z.enum(['summary', 'detail']).default('detail'),
      // Coverage: comma-separated crewing states (open,partial,full,over) → keep matching; drop unknown tokens
      coverage: z.string().max(40).optional()
        .transform((s) =>
          s == null ? s
            : s.split(',').map((t) => t.trim()).filter((t) => ['open', 'partial', 'full', 'over'].includes(t)).join(','),
        ),
      // Pairing type: comma-separated assignment codes (e.g. FLT,SBY) → OR match
      assignments: z.string().max(200).optional()
        .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined)),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await pairingService.list(fastify, parsed.data)
    return success(reply, result)
  })

  // GET /api/pairing/types — distinct assignment (type) codes present on pairings,
  // for the Pairing Type filter dropdown. Registered before /:id so it isn't
  // captured as an id param.
  fastify.get('/types', async (_request, reply) => {
    const data = await pairingService.listAssignmentTypes(fastify)
    return success(reply, data)
  })

  // GET /api/pairing/assignment-groups — distinct assignment_group codes
  // present on live pairings, for Scenario Pairing Type scope.
  fastify.get('/assignment-groups', async (_request, reply) => {
    const data = await pairingService.listAssignmentGroups(fastify)
    return success(reply, data)
  })

  // GET /api/pairing/:id — detail with segments + compositions
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const result = await pairingService.getById(fastify, numId)
    if (!result) {
      return fail(reply, 404, 'Pairing not found')
    }
    return success(reply, result)
  })

  // GET /api/pairing/:id/crew — distinct crew IDs assigned to this pairing
  fastify.get('/:id/crew', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }
    try {
      const result = await pairingService.getCrewIds(fastify, numId)
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err, id: numId }, 'pairingService.getCrewIds failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/pairing/:id/crew-detail — rostered crew with Pairing Info popup detail
  fastify.get('/:id/crew-detail', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }
    try {
      const result = await pairingService.listCrewDetail(fastify, numId)
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err, id: numId }, 'pairingService.listCrewDetail failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/pairing — create
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingService.create(fastify, body as never, username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PUT /api/pairing/:id — update
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingService.update(fastify, numId, body as never, username)
      if (!result) {
        return fail(reply, 404, 'Pairing not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/pairing/:id — hard delete (blocked when roster_flight exists)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    try {
      await pairingService.remove(fastify, numId)
      return success(reply, null)
    } catch (err) {
      const e = err as Error & { statusCode?: number }
      if (e.statusCode === 409) return fail(reply, 409, e.message)
      return error(reply, 500, e.message)
    }
  })

  // POST /api/pairing/:id/delete — hard delete (POST to avoid CORS preflight)
  fastify.post('/:id/delete', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    try {
      await pairingService.remove(fastify, numId)
      return success(reply, null)
    } catch (err) {
      const e = err as Error & { statusCode?: number }
      if (e.statusCode === 409) return fail(reply, 409, e.message)
      return error(reply, 500, e.message)
    }
  })

  // POST /api/pairing/create-from-flights — create pairing from selected flights
  fastify.post('/create-from-flights', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const flightIds = body.flightIds as number[]
    if (!Array.isArray(flightIds) || flightIds.length === 0) {
      return fail(reply, 400, 'flightIds array is required')
    }
    const base = (body.base as string) ?? 'TPE'
    const division = (body.division as string) ?? 'P'
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingService.createFromFlights(fastify, flightIds, base, division, username)
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })

  // --- Pairing Segment ---

  // POST /api/pairing/:pairingId/segment — add a flight as a new segment
  fastify.post('/:id/segment', async (request, reply) => {
    const { id } = request.params as { id: string }
    const pairingId = Number(id)
    if (Number.isNaN(pairingId)) return fail(reply, 400, 'Invalid pairing id')

    const body = request.body as Record<string, unknown>
    const flightId = Number(body.flightId)
    if (Number.isNaN(flightId)) return fail(reply, 400, 'Invalid flight id')

    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingService.addSegment(fastify, pairingId, flightId, username)
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })

  // --- Pairing Composition ---

  // GET /api/pairing/:id/composition
  fastify.get('/:id/composition', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const result = await pairingService.getCompositions(fastify, numId)
    return success(reply, result)
  })

  // POST /api/pairing/:id/composition
  fastify.post('/:id/composition', async (request, reply) => {
    const { id } = request.params as { id: string }
    const pairingId = Number(id)
    if (Number.isNaN(pairingId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingService.createComposition(
        fastify,
        { ...body, pairingId } as never,
        username,
      )
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PUT /api/pairing/composition/:compId
  fastify.put('/composition/:compId', async (request, reply) => {
    const { compId } = request.params as { compId: string }
    const numId = Number(compId)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid compId')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingService.updateComposition(fastify, numId, body as never, username)
      if (!result) {
        return fail(reply, 404, 'Composition not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/pairing/composition/:compId
  fastify.delete('/composition/:compId', async (request, reply) => {
    const { compId } = request.params as { compId: string }
    const numId = Number(compId)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid compId')
    }

    const username = ((request.query as Record<string, string>).username) ?? 'system'

    try {
      const result = await pairingService.removeComposition(fastify, numId, username)
      if (!result) {
        return fail(reply, 404, 'Composition not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // --- Pairing Memo (no cache) ---

  // GET /api/pairing/:id/memo
  fastify.get('/:id/memo', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const result = await pairingService.getMemos(fastify, numId)
    return success(reply, result)
  })

  // POST /api/pairing/:id/memo
  fastify.post('/:id/memo', async (request, reply) => {
    const { id } = request.params as { id: string }
    const pairingId = Number(id)
    if (Number.isNaN(pairingId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingService.createMemo(
        fastify,
        { ...body, pairingId } as never,
        username,
      )
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/pairing/memo/:memoId
  fastify.delete('/memo/:memoId', async (request, reply) => {
    const { memoId } = request.params as { memoId: string }
    const numId = Number(memoId)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid memoId')
    }

    try {
      await pairingService.deleteMemo(fastify, numId)
      return success(reply, null)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // --- Import from Scenario ---

  // POST /api/pairing/import-from-scenario
  fastify.post('/import-from-scenario', async (request, reply) => {
    const body = request.body as { scenarioId: number; username?: string }

    if (!body.scenarioId) {
      return fail(reply, 400, 'scenarioId is required')
    }

    const username = body.username ?? 'system'

    try {
      const result = await pairingService.importFromScenario(fastify, body.scenarioId, username)
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })

  // PATCH /api/pairing/:id/duty-nodes — update duty node timestamps
  fastify.patch('/:id/duty-nodes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const username = (request as any).authUser?.userCode ?? 'system'

    try {
      const updated = await updateDutyNodes(fastify, numId, parsed.data.duties, username)
      return success(reply, { updated })
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('briefStartUtc') || msg.includes('restAfterSegSeq') || msg.includes('pickupStartUtc') || msg.includes('debriefEndUtc') || msg.includes('dropoffEndUtc')) {
        return fail(reply, 400, msg)
      }
      return error(reply, 500, msg)
    }
  })
}
