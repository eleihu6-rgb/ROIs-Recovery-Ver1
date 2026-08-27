// gantt/src/hooks/use-scenario-ws-updates.ts
import { useEffect } from 'react'
import { wsClient } from '@/services/ws'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import { scenarioApi } from '@/services/scenario-api'
import { fetchScenarioLegality, applyScenarioLegalityResponse } from '@/services/scenario-legality-api'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useScenarioStore } from '@/stores/scenario-store'
import { applyScenarioPatchesToData } from '@/utils/scenario-roster-edit'
import type { AssignmentPatch, ScenarioMonthStats } from '@/types/scenario-gantt'

/** Refresh affected crews' crewStats and merge into the gantt data (no full reload). */
export const refreshScenarioCrewStats = async (scenarioId: number, crewIds: string[]): Promise<void> => {
  try {
    const fresh = await scenarioGanttApi.getScenarioCrewStats(scenarioId, crewIds)
    const store = getScenarioGanttStore(scenarioId)
    store.setState((state) => {
      if (!state.data) return state
      const merged: Record<string, Record<string, ScenarioMonthStats>> = {
        ...state.data.crewStats,
      }
      for (const [crewId, months] of Object.entries(fresh)) {
        merged[crewId] = { ...(merged[crewId] ?? {}), ...months }
      }
      return { data: { ...state.data, crewStats: merged } }
    })
  } catch {
    // Targeted refresh failed (e.g. WS raced a reload) — the next recompute push retries.
  }
}

export const refreshScenarioKpis = async (scenarioId: number): Promise<void> => {
  try {
    const results = await scenarioApi.getResults(scenarioId)
    useScenarioStore.setState({ results })
  } catch {
    // KPI section is not always mounted (e.g. on the gantt view) — ignore refresh races.
  }
}

/**
 * Dispatch one WS message to its targeted refresh. Extracted from the hook so the
 * mapping can be unit-tested without a React renderer.
 */
export const handleScenarioRecomputeMessage = (scenarioId: number, msg: unknown): void => {
  if (!msg || typeof msg !== 'object') return
  const m = msg as Record<string, unknown>
  if (m.type === 'scenario-manday-updated' && Number(m.scenarioId) === scenarioId) {
    const crewIds = Array.isArray(m.crewIds) ? m.crewIds.map(String).filter(Boolean) : []
    if (crewIds.length > 0) void refreshScenarioCrewStats(scenarioId, crewIds)
  } else if (m.type === 'scenario-kpi-updated' && Number(m.scenarioId) === scenarioId) {
    void refreshScenarioKpis(scenarioId)
  } else if (m.type === 'scenario-legality-updated' && Number(m.scenarioId) === scenarioId) {
    // Recheck writes duty_ref_tz in DB; reload gantt so Pairing Detail Ref TZ is not stale.
    void fetchScenarioLegality(scenarioId)
      .then(async (res) => {
        if (res.status === 'READY') {
          const store = getScenarioGanttStore(scenarioId)
          if (store.getState().data) {
            await store.getState().reloadData(scenarioId)
          }
        }
        applyScenarioLegalityResponse(scenarioId, res)
      })
      .catch(() => { /* next signal retries */ })
  } else if (m.type === 'scenario-roster-updated' && Number(m.scenarioId) === scenarioId) {
    const patches = Array.isArray(m.patches) ? m.patches as AssignmentPatch[] : []
    if (patches.length === 0) return
    const store = getScenarioGanttStore(scenarioId)
    const st = store.getState()
    // Only apply when this scenario gantt is actually loaded here; otherwise skip and let
    // the next mount's loadData pull the authoritative roster (including the save).
    if (!st.data) return
    const next = applyScenarioPatchesToData(st.data, patches)
    if (next !== st.data) store.setState({ data: next, dataRevision: st.dataRevision + 1 })
  }
}

/**
 * Targeted-refresh handler for async recompute push signals on one scenario:
 *  - scenario-manday-updated   → refetch affected crews' crewStats, merge into the gantt data
 *  - scenario-kpi-updated      → refetch the scenario result/KPI section
 *  - scenario-legality-updated → refetch persisted legality (also applies to the violation store)
 *
 * Save now performs the authoritative full gantt-data reload; this hook remains the
 * background push path for async recomputes only.
 */
export const useScenarioWsUpdates = (scenarioId: number): void => {
  useEffect(() => {
    return wsClient.onMessage((msg) => handleScenarioRecomputeMessage(scenarioId, msg))
  }, [scenarioId])
}
