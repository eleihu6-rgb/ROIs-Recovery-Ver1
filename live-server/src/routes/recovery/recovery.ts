import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { rosterService } from '../../services/roster/roster-service.js'
import { recheckLiveRosterMutation } from '../../services/rule/legality-recheck.js'
import { recomputeMandayAndNotify } from '../../services/manday/manday-operation-service.js'
import {
  calloutStandbySchema,
  executeCalloutStandby,
  crossBaseRecoverySchema,
  executeCrossBaseRecovery,
  executeRosterAssignment,
  recoveryMethodCatalog,
  rosterAssignmentSchema,
} from '../../services/recovery/recovery-method-service.js'

type PlanType = 'standby' | 'swap'

interface RecoveryPlan {
  id: PlanType
  title: string
  description: string
  costDelta: number
  currency: string
  affectedCrewCount: number
  affectedRosterCount: number
  remainingViolations: number
  changes: Array<{
    crewId: string
    crewName: string
    before: string
    after: string
    changeType: 'unassign' | 'assign' | 'swap'
  }>
}

interface RecoverySession {
  id: string
  status: 'open' | 'applied'
  createdAt: string
  appliedAt: string | null
  appliedBy: string | null
  flight: {
    flightNo: string
    departure: string
    arrival: string
    departureTime: string
    oldAircraftType: string
    newAircraftType: string
    oldTailNumber: string
    newTailNumber: string
  }
  alert: {
    id: string
    ruleCode: string
    severity: 'critical'
    title: string
    message: string
    impactedCrew: Array<{ id: string; name: string; qualification: string }>
  }
  plans: RecoveryPlan[]
  selectedPlanId: PlanType | null
}

const sessions = new Map<string, RecoverySession>()

const flightChangeSchema = z.object({
  flightNo: z.string().trim().min(2).max(20).default('MU5123'),
  departure: z.string().trim().min(3).max(8).default('PVG'),
  arrival: z.string().trim().min(3).max(8).default('PEK'),
  departureTime: z.string().datetime().optional(),
  oldAircraftType: z.string().trim().min(2).max(20).default('A320'),
  newAircraftType: z.string().trim().min(2).max(20),
  oldTailNumber: z.string().trim().min(2).max(20).default('B-1234'),
  newTailNumber: z.string().trim().min(2).max(20),
})

const applySchema = z.object({
  planId: z.enum(['standby', 'swap']),
})

const legacyApplyOptionSchema = z.object({
  mode: z.enum(['transfer', 'swap', 'standby']),
  sourceCrewId: z.string().trim().min(1),
  sourcePairingId: z.number().int().positive(),
  targetCrewId: z.string().trim().min(1),
  targetPairingId: z.number().int().positive().nullable().optional(),
  standbyTaskId: z.number().int().positive().nullable().optional(),
  targetRosterActingRank: z.string().trim().max(32).nullable().optional(),
  rulesetId: z.number().int().positive().nullable().optional(),
})

const asCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(amount)

const mutationResponse = (result: Awaited<ReturnType<typeof executeRosterAssignment>>) => ({
  method: result.method,
  operation: result.operation,
  crewIds: result.crewIds,
  pairingIds: result.pairingIds,
  removed: result.deleted,
  created: result.created.length,
})

const scheduleMutationRefresh = (
  fastify: FastifyInstance,
  rulesetId: number | null | undefined,
  result: Awaited<ReturnType<typeof executeRosterAssignment>>,
  username: string,
): void => {
  void recheckLiveRosterMutation(fastify, rulesetId ?? undefined, result.dates, result.crewIds)
    .catch((err) => fastify.log.warn({ err }, 'Recovery legality recheck failed'))
  if (result.dates.length === 0) return

  const first = result.dates[0]
  const windowStart = new Date(first.getTime() - 2 * 86_400_000)
  const windowEnd = new Date(Math.max(...result.dates.map((date) => date.getTime())) + 10 * 86_400_000)
  void recomputeMandayAndNotify(fastify, {
    crewIds: result.crewIds,
    startDt: windowStart,
    endDt: windowEnd,
    updatedBy: username,
  }).catch((err) => fastify.log.warn({ err }, 'Recovery Manday recompute failed'))
}

