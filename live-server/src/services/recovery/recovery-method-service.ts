import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { precheckAssignment } from '../assignment/precheck-service.js'
import { rosterService } from '../roster/roster-service.js'

/**
 * Rule-independent Recovery capabilities. A caller may associate the request
 * with any alert type, but the method service only deals with roster state.
 */
export const recoveryMethodCatalog = [
  {
    id: 'roster-assignment',
    title: 'Roster assignment',
    operations: ['transfer', 'swap'],
    description: 'Move a complete Roster to an available Crew or exchange complete Rosters.',
  },
  {
    id: 'callout-standby',
    title: 'Callout Standby',
    operations: ['callout-standby'],
    description: 'Assign a complete Roster to a Crew with a matching Standby task and retain that task.',
  },
  {
    id: 'cross-base',
    title: 'Cross-base positioning',
    operations: ['cross-base-standby', 'cross-base-swap', 'cross-base-destination'],
    description: 'Use a qualified Crew from another base with DHD positioning or reuse a leading DHD destination base.',
  },
] as const

export type RecoveryMethodId = (typeof recoveryMethodCatalog)[number]['id']
export type RosterAssignmentOperation = 'transfer' | 'swap'

const crewId = z.string().trim().min(1).max(64)
const pairingId = z.number().int().positive()
const rank = z.string().trim().max(32).nullable().optional()
const rulesetId = z.number().int().positive().nullable().optional()

export const rosterAssignmentSchema = z.object({
  operation: z.enum(['transfer', 'swap']),
  sourceCrewId: crewId,
  sourcePairingId: pairingId,
  targetCrewId: crewId,
  targetPairingId: pairingId.nullable().optional(),
  targetRosterActingRank: rank,
  rulesetId,
}).superRefine((value, context) => {
  if (value.sourceCrewId === value.targetCrewId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetCrewId'], message: 'Source and target Crew must be different' })
  }
  if (value.operation === 'swap' && value.targetPairingId == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetPairingId'], message: 'targetPairingId is required for a Roster swap' })
  }
})

export const calloutStandbySchema = z.object({
  sourceCrewId: crewId,
  sourcePairingId: pairingId,
  targetCrewId: crewId,
  standbyTaskId: pairingId,
  targetRosterActingRank: rank,
  rulesetId,
}).superRefine((value, context) => {
  if (value.sourceCrewId === value.targetCrewId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetCrewId'], message: 'Source and target Crew must be different' })
  }
})

