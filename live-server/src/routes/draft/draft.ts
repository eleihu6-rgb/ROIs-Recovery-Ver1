import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { rosterService } from '../../services/roster/roster-service.js'
import { pairingService } from '../../services/pairing/pairing-service.js'
import { lockService } from '../../services/lock/lock-service.js'
import { mandayMutationWindow } from '../../services/manday/manday-mutation-window.js'
import { recheckLiveRosterMutation } from '../../services/rule/legality-recheck.js'
import { liveSchemaName } from '../../utils/db-schema.js'
import { notifyRosterTasksChanged } from '../../services/roster/roster-change-notifier.js'

const requestSchema = (request: { authUser?: { schema?: string } }): string =>
  request.authUser?.schema ?? liveSchemaName()

const movePayloadSchema = z.object({
  type: z.literal('move'),
  taskId: z.number(),
  toCrewId: z.string(),
})

const swapPayloadSchema = z.object({
  type: z.literal('swap'),
  taskIdA: z.number(),
  taskIdB: z.number(),
})

const addPayloadSchema = z.object({
  type: z.literal('add'),
  task: z.record(z.unknown()),
})

const removePayloadSchema = z.object({
  type: z.literal('remove'),
  taskId: z.number(),
})

const removePairingFromCrewSchema = z.object({
  type: z.literal('remove-pairing-from-crew'),
  pairingId: z.number(),
  crewId: z.string(),
})

const removePairingSchema = z.object({
  type: z.literal('remove-pairing'),
  pairingId: z.number(),
})

const addFlightToPairingSchema = z.object({
  type: z.literal('add-flight-to-pairing'),
  pairingId: z.number(),
  flightId: z.number(),
})

const createPairingFromFlightsSchema = z.object({
  type: z.literal('create-pairing-from-flights'),
  flightIds: z.array(z.number()),
  base: z.string().optional(),
  division: z.string().optional(),
})

const updatePayloadSchema = z.object({
  type: z.literal('update'),
  taskId: z.number(),
  data: z.record(z.unknown()),
})

const assignPairingSchema = z.object({
  type: z.literal('assign-pairing'),
  pairingId: z.number(),
  crewId: z.string(),
  rosterActingRank: z.string().min(1),
})

const addGroundTaskSchema = z.object({
  type: z.literal('add-ground-task'),
  groundTaskData: z.object({
    crewIds: z.array(z.string()),
    assignment: z.string(),
    depArp: z.string().trim().min(1).max(3).transform((v) => v.toUpperCase()),
    arvArp: z.string().trim().min(1).max(3).transform((v) => v.toUpperCase()),
    startDtUtc: z.string(),
    endDtUtc: z.string(),
    comments: z.string().optional(),
    creditMin: z.number().int().nonnegative().nullable().optional(),
    fixedCreditMin: z.number().int().nonnegative().nullable().optional(),
  }),
  mockItems: z.array(z.record(z.unknown())).optional(),
})

const draftOpSchema = z.discriminatedUnion('type', [
  movePayloadSchema,
  swapPayloadSchema,
  addPayloadSchema,
  removePayloadSchema,
  removePairingFromCrewSchema,
  removePairingSchema,
  addFlightToPairingSchema,
  createPairingFromFlightsSchema,
  updatePayloadSchema,
  assignPairingSchema,
  addGroundTaskSchema,
])

const commitSchema = z.object({
  operations: z.array(draftOpSchema).min(1).max(200),
  username: z.string().min(1),
  affectedCrewIds: z.array(z.string()),
  affectedPairingIds: z.array(z.number()),
  /** Optional RULE workset id for post-commit live legality recheck (falls back server-side). */
  rulesetId: z.number().int().positive().optional(),
})

