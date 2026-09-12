import { api } from './api'

/**
 * Best-fit crew for open pairings — READ-ONLY planning API.
 *
 * The backend decides (candidate pipeline, Rust legality delta, cost library);
 * the frontend replays and displays. Nothing here assigns anything: acting on a
 * shortlist goes through the normal assign-pairing draft path.
 *
 * Design: docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md
 */

export type BestFitBasis = 'fairness' | 'cost'
export type BestFitLegalityVerdict = 'pass' | 'soft' | 'hard' | 'unknown'

export interface BestFitViolation {
  crewId: string
  ruleCode: string
  ruleInstance: string
  severity: number
  scopeKey: string
  pairingId: number | null
  dutySeq: number | null
  flightId: number | null
  startDt: string | null
  endDt: string | null
  message: string
}

export interface BestFitLegality {
  verdict: BestFitLegalityVerdict
  comparison: 'complete' | 'incomplete'
  newViolations: BestFitViolation[]
  changedViolations: BestFitViolation[]
  existingViolations: BestFitViolation[]
  message?: string
}

export interface BestFitCostMember {
  instanceId: number
  revisionId: number
  name: string
  calculatorCode: string
  status: 'priced' | 'unpriced' | 'disabled' | 'not-applicable'
  amount: number | null
  currencyCode: string
  formula: string
  breakdown: Array<{ label: string; value: string }>
  note?: string
}

export interface BestFitCost {
  status: 'priced' | 'partial' | 'unpriced' | 'unavailable'
  amount: number | null
  currencyCode: string | null
  setLabel: string | null
  setVersion: number | null
  members: BestFitCostMember[]
  note?: string
}

export interface BestFitCandidate {
  crewId: string
  name: string
  rank: string
  rankUsed: string
  base: string
  fleets: string[]
  division: string
  seniority: number | null
  mbhMinutes: number
  mcredMinutes: number
  /** False when the crew has no manday activity on record for the roster period. */
  statsAvailable: boolean
  monthCreditHours: number
  cost: BestFitCost
  legality: BestFitLegality
  why: string
}

export interface BestFitSlotResult {
  rank: string
  plan: number
  fill: number
  open: number
  basicMatchCount: number
  checkedCount: number
  truncated: boolean
  bestCrewId: string | null
  candidates: BestFitCandidate[]
}

export interface BestFitPairingResult {
  pairing: {
    id: number
    label: string | null
    base: string
    fleet: string
    division: string
    assignmentGroup: string | null
    assignment: string
    schStrDtUtc: string | null
    schEndDtUtc: string | null
    blockMinutes: number
    creditMinutes: number
  }
  coverage: 'open' | 'partial'
  slots: BestFitSlotResult[]
  funnel: { universe: number; basic: number; pass: number; soft: number; hard: number; unknown: number }
  engine: { rulesetId?: number; rpFrom?: string; rpTo?: string }
  generatedAt: string
}

export interface BestFitSelection {
  pairingId: number
  slotRank: string
  crewId: string
}

export interface BestFitCombinedResult {
  ok: boolean
  hardViolations: BestFitViolation[]
  softViolations: BestFitViolation[]
  conflicts: Array<{ kind: 'overlap' | 'duplicate'; crewId: string; pairingIds: number[]; message: string }>
  crew: Array<{
    crewId: string
    pairingIds: number[]
    addedCreditMinutes: number
    cost: BestFitCost
    violations: BestFitViolation[]
  }>
  totalCost: { amount: number | null; currencyCode: string | null; status: BestFitCost['status']; note?: string }
  comparison: 'complete' | 'incomplete'
  message?: string
  generatedAt: string
}

export interface BestFitPairingRequest {
  pairingId: number
  rulesetId?: number
  rosterPeriod?: string
  rpFrom?: string
  rpTo?: string
  basis?: BestFitBasis
  costSetId?: number
  maxCandidatesPerSlot?: number
  rankSlots?: string[]
}

const LEGALITY_TIMEOUT_MS = 180_000

export const bestFitApi = {
  /** Rank crew for ONE open pairing (per open rank slot). */
  planPairing(input: BestFitPairingRequest): Promise<BestFitPairingResult> {
    return api.post('/api/best-fit/pairing', input, { timeout: LEGALITY_TIMEOUT_MS }) as Promise<BestFitPairingResult>
  },

  /** Joint legality + cost check for the planner's explicit shortlist. */
  combinedPreview(input: {
    selections: BestFitSelection[]
    rulesetId?: number
    rosterPeriod?: string
    rpFrom?: string
    rpTo?: string
    costSetId?: number
  }): Promise<BestFitCombinedResult> {
    return api.post('/api/best-fit/combined-preview', input, { timeout: LEGALITY_TIMEOUT_MS }) as Promise<BestFitCombinedResult>
  },
}