export const crossBaseRecoverySchema = z.object({
  operation: z.enum(['standby', 'swap', 'destination']),
  sourceCrewId: crewId,
  sourcePairingId: pairingId,
  targetCrewId: crewId,
  targetPairingId: pairingId.nullable().optional(),
  standbyTaskId: pairingId.nullable().optional(),
  outboundFlightId: pairingId.nullable().optional(),
  returnFlightId: pairingId.nullable().optional(),
  supportBase: z.string().trim().length(3),
  recoveryBase: z.string().trim().length(3),
  division: z.string().trim().min(1).max(2),
  targetRosterActingRank: rank,
  minFlightLeadHours: z.number().nonnegative(),
  reserveBeforeHours: z.number().nonnegative(),
  returnAfterHours: z.number().nonnegative(),
  destinationSplit: z.object({
    destinationBase: z.string().trim().length(3),
    middleFlightIds: z.array(pairingId).min(1),
    removedDhdFlightIds: z.array(pairingId).length(2),
    actingRank: z.string().trim().min(1).max(32),
    createsPairing: z.boolean(),
  }).optional(),
  rulesetId,
}).superRefine((value, context) => {
  if (value.sourceCrewId === value.targetCrewId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetCrewId'], message: 'Source and support Crew must be different' })
  if (value.operation === 'swap' && value.targetPairingId == null) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetPairingId'], message: 'targetPairingId is required for a Cross-base Roster swap' })
  if (value.operation === 'standby' && value.standbyTaskId == null) context.addIssue({ code: z.ZodIssueCode.custom, path: ['standbyTaskId'], message: 'standbyTaskId is required for Cross-base Callout Standby' })
  if (value.operation === 'destination' && !value.destinationSplit) context.addIssue({ code: z.ZodIssueCode.custom, path: ['destinationSplit'], message: 'destinationSplit is required for destination-base recovery' })
  if (value.operation !== 'destination' && (value.outboundFlightId == null || value.returnFlightId == null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['outboundFlightId'], message: 'DHD flight ids are required for Cross-base positioning' })
})

export type RosterAssignmentRequest = z.infer<typeof rosterAssignmentSchema>
export type CalloutStandbyRequest = z.infer<typeof calloutStandbySchema>
export type CrossBaseRecoveryRequest = z.infer<typeof crossBaseRecoverySchema>
export type CompleteRosterMutation = Awaited<ReturnType<typeof rosterService.recoverCompleteRoster>>

export type RecoveryMethodResult = CompleteRosterMutation & {
  method: RecoveryMethodId
  operation: RosterAssignmentOperation | 'callout-standby' | 'cross-base-standby' | 'cross-base-swap' | 'cross-base-destination'
}

const rejectAssignment = (crewIdValue: string, pairingIdValue: number, message: string): never => {
  throw Object.assign(
    new Error(`Crew ${crewIdValue} cannot receive Roster ${pairingIdValue}: ${message}`),
    { statusCode: 409 },
  )
}

const assertAssignmentAllowed = async (
  fastify: FastifyInstance,
  crewIdValue: string,
  pairingIdValue: number,
): Promise<void> => {
  const result = await precheckAssignment(fastify, crewIdValue, pairingIdValue)
  if (!result.ok) rejectAssignment(crewIdValue, pairingIdValue, result.message)
}

/**
 * Execute a complete-Roster transfer or exchange. The service validates every
 * new Crew/Roster pairing before the transactional mutation and does not know
 * which Rule alert led to the request.
 */
export const executeRosterAssignment = async (
  fastify: FastifyInstance,
  request: RosterAssignmentRequest,
  username: string,
): Promise<RecoveryMethodResult> => {
  await assertAssignmentAllowed(fastify, request.targetCrewId, request.sourcePairingId)
  if (request.operation === 'swap' && request.targetPairingId != null) {
    await assertAssignmentAllowed(fastify, request.sourceCrewId, request.targetPairingId)
  }

  const result = await rosterService.recoverCompleteRoster(fastify, {
    mode: request.operation,
    sourceCrewId: request.sourceCrewId,
    sourcePairingId: request.sourcePairingId,
    targetCrewId: request.targetCrewId,
    targetPairingId: request.targetPairingId ?? null,
    targetRosterActingRank: request.targetRosterActingRank || null,
    username,
  })

  return {
    ...result,
    method: 'roster-assignment',
    operation: request.operation,
  }
}

/**
 * Execute a Callout Standby assignment. The underlying roster operation keeps
 * the matching SBY task and records the exception marker for audit/rendering.
 */
export const executeCalloutStandby = async (
  fastify: FastifyInstance,
  request: CalloutStandbyRequest,
  username: string,
): Promise<RecoveryMethodResult> => {
  await assertAssignmentAllowed(fastify, request.targetCrewId, request.sourcePairingId)

  const result = await rosterService.recoverCompleteRoster(fastify, {
    mode: 'standby',
    sourceCrewId: request.sourceCrewId,
    sourcePairingId: request.sourcePairingId,
    targetCrewId: request.targetCrewId,
    standbyTaskId: request.standbyTaskId,
    targetRosterActingRank: request.targetRosterActingRank || '',
    username,
  })

  return {
    ...result,
    method: 'callout-standby',
    operation: 'callout-standby',
  }
}

/** Execute Cross-base positioning without coupling the method to a Rule ID. */
export const executeCrossBaseRecovery = async (
  fastify: FastifyInstance,
  request: CrossBaseRecoveryRequest,
  username: string,
): Promise<RecoveryMethodResult> => {
  // Destination-base recovery removes the leading/trailing DHD segments from
  // the source Pairing. It has no separately selected positioning flights.
  if (request.operation === 'destination') {
    const split = request.destinationSplit
    if (!split) throw Object.assign(new Error('destinationSplit is required for destination-base recovery'), { statusCode: 400 })
    const result = await rosterService.recoverDestinationBaseRoster(fastify, {
      sourceCrewId: request.sourceCrewId,
      sourcePairingId: request.sourcePairingId,
      targetCrewId: request.targetCrewId,
      recoveryBase: request.recoveryBase.toUpperCase(),
      division: request.division.toUpperCase(),
      // This is always inherited from the source Crew's Roster, never a
      // fixed recovery rank. The roster service revalidates it in-transaction.
      rosterActingRank: split.actingRank,
      middleFlightIds: split.middleFlightIds,
      removedDhdFlightIds: split.removedDhdFlightIds,
      createsPairing: split.createsPairing,
      username,
    })
    return { ...result, method: 'cross-base', operation: 'cross-base-destination' }
  }

  await assertAssignmentAllowed(fastify, request.targetCrewId, request.sourcePairingId)
  if (request.operation === 'swap' && request.targetPairingId != null) {
    await assertAssignmentAllowed(fastify, request.sourceCrewId, request.targetPairingId)
  }
  const result = await rosterService.recoverCrossBaseRoster(fastify, {
    ...request,
    // `destination` returned above. Make the remaining contract explicit for
    // both TypeScript and the roster mutation boundary.
    operation: request.operation === 'swap' ? 'swap' : 'standby',
    outboundFlightId: request.outboundFlightId!,
    returnFlightId: request.returnFlightId!,
    supportBase: request.supportBase.toUpperCase(),
    recoveryBase: request.recoveryBase.toUpperCase(),
    division: request.division.toUpperCase(),
    rosterActingRank: request.targetRosterActingRank || '',
    username,
  })
  return {
    ...result,
    method: 'cross-base',
    operation: request.operation === 'swap' ? 'cross-base-swap' : 'cross-base-standby',
  }
}
