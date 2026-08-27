import type { CheckInput } from '@/utils/roster-to-check-input'

// ── Gantt display violation types ────────────────────────
// Shared by Live (rule-check-store) and Scenario (scenario-violation-store)
// and the GanttViolationSource adapter. Defined here (not in a store) so the
// shared presentation layer / source adapters can import them without pulling
// in a store (avoids an import cycle).

/** A single rule violation mapped for Gantt display */
export interface RuleViolation {
  ruleCode: string
  ruleName: string
  severity: number       // 1=INFO, 2=WARNING, 3=ERROR
  canOverride: boolean
  message: string
  targetId: string | number
  targetType: 'roster' | 'pairing' | 'crew'
  /** owner crew for persisted rows whose anchor target is outside the current visible item set */
  crewId?: string
  /** physical anchor pairing id, distinct from the effective violation window */
  anchorPairingId?: number | null
  windowStartDt?: string | null
  windowEndDt?: string | null
  /** Physical flight id (8030 COF); used for confirm-dialog grouping. */
  flightId?: number | null
  /** true = this violation is newly introduced by the current operation */
  isNew?: boolean
  /** origin of the violation: pairing-level check or roster-level check */
  source?: 'pairing' | 'roster'
}

/** Pre-check result for confirmation dialog */
export interface PreCheckResult {
  allowed: boolean
  violations: RuleViolation[]
  hasBlocking: boolean
}

// ── Rule engine result types ─────────────────────────────

export interface CalcResult {
  ruleCode: string
  ruleName: string
  value: number
  unit: string
  details?: Record<string, unknown>
}

export interface CheckResult {
  ruleCode: string
  ruleName: string
  passed: boolean
  severity: number
  actualValue: number
  limitValue: number
  unit: string
  message: string
  overridable?: boolean
}

export interface EngineResult {
  calcResults: CalcResult[]
  checkResults: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}

export interface RuleGroup {
  groupCode: string
  name: string
  usage: string
  isDefault?: boolean
}

// ── /check/batch 响应 ────────────────────────────────────

export interface BatchCheckItem {
  id: number          // pairingId
  result: EngineResult
}

export interface BatchCheckResponse {
  items: BatchCheckItem[]
  totalDuration: number
}

// ── /check/roster 请求与响应 ─────────────────────────────

export interface RosterCheckRequest {
  ruleGroupCode: string
  crew: NonNullable<CheckInput['crew']>
  pairings: CheckInput['pairing'][]
  periodStart: string   // ISO 8601
  periodEnd: string
}

export interface RosterCheckResponse {
  pairingResults: Record<string, EngineResult>
  rosterViolations: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}
