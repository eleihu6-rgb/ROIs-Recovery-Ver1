import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { rosterService } from '../../services/roster/roster-service.js'
import { recheckLiveRosterMutation } from '../../services/rule/legality-recheck.js'
import { recomputeMandayAndNotify } from '../../services/manday/manday-operation-service.js'
import { mandayMutationWindow } from '../../services/manday/manday-mutation-window.js'
import { liveSchemaName } from '../../utils/db-schema.js'
import type { RosterBulkDeleteProgress } from '../../workers/roster-bulk-delete-worker.js'
import {
  mutationConflictMessage,
  mutationExclusiveService,
} from '../../services/lock/mutation-exclusive-service.js'
import { precheckAssignment } from '../../services/assignment/precheck-service.js'

// Recompute window padding around the mutated task date (a pairing spans duties forward;
// the back pad absorbs timezone skew where the local crew_base_dt is a day before UTC start).
const MANDAY_BACK_DAYS = 2
const MANDAY_FWD_DAYS = 10

const mutationRulesetId = (body: unknown): number | undefined => {
  const value = (body as { rulesetId?: unknown } | null)?.rulesetId
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const LIVE_ROSTER_SOURCES = ['IMP', 'MA', 'CR'] as const

const recheckMutation = (
  fastify: FastifyInstance,
  body: unknown,
  dates: Array<Date | string | null | undefined>,
  crewIds: Array<string | null | undefined> = [],
) => recheckLiveRosterMutation(
  fastify,
  mutationRulesetId(body),
  dates,
  [...new Set(crewIds.filter((id): id is string => !!id))],
)

/**
 * Synchronously recompute ALL manday KPIs (credit/blh/days-off/leave) for the affected crews
 * via the unified tool, scoped to a window around the mutated date. A refresh failure is
 * returned to the caller so success cannot imply stale Manday data.
 */
const recomputeForMutation = async (
  fastify: FastifyInstance,
  schema: string,
  crewIds: Array<string | null | undefined>,
  refDates: Date | string | Array<Date | string | null | undefined>,
  username: string,
): Promise<void> => {
  const ids = [...new Set(crewIds.filter((id): id is string => !!id))]
  const dates = (Array.isArray(refDates) ? refDates : [refDates])
    .map((date) => date instanceof Date ? date : (date ? new Date(date) : null))
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
  if (!ids.length || dates.length === 0) return
  const window = await mandayMutationWindow(fastify, ids, dates, {
    backDays: MANDAY_BACK_DAYS,
    forwardDays: MANDAY_FWD_DAYS,
  })
  if (!window) return
  await recomputeMandayAndNotify(fastify, {
    crewIds: ids,
    startDt: window.startDt,
    endDt: window.endDt,
    updatedBy: username,
  })
  // recomputeMandayAndNotify's roster-updated only refreshes roster items — the frontend
  // refreshes crew stats (RpCred/RpDO/RpBH) on manday-updated. Broadcast on the request
  // (JWT) schema, not liveSchemaName() — they diverge on SIT (see scenario.ts publish path).
  fastify.wsBroadcastAll(schema, { type: 'manday-updated', crewIds: ids })
}

export default async function rosterRoutes(fastify: FastifyInstance) {
  // GET /api/roster — Gantt chart data source
  fastify.get('/', async (request, reply) => {
    const schema = z.object({
      crewIds: z.string().transform((s) => s.split(',')).pipe(z.array(z.string().min(1)).min(1)),
      startDate: z.string(),
      endDate: z.string(),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await rosterService.getView(fastify, parsed.data)
    return success(reply, result)
  })

  // GET /api/roster/bulk-delete/candidates — Live roster bulk-delete review list
  fastify.get('/bulk-delete/candidates', async (request, reply) => {
    const schema = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      groupKeys: z.string().optional().transform((s) =>
        s ? s.split(',').map((v) => v.trim()).filter(Boolean) : [],
      ),
      divisions: z.string().optional().transform((s) =>
        s ? s.split(',').map((v) => v.trim()).filter(Boolean) : [],
      ),
      bases: z.string().optional().transform((s) =>
        s ? s.split(',').map((v) => v.trim()).filter(Boolean) : [],
      ),
      crewIds: z.string().optional().transform((s) =>
        s ? s.split(',').map((v) => v.trim()).filter(Boolean) : [],
      ),
      sources: z.string().optional().transform((s) =>
        s ? s.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean) : [],
      ).refine((values) => values.every((v) => (LIVE_ROSTER_SOURCES as readonly string[]).includes(v)), {
        message: 'sources must be one of IMP, MA, CR',
      }),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    try {
      const result = await rosterService.listBulkDeleteCandidates(fastify, parsed.data)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/roster/bulk-delete — soft-delete selected roster_flight rows
  fastify.post('/bulk-delete', async (request, reply) => {
    const schema = z.object({
      ids: z.array(z.number().int().positive()).default([]),
      pairingCrewKeys: z.array(z.object({
        pairingId: z.number().int().positive(),
        crewId: z.string().min(1),
      })).default([]),
      username: z.string().default('system'),
    }).refine((body) => body.ids.length > 0 || body.pairingCrewKeys.length > 0, {
      message: 'ids or pairingCrewKeys is required',
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const schemaName = request.authUser?.schema ?? liveSchemaName()
    const userCode = request.authUser?.userCode ?? parsed.data.username
    try {
      const leaseResult = await mutationExclusiveService.tryAcquire(
        fastify.redis,
        schemaName,
        'roster-bulk-delete',
        userCode,
      )
      if (!leaseResult.acquired) {
        return error(reply, 409, mutationConflictMessage('roster-bulk-delete', leaseResult.owner, userCode))
      }

      const rulesetId = mutationRulesetId(request.body)
      try {
        const job = await fastify.rosterBulkDeleteQueue.add('bulk-delete', {
          ids: parsed.data.ids,
          pairingCrewKeys: parsed.data.pairingCrewKeys,
          username: parsed.data.username,
          schema: schemaName,
          mutationLeaseToken: leaseResult.lease.token,
          ...(rulesetId != null ? { rulesetId } : {}),
        })
        return success(reply, { taskId: String(job.id) })
      } catch (err) {
        await mutationExclusiveService.release(fastify.redis, leaseResult.lease).catch((releaseErr: unknown) => {
          fastify.log.warn({ err: releaseErr }, 'Failed to release roster bulk-delete lease after queue submission failure')
        })
        throw err
      }
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/roster/bulk-delete/tasks/:taskId — true worker progress and elapsed time
  fastify.get('/bulk-delete/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const job = await fastify.rosterBulkDeleteQueue.getJob(taskId)
    if (!job) return fail(reply, 404, 'Bulk delete task not found')

    const state = await job.getState()
    const rawProgress = job.progress
    const progress = typeof rawProgress === 'object' && rawProgress !== null
      ? rawProgress as RosterBulkDeleteProgress
      : {} as Partial<RosterBulkDeleteProgress>
    const elapsedMs = progress.startedAt
      ? (state === 'completed' || state === 'failed'
        ? Number(progress.elapsedMs ?? 0)
        : Math.max(0, Date.now() - new Date(progress.startedAt).getTime()))
      : 0
    const stages = progress.stages?.map((stage) => {
      if (state !== 'active' || stage.status !== 'active' || !stage.startedAt) return stage
      return {
        ...stage,
        elapsedMs: Math.max(0, Date.now() - new Date(stage.startedAt).getTime()),
      }
    })
    return success(reply, {
      taskId,
      state,
      progress: { ...progress, elapsedMs, ...(stages ? { stages } : {}) },
      result: state === 'completed' ? job.returnvalue ?? null : null,
      error: state === 'failed' ? job.failedReason ?? 'Bulk delete failed' : null,
    })
  })

  // GET /api/roster/:id — single roster entry
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const result = await rosterService.getById(fastify, numId)
    if (!result) {
      return fail(reply, 404, 'Roster entry not found')
    }
    return success(reply, result)
  })

  // POST /api/roster — create task assignment
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'
    const schemaName = request.authUser?.schema ?? liveSchemaName()

    try {
      const result = await rosterService.create(fastify, body as never, username)
      await recheckMutation(fastify, body, [result?.schStrDtUtc], [result?.crewId])
      if (result?.crewId && result?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [result.crewId], result.schStrDtUtc, username)
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PUT /api/roster/:id — update task
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'
    const schemaName = request.authUser?.schema ?? liveSchemaName()

    try {
      const result = await rosterService.update(fastify, numId, body as never, username)
      if (!result) {
        return fail(reply, 404, 'Roster entry not found')
      }
      await recheckMutation(fastify, body, [result?.schStrDtUtc], [result?.crewId])
      if (result?.crewId && result?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [result.crewId], result.schStrDtUtc, username)
      }
      return success(reply, result)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500
      return error(reply, status, (err as Error).message)
    }
  })

  // DELETE /api/roster/:id — soft delete (legacy)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    const username = ((request.query as Record<string, string>).username) ?? 'system'
    const schemaName = request.authUser?.schema ?? liveSchemaName()
    try {
      const result = await rosterService.remove(fastify, numId, username)
      if (!result) return fail(reply, 404, 'Roster entry not found')
      await recheckMutation(fastify, request.query, [result?.schStrDtUtc], [result?.crewId])
      if (result?.crewId && result?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [result.crewId], result.schStrDtUtc, username)
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/roster/:id/delete — soft delete (POST to avoid CORS preflight issues)
  fastify.post('/:id/delete', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    const username = ((request.body as Record<string, string>)?.username) ?? 'system'
    const schemaName = request.authUser?.schema ?? liveSchemaName()
    try {
      const result = await rosterService.remove(fastify, numId, username)
      if (!result) return fail(reply, 404, 'Roster entry not found')
      await recheckMutation(fastify, request.body, [result?.schStrDtUtc], [result?.crewId])
      if (result?.crewId && result?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [result.crewId], result.schStrDtUtc, username)
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/roster/swap — swap tasks between two crew members
  fastify.post('/swap', async (request, reply) => {
    const schema = z.object({
      taskIdA: z.number().int().positive(),
      taskIdB: z.number().int().positive(),
      username: z.string().default('system'),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const schemaName = request.authUser?.schema ?? liveSchemaName()
    try {
      const result = await rosterService.swap(
        fastify,
        parsed.data.taskIdA,
        parsed.data.taskIdB,
        parsed.data.username,
      )
      await recheckMutation(
        fastify,
        request.body,
        [result?.taskA?.schStrDtUtc, result?.taskB?.schStrDtUtc],
        [result?.taskA?.crewId, result?.taskB?.crewId],
      )
      // Swap touches BOTH crews at BOTH dates — recompute each crew over a
      // window around each task date.
      const swapCrews = [result?.taskA?.crewId, result?.taskB?.crewId]
      if (result?.taskA?.schStrDtUtc) await recomputeForMutation(fastify, schemaName, swapCrews, result.taskA.schStrDtUtc, parsed.data.username)
      if (result?.taskB?.schStrDtUtc) await recomputeForMutation(fastify, schemaName, swapCrews, result.taskB.schStrDtUtc, parsed.data.username)
      return success(reply, result)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400
      return fail(reply, status, (err as Error).message)
    }
  })

  // POST /api/roster/move — move task to another crew
  fastify.post('/move', async (request, reply) => {
    const schema = z.object({
      taskId: z.number().int().positive(),
      targetCrewId: z.string().min(1),
      username: z.string().default('system'),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const schemaName = request.authUser?.schema ?? liveSchemaName()
    try {
      const result = await rosterService.move(
        fastify,
        parsed.data.taskId,
        parsed.data.targetCrewId,
        parsed.data.username,
      )
      await recheckMutation(
        fastify,
        request.body,
        [result?.schStrDtUtc],
        [result?.crewId, result?.sourceCrewId],
      )
      // Move affects the target crew (gained) and the source crew (lost).
      if (result?.crewId && result?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [result.crewId, result.sourceCrewId], result.schStrDtUtc, parsed.data.username)
      }
      return success(reply, result)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400
      return fail(reply, status, (err as Error).message)
    }
  })

  // POST /api/roster/assign-pairing — assign a pairing to a crew member
  fastify.post('/assign-pairing', async (request, reply) => {
    const schema = z.object({
      pairingId: z.number().int().positive(),
      crewId: z.string().min(1),
      rosterActingRank: z.string().min(1),
      username: z.string().default('system'),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    // Server-side pre-check (defense-in-depth — frontend also blocks, but
    // protects against stale state, batch imports, and other clients).
    const precheck = await precheckAssignment(fastify, parsed.data.crewId, parsed.data.pairingId)
    if (!precheck.ok) {
      return reply.code(409).send({
        error: 'ASSIGNMENT_FAILED',
        reason: precheck.reason,
        message: precheck.message,
      })
    }

    const schemaName = request.authUser?.schema ?? liveSchemaName()
    try {
      const result = await rosterService.assignPairing(
        fastify,
        parsed.data.pairingId,
        parsed.data.crewId,
        precheck.actingRank,
        parsed.data.username,
      )
      await recheckMutation(fastify, request.body, [result?.[0]?.schStrDtUtc], [parsed.data.crewId])
      if (parsed.data.crewId && result?.[0]?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [parsed.data.crewId], result[0].schStrDtUtc, parsed.data.username)
      }
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })

  // POST /api/roster/assign-flight — assign a single flight to a crew member
  fastify.post('/assign-flight', async (request, reply) => {
    const schema = z.object({
      flightId: z.number().int().positive(),
      crewId: z.string().min(1),
      username: z.string().default('system'),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const schemaName = request.authUser?.schema ?? liveSchemaName()
    try {
      const result = await rosterService.assignFlight(
        fastify,
        parsed.data.flightId,
        parsed.data.crewId,
        parsed.data.username,
      )
      await recheckMutation(fastify, request.body, [result?.schStrDtUtc], [parsed.data.crewId])
      if (parsed.data.crewId && result?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [parsed.data.crewId], result.schStrDtUtc, parsed.data.username)
      }
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })

  // POST /api/roster/create-ground-task — batch create ground tasks for multiple crew members
  fastify.post('/create-ground-task', async (request, reply) => {
    const schema = z.object({
      crewIds: z.array(z.string().min(1)).min(1, 'At least one crew ID required'),
      assignment: z.string().min(1),
      depArp: z.string().trim().min(1).max(3).transform((v) => v.toUpperCase()),
      arvArp: z.string().trim().min(1).max(3).transform((v) => v.toUpperCase()),
      startDtUtc: z.string().datetime(),
      endDtUtc: z.string().datetime(),
      comments: z.string().optional(),
      creditMin: z.number().int().nonnegative().nullable().optional(),
      dpMin: z.number().int().nonnegative().nullable().optional(),
      username: z.string().default('system'),
    }).refine((d) => new Date(d.endDtUtc) > new Date(d.startDtUtc), {
      message: 'endDtUtc must be after startDtUtc',
      path: ['endDtUtc'],
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const { username, ...taskData } = parsed.data
    const schemaName = request.authUser?.schema ?? liveSchemaName()
    try {
      const result = await rosterService.createGroundTask(fastify, taskData, username)
      await recheckMutation(
        fastify,
        request.body,
        [taskData.startDtUtc, taskData.endDtUtc],
        taskData.crewIds,
      )
      // Ground tasks (DO/VAC/ILL) drive is_day_off/is_al/is_leave + credit.
      await recomputeForMutation(fastify, schemaName, taskData.crewIds, [taskData.startDtUtc, taskData.endDtUtc], username)
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })

  // POST /api/roster/pairing/:pairingId/crew/:crewId/delete — batch delete all roster entries for a pairing+crew
  fastify.post('/pairing/:pairingId/crew/:crewId/delete', async (request, reply) => {
    const { pairingId, crewId } = request.params as { pairingId: string; crewId: string }
    const numPairingId = Number(pairingId)
    if (Number.isNaN(numPairingId)) {
      return fail(reply, 400, 'Invalid pairingId')
    }

    const username = ((request.body as Record<string, string>)?.username) ?? 'system'
    const schemaName = request.authUser?.schema ?? liveSchemaName()

    try {
      const result = await rosterService.removeByPairingAndCrew(
        fastify,
        numPairingId,
        crewId,
        username,
      )
      await recheckMutation(
        fastify,
        request.body,
        result?.map((row) => row.schStrDtUtc) ?? [],
        [crewId],
      )
      if (crewId && result?.[0]?.schStrDtUtc) {
        await recomputeForMutation(fastify, schemaName, [crewId], result.map((row) => row.schStrDtUtc), username)
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })
}