export default async function draftRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/draft/commit — batch commit all draft operations.
   * Replays operations in a single DB transaction.
   * On success, releases locks and broadcasts updates.
   */
  fastify.post('/commit', async (request, reply) => {
    const parsed = commitSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { operations, username, affectedCrewIds, affectedPairingIds, rulesetId } = parsed.data

    // Verify lock ownership for all affected crews
    for (const crewId of affectedCrewIds) {
      const raw = await fastify.redis.get(`lock:crew:${crewId}`)
      if (!raw) {
        return fail(reply, 409, `Lock expired for crew ${crewId}. Please re-acquire and retry.`)
      }
      const info = JSON.parse(raw)
      if (info.userId !== username) {
        return fail(reply, 409, `Crew ${crewId} is locked by ${info.userId}`)
      }
    }

    // Collect dates of mutated roster rows so the post-commit manday recompute targets the
    // right window/month (the edited duty can be in any month the planner is viewing).
    const refDates = new Set<string>()
    const collect = (r: unknown): void => {
      for (const row of Array.isArray(r) ? r : [r]) {
        const taskRows = [row, (row as { taskA?: unknown } | null)?.taskA, (row as { taskB?: unknown } | null)?.taskB]
        for (const taskRow of taskRows) {
          const d = (taskRow as { schStrDtUtc?: string | null } | null)?.schStrDtUtc
          if (d) refDates.add(d)
        }
      }
    }

    // Execute all operations in a single transaction
    try {
      await fastify.db.transaction(async (_tx) => {
        for (const op of operations) {
          switch (op.type) {
            case 'move':
              collect(await rosterService.move(fastify, op.taskId, op.toCrewId, username))
              break
            case 'swap':
              collect(await rosterService.swap(fastify, op.taskIdA, op.taskIdB, username))
              break
            case 'add':
              collect(await rosterService.create(fastify, op.task as never, username))
              break
            case 'remove':
              collect(await rosterService.remove(fastify, op.taskId, username))
              break
            case 'remove-pairing-from-crew':
              collect(await rosterService.removeByPairingAndCrew(fastify, op.pairingId, op.crewId, username))
              break
            case 'remove-pairing':
              await pairingService.remove(fastify, op.pairingId)
              break
            case 'add-flight-to-pairing':
              await pairingService.addSegment(fastify, op.pairingId, op.flightId, username)
              break
            case 'create-pairing-from-flights':
              await pairingService.createFromFlights(fastify, op.flightIds, op.base ?? '', op.division ?? '', username)
              break
            case 'update':
              collect(await rosterService.update(fastify, op.taskId, op.data as never, username))
              break
            case 'assign-pairing':
              collect(await rosterService.assignPairing(fastify, op.pairingId, op.crewId, op.rosterActingRank, username))
              break
            case 'add-ground-task':
              collect(await rosterService.createGroundTask(fastify, op.groundTaskData, username))
              break
          }
        }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      fastify.log.error(err, 'Draft commit failed')
      return fail(reply, 500, message)
    }

    // Release all locks
    for (const crewId of affectedCrewIds) {
      const pairingIds = affectedPairingIds // simplified: release all
      await lockService.releaseCrewLocks(fastify.redis, crewId, pairingIds, username)
    }

    // Recompute manday for the affected crews ASYNCHRONOUSLY via the manday-recompute
    // worker so the save responds fast. The worker broadcasts manday-updated on
    // completion; clients targeted-refresh crew stats on that signal (no full reload).
    // Window = the RP range containing each edited duty (same as the old sync call).
    if (affectedCrewIds.length > 0) {
      const dates = [...refDates].map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()))
      const window = await mandayMutationWindow(
        fastify,
        affectedCrewIds,
        dates.length > 0 ? dates : [new Date()],
        { backDays: 2, forwardDays: 10 },
      )
      if (window) {
        // Every commit must enqueue a fresh recompute. A fixed jobId is unsafe here:
        // BullMQ keeps completed jobs, so a later save for the same crew set can be
        // silently deduplicated and leave persisted RpCredit stale.
        await fastify.mandayRecomputeQueue.add('manday-recompute', {
          kind: 'live',
          schema: liveSchemaName(),
          airlineSchema: requestSchema(request),
          crewIds: affectedCrewIds,
          window: { startDt: window.startDt, endDt: window.endDt },
          updatedBy: username,
        }, { jobId: `manday-live-${randomUUID()}` })
      }
    }

    // Check the mutated RP, or the three-RP fallback when dates are unavailable.
    await recheckLiveRosterMutation(fastify, rulesetId, [...refDates], affectedCrewIds)

    // Notify clients of the roster change (credit/crew stats arrive via the async
    // manday-updated push after the worker recomputes).
    const schemaName = requestSchema(request)
    await notifyRosterTasksChanged(fastify, { schema: schemaName, crewIds: affectedCrewIds, pairingIds: affectedPairingIds })

    // Broadcast lock releases
    for (const crewId of affectedCrewIds) {
      fastify.wsBroadcast(schemaName, {
        type: 'lock-released',
        crewId,
        pairingIds: affectedPairingIds,
        userId: username,
      }, username)
    }

    return success(reply, { committed: operations.length })
  })
}
