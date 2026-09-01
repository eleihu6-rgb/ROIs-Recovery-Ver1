import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { flightService } from '../../services/flight/flight-service.js'
import { refreshLiveLegalityAndManday } from '../../services/manday/manday-operation-service.js'
import { mandayMutationWindow } from '../../services/manday/manday-mutation-window.js'
import { notifyRosterTasksChanged } from '../../services/roster/roster-change-notifier.js'
import { liveSchemaName } from '../../utils/db-schema.js'

// Same padding as roster.ts's recomputeForMutation — kept in sync deliberately (§Minimal-First:
// no shared constant exists yet for a single call site each; duplicating two numbers here is
// cheaper than introducing a cross-route import for it).
const MANDAY_BACK_DAYS = 2
const MANDAY_FWD_DAYS = 10

/**
 * Mirrors roster.ts's recomputeForMutation for the flight-edit cascade: recomputes legality +
 * Manday KPI for crews whose roster_flight rows were touched by propagateFlightActualTimeChange,
 * then broadcasts manday-updated (refreshLiveLegalityAndManday's own recomputeMandayAndNotify
 * already broadcasts roster-updated and bumps the roster chunk cache).
 */
const recomputeForFlightMutation = async (
  fastify: FastifyInstance,
  schema: string,
  crewIds: string[],
  refDates: Array<Date | string | null | undefined>,
  username: string,
  pairingIds: number[] = [],
): Promise<void> => {
  const ids = [...new Set(crewIds.filter((id) => !!id))]
  const dates = refDates
    .map((date) => date instanceof Date ? date : (date ? new Date(date) : null))
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
  if (!ids.length || dates.length === 0) return
  const window = await mandayMutationWindow(fastify, ids, dates, {
    backDays: MANDAY_BACK_DAYS,
    forwardDays: MANDAY_FWD_DAYS,
  })
  if (!window) return
  await refreshLiveLegalityAndManday(fastify, {
    crewIds: ids,
    legalityDates: dates,
    startDt: window.startDt,
    endDt: window.endDt,
    updatedBy: username,
    pairingIds,
  })
  fastify.wsBroadcastAll(schema, { type: 'manday-updated', crewIds: ids })
}

