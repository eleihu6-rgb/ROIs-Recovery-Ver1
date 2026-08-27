import { api } from '@/services/api'
import {
  calendarDateFromYmd,
  filterViolationsToDisplayWindow,
} from '@/utils/violation-display-window'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'

// Persisted scenario legality (computed by the Rust engine, stored in scenario.rule_violation).
// The shared `api` client unwraps the {code,data,message} envelope, so the resolved value is
// the `data` object. See docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md.

export interface ScenarioViolationDto {
  crew_id: string
  pairing_id: number | null
  duty_seq: number | null
  rule_code: string
  rule_instance: string | null
  severity: number
  actual_value: number | null
  limit_value: number | null
  unit: string | null
  message: string
  start_dt: string
  end_dt: string
  window_start_dt?: string | null
  window_end_dt?: string | null
}

export interface ScenarioLegalityResponse {
  status: 'PENDING' | 'COMPUTING' | 'READY' | 'FAILED'
  violations: ScenarioViolationDto[]
  paramsStale?: boolean
  /** Last successful compute time (ISO), null until the first READY. */
  computedAt?: string | null
  /** Set when status is 'FAILED' — the compute error message. */
  errorText?: string | null
}

export async function fetchScenarioLegality(scenarioId: number): Promise<ScenarioLegalityResponse> {
  const data = (await api.get(`/api/scenario/${scenarioId}/legality`)) as unknown as ScenarioLegalityResponse
  return data
}

/**
 * Apply a legality response into the per-scenario violation store, filtering rows to the
 * official scenarioStrDt/EndDt (same window Live uses for selected RPs). Out-of-period
 * lead-in violations must not light gutter bells or Alert Center.
 */
export function applyScenarioLegalityResponse(
  scenarioId: number,
  res: ScenarioLegalityResponse,
): void {
  const data = getScenarioGanttStore(scenarioId).getState().data
  const violations =
    res.status === 'READY' && data?.scenarioStrDt && data?.scenarioEndDt
      ? filterViolationsToDisplayWindow(
          res.violations,
          calendarDateFromYmd(data.scenarioStrDt),
          calendarDateFromYmd(data.scenarioEndDt),
        )
      : res.violations
  getScenarioViolationStore(scenarioId).getState().applyPersisted({ ...res, violations })
}

/** Fetch persisted legality and write it into the scenario violation store (mount / save / WS). */
export async function refreshScenarioLegality(scenarioId: number): Promise<ScenarioLegalityResponse> {
  const res = await fetchScenarioLegality(scenarioId)
  applyScenarioLegalityResponse(scenarioId, res)
  return res
}

export async function recheckScenarioLegality(scenarioId: number): Promise<{ status: string }> {
  return api.post(`/api/scenario/${scenarioId}/legality/recheck`) as Promise<{ status: string }>
}
