import { api } from './api'
import { useLegalityStore } from '@/stores/legality-store'
import { getFilterStore } from '@/stores/filter-store'
import type { GanttContextId } from '@/stores/create-context-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { resolveViolationViewBounds } from '@/utils/violation-display-window'
import type { RosterItem } from '@/types'
import type { RuleViolation } from '@/types/rule-check'

export interface DraftLegalityPreviewRequest {
  contextType: 'live' | 'scenario'
  scenarioId?: number
  rulesetId?: number
  affectedCrewIds: string[]
  afterItems: RosterItem[]
  focusPairingIds?: number[]
  /** Inclusive Gantt RP YYYY-MM-DD; when omitted, filled from current filter bounds. */
  rpFrom?: string
  rpTo?: string
}

export interface DraftLegalityPreviewResponse {
  allowed: boolean
  violations: Array<{
    crewId: string
    pairingId: number | null
    dutySeq: number | null
    ruleCode: string
    ruleInstance: string
    scopeKey: string
    severity: number
    startDt: string | null
    endDt: string | null
    message: string
    flightId?: number | null
  }>
}

/**
 * Inclusive calendar YYYY-MM-DD for RP bounds.
 * Do NOT use Date#toISOString on end-of-local-day instants — those often land on the
 * next UTC date (e.g. 2026-07-31 23:59 America/Edmonton → 2026-08-01Z), which makes
 * 7505/7507 see a 32-day RP and miss the 31-31 band.
 */
const ymdFromRpInstant = (ms: number, role: 'start' | 'end'): string => {
  // Bias toward the calendar mid-day so end-of-day / start-of-day TZ edges stay on the RP day.
  const shifted = role === 'end' ? ms - 12 * 3_600_000 : ms + 12 * 3_600_000
  return new Date(shifted).toISOString().slice(0, 10)
}

/**
 * Official Gantt RP — prefer selected roster_period.rp_start/rp_end strings.
 * Pass a scenario id so Scenario preview does not inherit Live's selected RP
 * (Live+Scenario keep separate filter stores).
 */
export const currentGanttRpBounds = (
  contextId: GanttContextId = 'live',
): { rpFrom: string; rpTo: string } | Record<string, never> => {
  const filter = getFilterStore(contextId).getState()
  const ids = filter.selectedRosterPeriodIds
  if (ids.length > 0) {
    const chosen = useRosterPeriodStore.getState().items.filter((rp) =>
      ids.includes(String(rp.id)),
    )
    if (chosen.length > 0) {
      const starts = chosen.map((rp) => rp.rpStart.slice(0, 10)).sort()
      const ends = chosen.map((rp) => rp.rpEnd.slice(0, 10)).sort()
      return { rpFrom: starts[0], rpTo: ends[ends.length - 1] }
    }
  }
  if (typeof contextId === 'number') {
    const data = getScenarioGanttStore(contextId).getState().data
    if (data?.strDtLoc && data?.endDtLoc) {
      return {
        rpFrom: data.strDtLoc.slice(0, 10),
        rpTo: data.endDtLoc.slice(0, 10),
      }
    }
  }
  if (filter.selectedRosterPeriodRange) {
    const bounds = resolveViolationViewBounds(filter.dateRange, filter.selectedRosterPeriodRange)
    return {
      rpFrom: ymdFromRpInstant(bounds.start.getTime(), 'start'),
      rpTo: ymdFromRpInstant(bounds.end.getTime(), 'end'),
    }
  }
  return {}
}

const toRuleViolation = (v: DraftLegalityPreviewResponse['violations'][number]): RuleViolation => ({
  ruleCode: v.ruleCode,
  ruleName: v.ruleInstance ? `${v.ruleCode}/${v.ruleInstance}` : v.ruleCode,
  severity: v.severity,
  canOverride: v.severity < 3,
  message: v.message,
  targetId: v.pairingId ?? v.crewId,
  targetType: v.pairingId == null ? 'crew' : 'pairing',
  crewId: v.crewId,
  anchorPairingId: v.pairingId,
  windowStartDt: v.startDt,
  windowEndDt: v.endDt,
  flightId: v.flightId ?? null,
  isNew: true,
  source: v.pairingId == null ? 'roster' : 'pairing',
})

export const legalityPreviewApi = {
  async checkDraft(input: DraftLegalityPreviewRequest): Promise<DraftLegalityPreviewResponse> {
    const rulesetId = input.contextType === 'live'
      ? (input.rulesetId ?? useLegalityStore.getState().selectedId ?? undefined)
      : input.rulesetId
    const rpContext: GanttContextId =
      input.contextType === 'scenario' && input.scenarioId != null
        ? input.scenarioId
        : 'live'
    const rp = (input.rpFrom && input.rpTo)
      ? { rpFrom: input.rpFrom, rpTo: input.rpTo }
      : currentGanttRpBounds(rpContext)
    return api.post('/api/legality/preview-draft', {
      ...input,
      ...rp,
      rulesetId,
    }, { timeout: 120_000 }) as Promise<DraftLegalityPreviewResponse>
  },

  toRuleViolations(violations: DraftLegalityPreviewResponse['violations']): RuleViolation[] {
    return violations.map(toRuleViolation)
  },
}
