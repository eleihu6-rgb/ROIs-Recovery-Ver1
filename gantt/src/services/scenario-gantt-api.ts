// gantt/src/services/scenario-gantt-api.ts
import { api } from './api'
import type { ScenarioGanttData, ScenarioMonthStats, AssignmentPatch, LockStatus } from '@/types/scenario-gantt'

export const scenarioGanttApi = {
  async getGanttData(scenarioId: number, version?: string): Promise<ScenarioGanttData> {
    const path = version
      ? `/api/scenario/${scenarioId}/versions/${encodeURIComponent(version)}/gantt-data`
      : `/api/scenario/${scenarioId}/gantt-data`
    return api.get(path, { timeout: 120_000 }) as Promise<ScenarioGanttData>
  },

  /** Targeted crewStats refresh for affected crews after an async manday recompute. */
  async getScenarioCrewStats(
    scenarioId: number,
    crewIds: string[],
  ): Promise<Record<string, Record<string, ScenarioMonthStats>>> {
    return api.get(`/api/scenario/${scenarioId}/crew-stats`, {
      params: { crewIds: crewIds.join(',') },
    }) as Promise<Record<string, Record<string, ScenarioMonthStats>>>
  },

  async acquireLock(scenarioId: number): Promise<{ acquired: boolean }> {
    return api.post(`/api/scenario/${scenarioId}/acquire-lock`, {}) as Promise<{ acquired: boolean }>
  },

  async releaseLock(scenarioId: number): Promise<void> {
    return api.post(`/api/scenario/${scenarioId}/release-lock`, {}) as Promise<void>
  },

  async getLockStatus(scenarioId: number): Promise<LockStatus> {
    return api.get(`/api/scenario/${scenarioId}/lock-status`) as Promise<LockStatus>
  },

  async keepaliveLock(scenarioId: number): Promise<{ renewed: boolean }> {
    return api.post(`/api/scenario/${scenarioId}/lock-keepalive`, {}) as Promise<{ renewed: boolean }>
  },

  async patchOutput(scenarioId: number, patches: AssignmentPatch[]): Promise<void> {
    return api.post(`/api/scenario/${scenarioId}/patch-output`, { patches }) as Promise<void>
  },
}