export default async function flightRoutes(fastify: FastifyInstance) {
  // GET /api/flight — grouped list with pagination (FlightItem)
  fastify.get('/', async (request, reply) => {
    const schema = z.object({
      startDate: z.string().default(new Date().toISOString().slice(0, 10)),
      endDate: z.string().default(new Date().toISOString().slice(0, 10)),
      depArp: z.string().length(3).optional(),
      arvArp: z.string().length(3).optional(),
      fltNum: z.string().optional(),
      fleet: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().min(0).max(10000).default(20),
      // 'grouped' (default, unchanged) = register/fleet bin-packed FlightItems (loads all
      // matching rows to group globally). 'none' = windowed flat rows paginated in SQL —
      // lighter/faster first paint for long ranges, no global in-memory bin-packing.
      grouping: z.enum(['grouped', 'none']).default('grouped'),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await flightService.listGrouped(fastify, parsed.data)
    return success(reply, result)
  })

  // GET /api/flight/navi-counts — per-flight pairing & crew counts for the Flight Navi table
  fastify.get('/navi-counts', async (request, reply) => {
    const schema = z.object({
      startDate: z.string(),
      endDate: z.string(),
    })
    const parsed = schema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }
    try {
      const result = await flightService.naviCounts(fastify, parsed.data.startDate, parsed.data.endDate)
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err }, 'flightService.naviCounts failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/flight/compositions — bulk per-flight composition (plan/actual)
  fastify.post('/compositions', async (request, reply) => {
    const schema = z.object({
      flightIds: z.array(z.number().int().positive()).max(1000),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }
    try {
      const result = await flightService.getCompositions(fastify, parsed.data.flightIds)
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err }, 'flightService.getCompositions failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/flight/:id — detail with compositions
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    try {
      const result = await flightService.getById(fastify, numId)
      if (!result) {
        return fail(reply, 404, 'Flight not found')
      }
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err, id: numId }, 'flightService.getById failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/flight/:id/crew — crew assignments for flight detail
  fastify.get('/:id/crew', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    try {
      const result = await flightService.getCrewList(fastify, numId)
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err, id: numId }, 'flightService.getCrewList failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/flight/:id/pairings — distinct pairing ids this flight is rostered into
  fastify.get('/:id/pairings', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    try {
      const result = await flightService.getPairingIds(fastify, numId)
      return success(reply, result)
    } catch (err) {
      fastify.log.error({ err, id: numId }, 'flightService.getPairingIds failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/flight — create single flight
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await flightService.create(fastify, body as never, username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PUT /api/flight/:id — update a flight's scheduled/actual departure & arrival times
  // (STD/STA/ATD/ATA) and, optionally, fleet/register, e.g. from the Gantt Flight Detail edit dialog.
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const schema = z.object({
      schDepDtUtc: z.string().datetime({ offset: true }),
      schArvDtUtc: z.string().datetime({ offset: true }),
      actDepDtUtc: z.string().datetime({ offset: true }),
      actArvDtUtc: z.string().datetime({ offset: true }),
      fleet: z.string().min(1).optional(),
      register: z.string().min(1).nullable().optional(),
    }).refine((d) => new Date(d.schArvDtUtc) > new Date(d.schDepDtUtc), {
      message: 'schArvDtUtc must be after schDepDtUtc',
    }).refine((d) => new Date(d.actArvDtUtc) > new Date(d.actDepDtUtc), {
      message: 'actArvDtUtc must be after actDepDtUtc',
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const username = request.authUser?.userCode ?? 'system'
    const { schDepDtUtc, schArvDtUtc, actDepDtUtc, actArvDtUtc, fleet, register } = parsed.data

    try {
      const result = await flightService.update(fastify, numId, {
        schDepDtUtc: new Date(schDepDtUtc),
        schArvDtUtc: new Date(schArvDtUtc),
        actDepDtUtc: new Date(actDepDtUtc),
        actArvDtUtc: new Date(actArvDtUtc),
        ...(fleet !== undefined ? { fleet } : {}),
        ...(register !== undefined ? { register } : {}),
      }, username)
      if (!result) {
        return fail(reply, 404, 'Flight not found')
      }
      if (result.affectedCrewIds.length > 0) {
        const schemaName = request.authUser?.schema ?? liveSchemaName()
        await recomputeForFlightMutation(
          fastify,
          schemaName,
          result.affectedCrewIds,
          [actDepDtUtc, actArvDtUtc],
          username,
          result.affectedPairingIds,
        )
      } else if (result.affectedPairingIds.length > 0) {
        // Segments were touched on an OPEN pairing (no crew assigned yet) — nothing to
        // recompute legality/KPI for, but the Pairing-pane ghost bar still needs a broadcast
        // so already-open clients refetch (flight-service.ts's cache invalidation already
        // busted pairing:*/pairing-segments:* unconditionally; this fires the missing
        // notification half of that same cascade).
        const schemaName = request.authUser?.schema ?? liveSchemaName()
        await notifyRosterTasksChanged(fastify, {
          schema: schemaName,
          crewIds: [],
          pairingIds: result.affectedPairingIds,
        })
      }
      return success(reply, result.flight)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/flight/:id/cancel — mark a flight cancelled (fltSts = 'CX')
  fastify.post('/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const username = request.authUser?.userCode ?? 'system'

    try {
      const result = await flightService.cancel(fastify, numId, username)
      if (!result) {
        return fail(reply, 404, 'Flight not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/flight/:id/restore — clear a flight's cancelled status
  fastify.post('/:id/restore', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const username = request.authUser?.userCode ?? 'system'

    try {
      const result = await flightService.restore(fastify, numId, username)
      if (!result) {
        return fail(reply, 404, 'Flight not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/flight/:id — soft delete
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const username = ((request.query as Record<string, string>).username) ?? 'system'

    try {
      const result = await flightService.remove(fastify, numId, username)
      if (!result) {
        return fail(reply, 404, 'Flight not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/flight/batch — batch import flights
  fastify.post('/batch', async (request, reply) => {
    const body = request.body as { flights: Record<string, unknown>[]; username?: string }

    if (!Array.isArray(body.flights) || body.flights.length === 0) {
      return fail(reply, 400, 'flights array is required and must not be empty')
    }

    const username = body.username ?? 'system'

    try {
      const result = await flightService.batchImport(fastify, body.flights as never[], username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })
}
