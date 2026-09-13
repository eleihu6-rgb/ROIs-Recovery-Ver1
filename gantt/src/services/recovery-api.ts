import axios from 'axios'
import { LIVE_API_BASE } from '@/config/api-paths'
import { api } from './api'

/**
 * Dedicated axios instance for diagnostic POSTs that must NOT trigger the
 * `onUnauthorized` logout cascade (used by the auth-store to drop the session
 * on a 401). Used by the cross-base recovery trace POST, which is purely
 * best-effort and must never log the user out if the token is mid-refresh.
 *
 * Forwards the Bearer token from the shared `api` instance via a request
 * interceptor so the live-server auth hook still accepts the call.
 */
const recoveryTraceClient = axios.create({
  baseURL: LIVE_API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

recoveryTraceClient.interceptors.request.use((config) => {
  const auth = api.defaults.headers.common['Authorization']
  if (auth) config.headers['Authorization'] = auth
  return config
})

recoveryTraceClient.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body && body.code === 200) {
      return body.data
    }
    return body
  },
  (error) => {
    return Promise.reject(error)
  },
)

export const recoveryTraceApi = {
  post: <T>(url: string, body: unknown): Promise<T> =>
    recoveryTraceClient.post(url, body) as Promise<T>,
}

export interface RecoveryLibraryCostApiInput {
  swapContext?: { sourceCrewId: string; sourcePairingId: number; targetCrewId: string; targetPairingId: number }
  standbyContext?: { crewId: string; pairingId: number; standbyTaskId: number }
  mode: 'transfer' | 'swap' | 'standby' | 'swap-duty' | 'flight-delay' | 'cross-base-standby' | 'cross-base-swap' | 'cross-base-destination' | 'cross-base-direct'
  crossBase: number
  crossDivision: number
  crossRole: number
  changed: number
  followOnImpactCount: number
  dhdOutboundSectors: number
  dhdFlightCost: number
  dhdCostSavings: number
}

/** Per-component cost breakdown row — surfaced by /api/recovery/calculate-cost/batch. */
export interface CostLibraryBreakdownRow {
  label: string
  typeCode: number
  calculatorCode: string
  revisionId: number | null
  quantity: number
  amount: number | null
  status: 'priced' | 'unpriced' | 'disabled' | 'missing-revision'
  currencyCode: string
}

export interface RecoveryLibraryCostApiResult {
  directCost: number | null
  currency: string
  /** Per-component breakdown. Frontend may discard this when only totals are needed. */
  breakdown: CostLibraryBreakdownRow[]
  /** Human-readable notes from the bridge (e.g. "fallback to other-airline because own-airline unpriced"). */
  notes: string[]
}

/** Trimmed shape used by `enrichPlansWithLibraryCosts` — keeps the surface area small. */
export interface RecoveryLibraryCostResult {
  directCost: number | null
  currency: string
  breakdown: CostLibraryBreakdownRow[]
  notes: string[]
}

export const recoveryCostApi = {
  /** Batch cost calculation — used by the recovery dialog to refresh directCost from the cost library. */
  postBatch: (inputs: RecoveryLibraryCostApiInput[]): Promise<{ results: RecoveryLibraryCostApiResult[] }> =>
    recoveryTraceClient.post('/api/recovery/calculate-cost/batch', { inputs }) as Promise<{ results: RecoveryLibraryCostApiResult[] }>,
}


export type RecoveryPlanId = 'standby' | 'swap' | 'cross-base'

export type RecoveryOptionMode = 'transfer' | 'swap' | 'standby' | 'swap-duty' | 'flight-delay' | 'cross-base-standby' | 'cross-base-swap' | 'cross-base-destination' | 'cross-base-direct'

/**
 * Which alert type opened the Recovery dialog. Determines the visible plan set:
 * `roster-qualification` (8004) keeps roster / standby / cross-base, while
 * `assignment-overlap` (1001) shows standby → Swap duty → Flight Delay only.
 */
export type { RecoveryTrigger } from './recovery-rules'

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
  operation: 'swap' | 'standby' | 'destination' | 'direct'
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
  maxFlightLeadHours: number
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
  if (input.mode === 'swap-duty' || input.mode === 'flight-delay') {
    return Promise.reject(new Error('Swap duty and Flight Delay are preview-only options; Apply is not wired for them yet.'))
  }
  if (input.mode === 'cross-base-standby' || input.mode === 'cross-base-swap' || input.mode === 'cross-base-destination' || input.mode === 'cross-base-direct') {
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
