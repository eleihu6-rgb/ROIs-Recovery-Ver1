import { api } from './api'

export type RecoveryPlanId = 'standby' | 'swap' | 'cross-base'

export type RecoveryOptionMode = 'transfer' | 'swap' | 'standby' | 'cross-base-standby' | 'cross-base-swap' | 'cross-base-destination'

export interface RecoveryApplyOption {
  mode: RecoveryOptionMode
  sourceCrewId: string
  sourcePairingId: number
  targetCrewId: string
  targetPairingId?: number | null
  standbyTaskId?: number | null
  sourceRosterActingRank?: string | null
  targetRosterActingRank?: string | null
  rulesetId?: number | null
}

export interface RosterAssignmentRecoveryRequest {
  operation: 'transfer' | 'swap'
  sourceCrewId: string
  sourcePairingId: number
  targetCrewId: string
  targetPairingId?: number | null
  targetRosterActingRank?: string | null
  rulesetId?: number | null
}

export interface CalloutStandbyRecoveryRequest {
  sourceCrewId: string
  sourcePairingId: number
  targetCrewId: string
  standbyTaskId: number
  targetRosterActingRank?: string | null
  rulesetId?: number | null
}

export interface CrossBaseRecoveryRequest {
  operation: 'swap' | 'standby' | 'destination'
  sourceCrewId: string
  sourcePairingId: number
  targetCrewId: string
  targetPairingId?: number | null
  standbyTaskId?: number | null
  outboundFlightId: number | null
  returnFlightId: number | null
  supportBase: string
  recoveryBase: string
  division: string
  targetRosterActingRank?: string | null
  minFlightLeadHours: number
  reserveBeforeHours: number
  returnAfterHours: number
  destinationSplit?: {
    destinationBase: string
    middleFlightIds: number[]
    removedDhdFlightIds: number[]
    actingRank: string
    createsPairing: boolean
  }
  rulesetId?: number | null
}

export interface RecoveryMethodMutation {
  method: 'roster-assignment' | 'callout-standby' | 'cross-base'
  operation: 'transfer' | 'swap' | 'callout-standby' | 'cross-base-swap' | 'cross-base-standby' | 'cross-base-destination'
  crewIds: string[]
  pairingIds: number[]
  removed: number
  created: number
}

export interface RecoveryPlan {
  id: RecoveryPlanId
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

export interface RecoverySession {
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
  selectedPlanId: RecoveryPlanId | null
}

export interface FlightChangeInput {
  flightNo: string
  departure: string
  arrival: string
  oldAircraftType: string
  newAircraftType: string
  oldTailNumber: string
  newTailNumber: string
}

const applyOption = (input: RecoveryApplyOption): Promise<RecoveryMethodMutation> => {
  if (input.mode === 'cross-base-standby' || input.mode === 'cross-base-swap' || input.mode === 'cross-base-destination') {
    return Promise.reject(new Error('Cross-base recovery requires positioning flight details; use recoveryApi.crossBase().'))
  }
  if (input.mode === 'standby') {
    if (input.standbyTaskId == null) return Promise.reject(new Error('standbyTaskId is required for Callout Standby'))
    return recoveryApi.calloutStandby({
      sourceCrewId: input.sourceCrewId,
      sourcePairingId: input.sourcePairingId,
      targetCrewId: input.targetCrewId,
      standbyTaskId: input.standbyTaskId,
      targetRosterActingRank: input.targetRosterActingRank,
      rulesetId: input.rulesetId,
    })
  }
  return recoveryApi.rosterAssignment({
    operation: input.mode,
    sourceCrewId: input.sourceCrewId,
    sourcePairingId: input.sourcePairingId,
    targetCrewId: input.targetCrewId,
    targetPairingId: input.targetPairingId,
    targetRosterActingRank: input.targetRosterActingRank,
    rulesetId: input.rulesetId,
  })
}

export const recoveryApi = {
  getMethods: () =>
    api.get('/api/recovery/methods') as Promise<Array<{
      id: 'roster-assignment' | 'callout-standby'
      title: string
      operations: readonly string[]
      description: string
    }>>,
  rosterAssignment: (input: RosterAssignmentRecoveryRequest) =>
    api.post('/api/recovery/methods/roster-assignment', input, { timeout: 120_000 }) as Promise<RecoveryMethodMutation>,
  calloutStandby: (input: CalloutStandbyRecoveryRequest) =>
    api.post('/api/recovery/methods/callout-standby', input, { timeout: 120_000 }) as Promise<RecoveryMethodMutation>,
  crossBase: (input: CrossBaseRecoveryRequest) =>
    api.post('/api/recovery/methods/cross-base', input, { timeout: 120_000 }) as Promise<RecoveryMethodMutation>,
  simulateFlightChange: (input: FlightChangeInput) =>
    api.post('/api/recovery/simulate-flight-change', input) as Promise<RecoverySession>,
  getSession: (sessionId: string) =>
    api.get(`/api/recovery/sessions/${encodeURIComponent(sessionId)}`) as Promise<RecoverySession>,
  applyPlan: (sessionId: string, planId: RecoveryPlanId) =>
    api.post(`/api/recovery/sessions/${encodeURIComponent(sessionId)}/apply`, { planId }) as Promise<RecoverySession>,
  applyOption,
}
