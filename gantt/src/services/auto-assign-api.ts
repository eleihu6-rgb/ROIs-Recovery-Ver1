import { api } from './api'
import { rosterApi } from './roster-api'

/**
 * Auto-assign open pairings — the "brain".
 *
 * `POST /api/roster/auto-assign/plan` computes, per crew, a warning-clean greedy
 * assignment of open base+fleet-matched pairings across the target month and
 * returns a full decision TRACE. It does NOT persist anything (the underlying
 * legality preview rolls back). The gantt then REPLAYS the plan as real assign
 * operations ("hands"), so the user watches the same filter → pick → assign →
 * (skip on rule) → next-pick flow a human would perform.
 */

/** A single step in the per-crew decision trace, surfaced in the dialog log. */
export type AutoAssignStep =
  | { kind: 'filter'; found: number; message: string }
  | { kind: 'consider'; pairingId: number; label: string; startDt: string | null; endDt: string | null; rank: string }
  | {
      kind: 'skip'
      pairingId: number
      label: string
      reason: 'overlap' | 'no-slot' | 'rule'
      ruleCode?: string
      ruleName?: string
      severity?: number
      message: string
    }
  | { kind: 'assign'; pairingId: number; label: string; rank: string; startDt: string | null; endDt: string | null }

export interface AutoAssignAssigned {
  pairingId: number
  rosterActingRank: string
  label: string
  startDt: string | null
  endDt: string | null
  blockMinutes: number
}

export interface AutoAssignSkipped {
  pairingId: number
  label: string
  reason: 'overlap' | 'no-slot' | 'rule'
  ruleCode?: string
  message: string
}

export interface AutoAssignCrewPlan {
  crewId: string
  crewName: string
  base: string
  fleets: string[]
  steps: AutoAssignStep[]
  assigned: AutoAssignAssigned[]
  skipped: AutoAssignSkipped[]
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
}