export const createRecoverySession = (input: z.infer<typeof flightChangeSchema>): RecoverySession => {
  const id = randomUUID()
  const departureTime = input.departureTime ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
  const originalCrew = [
    { id: 'C00128', name: 'Zhang Wei', qualification: input.oldAircraftType },
    { id: 'C00416', name: 'Li Na', qualification: input.oldAircraftType },
  ]
  const originalDuty = `${input.flightNo} ${input.departure}-${input.arrival}`
  const recoveredDuty = `${input.flightNo} ${input.departure}-${input.arrival} (${input.newAircraftType})`

  return {
    id,
    status: 'open',
    createdAt: new Date().toISOString(),
    appliedAt: null,
    appliedBy: null,
    flight: {
      ...input,
      departure: input.departure.toUpperCase(),
      arrival: input.arrival.toUpperCase(),
      departureTime,
      oldAircraftType: input.oldAircraftType.toUpperCase(),
      newAircraftType: input.newAircraftType.toUpperCase(),
      oldTailNumber: input.oldTailNumber.toUpperCase(),
      newTailNumber: input.newTailNumber.toUpperCase(),
    },
    alert: {
      id: `aircraft-qualification-${id}`,
      ruleCode: '8004',
      severity: 'critical',
      title: 'Aircraft qualification mismatch',
      message: `${input.flightNo.toUpperCase()} changed from ${input.oldAircraftType.toUpperCase()} to ${input.newAircraftType.toUpperCase()}. The assigned crew are not qualified for the new aircraft type.`,
      impactedCrew: originalCrew,
    },
    plans: [
      {
        id: 'standby',
        title: 'Replace with standby crew',
        description: 'Cancel the affected roster assignment and activate an available, qualified standby crew.',
        costDelta: 6800,
        currency: 'CNY',
        affectedCrewCount: 4,
        affectedRosterCount: 2,
        remainingViolations: 0,
        changes: [
          { crewId: 'C00128', crewName: 'Zhang Wei', before: originalDuty, after: 'Released to reserve', changeType: 'unassign' },
          { crewId: 'C00416', crewName: 'Li Na', before: originalDuty, after: 'Released to reserve', changeType: 'unassign' },
          { crewId: 'S00072', crewName: 'Chen Hao', before: 'Standby PVG 10:00-22:00', after: recoveredDuty, changeType: 'assign' },
          { crewId: 'S00091', crewName: 'Wang Min', before: 'Standby PVG 10:00-22:00', after: recoveredDuty, changeType: 'assign' },
        ],
      },
      {
        id: 'swap',
        title: 'Swap with qualified crew',
        description: 'Exchange the affected task with a qualified crew on a compatible roster duty.',
        costDelta: 2400,
        currency: 'CNY',
        affectedCrewCount: 4,
        affectedRosterCount: 4,
        remainingViolations: 0,
        changes: [
          { crewId: 'C00128', crewName: 'Zhang Wei', before: originalDuty, after: 'MU6138 PVG-CAN (A320)', changeType: 'swap' },
          { crewId: 'C00416', crewName: 'Li Na', before: originalDuty, after: 'MU6138 PVG-CAN (A320)', changeType: 'swap' },
          { crewId: 'C00331', crewName: 'Liu Yang', before: 'MU6138 PVG-CAN (A320)', after: recoveredDuty, changeType: 'swap' },
          { crewId: 'C00605', crewName: 'Sun Jie', before: 'MU6138 PVG-CAN (A320)', after: recoveredDuty, changeType: 'swap' },
        ],
      },
    ],
    selectedPlanId: null,
  }
}

