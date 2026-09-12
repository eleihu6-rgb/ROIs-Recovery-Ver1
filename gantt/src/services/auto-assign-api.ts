import { api } from './api'
import { rosterApi } from './roster-api'

/**
 * Auto-assign Duties — the "brain".
 *
 * `POST /api/roster/auto-assign/plan` computes, per crew, a warning-clean greedy
 * plan of open duties (FLY / RES pairings, DO ground days, …) across a date range
 * under per-duty-type limits, and returns a full decision TRACE. It does NOT
 * persist anything (the underlying legality preview rolls back). The gantt then
 * REPLAYS the plan as real assign / add-ground-task draft operations ("hands").
 */

/** One row of the dialog's duty-type table; blank limits mean "no limit". */
export interface AutoAssignDutyType {
  group: string
  periodMax?: number | null
  every7Min?: number | null
  every7Max?: number | null
}

export type AutoAssignSkipReason = 'overlap' | 'no-slot' | 'rule' | 'period-max' | 'every7-max'

/** A single step in the per-crew decision trace, surfaced in the dialog log. */
export type AutoAssignStep =
  | { kind: 'filter'; group?: string; found: number; message: string }
  | { kind: 'consider'; group?: string; pairingId: number; label: string; startDt: string | null; endDt: string | null; rank: string }
  | {
      kind: 'skip'
      group?: string
      pairingId: number
      label: string
      reason: AutoAssignSkipReason
      ruleCode?: string
      ruleName?: string
      severity?: number
      message: string
    }
  | { kind: 'assign'; group?: string; pairingId: number; label: string; rank: string; startDt: string | null; endDt: string | null }
  | { kind: 'ground'; group: string; assignment: string; day: string; startDt: string; endDt: string; message: string }
  | { kind: 'unmet'; group: string; start: string; end: string; count: number; message: string }

export interface AutoAssignAssigned {
  pairingId: number
  group?: string
  rosterActingRank: string
  label: string
  startDt: string | null
  endDt: string | null
  blockMinutes: number
}

export interface AutoAssignAssignedGround {
  group: string
  assignment: string
  day: string
  base: string
  startDtUtc: string
  endDtUtc: string
}

export interface AutoAssignSkipped {
  pairingId: number
  label: string
  reason: AutoAssignSkipReason
  ruleCode?: string
  message: string
}

export interface AutoAssignWindowOutcome {
  start: string
  end: string
  count: number
  minUnmet: boolean
  maxHit: boolean
}

export interface AutoAssignDutyOutcome {
  group: string
  existing: number
  assigned: number
  periodMax: number | null
  every7Min: number | null
  every7Max: number | null
  windows: AutoAssignWindowOutcome[]
}

export interface AutoAssignCrewPlan {
  crewId: string
  crewName: string
  base: string
  fleets: string[]
  steps: AutoAssignStep[]
  assigned: AutoAssignAssigned[]
  assignedGround: AutoAssignAssignedGround[]
  skipped: AutoAssignSkipped[]
  outcome: AutoAssignDutyOutcome[]
  summary: { assignedCount: number; skippedCount: number; blockMinutes: number }
}

export interface AutoAssignPlan {
  crews: AutoAssignCrewPlan[]
  summary: { crewCount: number; assignedTotal: number; skippedTotal: number }
}

export interface AutoAssignPlanInput {
  crewIds: string[]
  startDate: string
  endDate: string
  rpFrom?: string
  rpTo?: string
  fleets?: string[]
  policy?: { skipOnSoft?: boolean }
  maxPerCrew?: number
  /** 'even' (default) levels flying hours across the month; 'earliest' front-loads. */
  distribution?: 'even' | 'earliest'
  /** Omitted ⇒ legacy single FLY pass with no limits. */
  dutyTypes?: AutoAssignDutyType[]
}

/** Catalogue row for the "Add duty type" dropdown + Pool column. */
export interface AutoAssignDutyGroup {
  group: string
  name: string | null
  pairingBacked: boolean
  poolSize: number | null
  groundAssignment: string | null
}

export const autoAssignApi = {
  /** Compute the no-commit assignment plan + decision trace for the selected crew. */
  async plan(input: AutoAssignPlanInput): Promise<AutoAssignPlan> {
    return api.post(
      '/api/roster/auto-assign/plan',
      rosterApi.withRuleset(input),
      { timeout: 120_000 },
    ) as unknown as Promise<AutoAssignPlan>
  },

  /** Assignment-group catalogue with per-crew-matched pool sizes for a date range. */
  async dutyGroups(input: { crewIds: string[]; startDate: string; endDate: string }): Promise<AutoAssignDutyGroup[]> {
    return api.post('/api/roster/auto-assign/duty-groups', input, { timeout: 60_000 }) as unknown as Promise<AutoAssignDutyGroup[]>
  },
}