export default async function recoveryRoutes(fastify: FastifyInstance) {
  fastify.get('/methods', async (_request, reply) => {
    return reply.send({ code: 200, data: recoveryMethodCatalog, message: 'ok' })
  })

  fastify.post('/methods/roster-assignment', async (request, reply) => {
    const parsed = rosterAssignmentSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })

    const username = request.authUser?.userCode ?? 'system'
    try {
      const result = await executeRosterAssignment(fastify, parsed.data, username)
      scheduleMutationRefresh(fastify, parsed.data.rulesetId, result, username)
      return reply.send({ code: 200, data: mutationResponse(result), message: 'Roster assignment recovery applied' })
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400
      return reply.status(status).send({ code: status, data: null, message: (err as Error).message })
    }
  })

  fastify.post('/methods/callout-standby', async (request, reply) => {
    const parsed = calloutStandbySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })

    const username = request.authUser?.userCode ?? 'system'
    try {
      const result = await executeCalloutStandby(fastify, parsed.data, username)
      scheduleMutationRefresh(fastify, parsed.data.rulesetId, result, username)
      return reply.send({ code: 200, data: mutationResponse(result), message: 'Callout Standby recovery applied' })
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400
      return reply.status(status).send({ code: status, data: null, message: (err as Error).message })
    }
  })

  fastify.post('/methods/cross-base', async (request, reply) => {
    const parsed = crossBaseRecoverySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })

    const username = request.authUser?.userCode ?? 'system'
    try {
      const result = await executeCrossBaseRecovery(fastify, parsed.data, username)
      scheduleMutationRefresh(fastify, parsed.data.rulesetId, result, username)
      return reply.send({ code: 200, data: mutationResponse(result), message: 'Cross-base Recovery applied' })
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400
      return reply.status(status).send({ code: status, data: null, message: (err as Error).message })
    }
  })

  // Backward-compatible adapter for clients using the original generic shape.
  // New callers should use /methods/roster-assignment or /methods/callout-standby.
  fastify.post('/apply-option', async (request, reply) => {
    const parsed = legacyApplyOptionSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })

    const username = request.authUser?.userCode ?? 'system'
    try {
      if (parsed.data.mode === 'standby') {
        const callout = calloutStandbySchema.safeParse(parsed.data)
        if (!callout.success) return reply.status(400).send({ code: 400, data: null, message: callout.error.message })
        const result = await executeCalloutStandby(fastify, callout.data, username)
        scheduleMutationRefresh(fastify, callout.data.rulesetId, result, username)
        return reply.send({ code: 200, data: mutationResponse(result), message: 'Callout Standby recovery applied' })
      }

      const assignment = rosterAssignmentSchema.safeParse({ ...parsed.data, operation: parsed.data.mode })
      if (!assignment.success) return reply.status(400).send({ code: 400, data: null, message: assignment.error.message })
      const result = await executeRosterAssignment(fastify, assignment.data, username)
      scheduleMutationRefresh(fastify, assignment.data.rulesetId, result, username)
      return reply.send({ code: 200, data: mutationResponse(result), message: 'Roster assignment recovery applied' })
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400
      return reply.status(status).send({ code: status, data: null, message: (err as Error).message })
    }
  })

  fastify.post('/simulate-flight-change', async (request, reply) => {
    const parsed = flightChangeSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, data: null, message: 'Invalid flight change request' })
    }
    if (parsed.data.oldAircraftType.toUpperCase() === parsed.data.newAircraftType.toUpperCase()) {
      return reply.status(400).send({ code: 400, data: null, message: 'New aircraft type must differ from the original type to trigger a qualification check' })
    }

    const session = createRecoverySession(parsed.data)
    sessions.set(session.id, session)
    return reply.send({ code: 200, data: session, message: 'qualification alert created' })
  })

  fastify.get<{ Params: { sessionId: string } }>('/sessions/:sessionId', async (request, reply) => {
    const session = sessions.get(request.params.sessionId)
    if (!session) return reply.status(404).send({ code: 404, data: null, message: 'Recovery session not found' })
    return reply.send({ code: 200, data: session, message: 'ok' })
  })

  fastify.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/apply', async (request, reply) => {
    const session = sessions.get(request.params.sessionId)
    if (!session) return reply.status(404).send({ code: 404, data: null, message: 'Recovery session not found' })
    if (session.status === 'applied') return reply.status(409).send({ code: 409, data: null, message: 'Recovery plan has already been applied' })

    const parsed = applySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ code: 400, data: null, message: 'A valid recovery plan is required' })

    const selectedPlan = session.plans.find((plan) => plan.id === parsed.data.planId)
    if (!selectedPlan) return reply.status(400).send({ code: 400, data: null, message: 'Recovery plan not found' })

    session.status = 'applied'
    session.selectedPlanId = selectedPlan.id
    session.appliedAt = new Date().toISOString()
    session.appliedBy = request.authUser?.userCode ?? 'system'
    fastify.log.info({ recoverySessionId: session.id, plan: selectedPlan.id, costDelta: asCurrency(selectedPlan.costDelta) }, 'recovery plan applied')

    return reply.send({ code: 200, data: session, message: 'Recovery plan applied' })
  })


  /**
   * POST /api/recovery/debug-trace — append a single cross-base diagnostic
   * record to .dev-logs/recovery-cross-base-trace.jsonl. Used by the gantt
   * Recovery dialog to record WHY a 8004 alert's cross-base plan ended up
   * empty (or short) so an offline analysis can pinpoint the failing filter
   * (rank/fleet/positioning window/freedom-from-overlap/...).
   *
   * Schema is intentionally loose; the gantt owns the truth and may add new
   * fields without a server-side schema bump.
   */
  fastify.post('/debug-trace', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    const projectRoot = process.cwd()
    const logDir = path.resolve(projectRoot, '..', '.dev-logs')
    const logPath = path.join(logDir, 'recovery-cross-base-trace.jsonl')
    const record = {
      receivedAt: new Date().toISOString(),
      ...body,
    }
    try {
      await mkdir(logDir, { recursive: true })
      await appendFile(logPath, JSON.stringify(record) + '\n', 'utf8')
      return reply.send({ code: 200, data: { ok: true, logPath }, message: 'ok' })
    } catch (err) {
      fastify.log.warn({ err }, 'failed to write recovery cross-base trace')
      return reply.status(500).send({ code: 500, data: null, message: (err as Error).message })
    }
  })}
