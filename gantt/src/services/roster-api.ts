import { api } from './api'
import { useLegalityStore } from '@/stores/legality-store'
import type { RosterItem, CreateRosterInput, CreateGroundTaskInput, UpdateRosterInput, SwapTasksInput, MoveTaskInput } from '@/types'

export interface RosterBulkDeleteGroup {
  mode: 'PAIRED' | 'STANDALONE'
  assignment: string
  assignmentGroup: string
  count: number
}

export interface RosterBulkDeleteCandidate {
  id: number
  pairingId: number | null
  crewId: string
  source: string | null
  startDt: string
  assignmentGroup: string
  assignment: string | null
  pairingLabel: string | null
  rosterActingRank: string | null
  fltNum: string | null
  depArp: string | null
  arvArp: string | null
}

export interface RosterBulkDeleteCandidatesResult {
  groups: RosterBulkDeleteGroup[]
  rows: RosterBulkDeleteCandidate[]
}

export interface RosterBulkDeleteProgress {
  stage: string
  percent: number
  startedAt: string
  elapsedMs: number
  deleted?: number
  crewCount?: number
  message?: string
  stages?: Array<{
    stage: 'deleting' | 'rechecking' | 'recomputing-manday' | 'broadcasting'
    status: 'pending' | 'active' | 'completed' | 'skipped' | 'failed'
    startedAt?: string
    finishedAt?: string
    elapsedMs: number
    message?: string
  }>
}

export interface RosterBulkDeleteTaskStatus {
  taskId: string
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown'
  progress: RosterBulkDeleteProgress
  result: { deleted: number; crewIds: string[]; durationMs: number } | null
  error: string | null
}

export const rosterApi = {
  withRuleset<T extends object>(data: T): T & { rulesetId?: number } {
    const value = useLegalityStore.getState().selectedId
    return value != null && Number.isInteger(value) && value > 0 ? { ...data, rulesetId: value } : data
  },
  /** Get roster view for Gantt chart. P1-4: 支持 AbortSignal 取消过期请求。 */
  async getView(crewIds: string[], startDate: string, endDate: string, signal?: AbortSignal): Promise<RosterItem[]> {
    const params = {
      crewIds: crewIds.join(','),
      startDate,
      endDate,
    }
    return api.get('/api/roster', { params, signal }) as unknown as Promise<RosterItem[]>
  },

  /** Get single roster entry */
  async getById(id: number): Promise<RosterItem> {
    return api.get(`/api/roster/${id}`) as Promise<RosterItem>
  },

  /** Create a new roster entry */
  async create(data: CreateRosterInput): Promise<RosterItem> {
    return api.post('/api/roster', rosterApi.withRuleset(data)) as Promise<RosterItem>
  },

  /** Update an existing roster entry */
  async update(id: number, data: UpdateRosterInput): Promise<RosterItem> {
    return api.put(`/api/roster/${id}`, rosterApi.withRuleset(data)) as Promise<RosterItem>
  },

  /** Soft delete a roster entry */
  async remove(id: number): Promise<RosterItem> {
    return api.post(`/api/roster/${id}/delete`, rosterApi.withRuleset({})) as Promise<RosterItem>
  },

  /** Delete all roster entries belonging to a pairing for a specific crew */
  async removeByPairingAndCrew(pairingId: number, crewId: string): Promise<void> {
    await api.post(`/api/roster/pairing/${pairingId}/crew/${crewId}/delete`, rosterApi.withRuleset({}))
  },

  /** Swap tasks between two crew members */
  async swap(data: SwapTasksInput): Promise<{ taskA: RosterItem; taskB: RosterItem }> {
    return api.post('/api/roster/swap', rosterApi.withRuleset(data)) as Promise<{ taskA: RosterItem; taskB: RosterItem }>
  },

  /** Move task to another crew member */
  async move(data: MoveTaskInput): Promise<RosterItem> {
    return api.post('/api/roster/move', rosterApi.withRuleset(data)) as Promise<RosterItem>
  },

  /** Assign a pairing to a crew member */
  async assignPairing(data: { pairingId: number; crewId: string; rosterActingRank: string }): Promise<RosterItem[]> {
    return api.post('/api/roster/assign-pairing', rosterApi.withRuleset(data)) as Promise<RosterItem[]>
  },

  /** Assign a single flight to a crew member */
  async assignFlight(data: { flightId: number; crewId: string }): Promise<RosterItem> {
    return api.post('/api/roster/assign-flight', rosterApi.withRuleset(data)) as Promise<RosterItem>
  },

  /** Batch-create ground task entries for multiple crew members (single transaction) */
  async createGroundTask(data: CreateGroundTaskInput): Promise<RosterItem[]> {
    return api.post('/api/roster/create-ground-task', rosterApi.withRuleset(data)) as Promise<RosterItem[]>
  },

  async getBulkDeleteCandidates(params: {
    startDate: string
    endDate: string
    groupKeys?: string[]
    divisions?: string[]
    bases?: string[]
    crewIds?: string[]
    sources?: string[]
  }): Promise<RosterBulkDeleteCandidatesResult> {
    return api.get('/api/roster/bulk-delete/candidates', {
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        groupKeys: params.groupKeys?.join(',') ?? '',
        divisions: params.divisions?.join(',') ?? '',
        bases: params.bases?.join(',') ?? '',
        crewIds: params.crewIds?.join(',') ?? '',
        sources: params.sources?.join(',') ?? '',
      },
      timeout: 90_000,
    }) as unknown as Promise<RosterBulkDeleteCandidatesResult>
  },

  async bulkDelete(input: {
    ids: number[]
    pairingCrewKeys?: Array<{ pairingId: number; crewId: string }>
  }): Promise<{ taskId: string }> {
    return api.post('/api/roster/bulk-delete', rosterApi.withRuleset(input), { timeout: 15_000 }) as Promise<{ taskId: string }>
  },

  async getBulkDeleteTaskStatus(taskId: string): Promise<RosterBulkDeleteTaskStatus> {
    return api.get(`/api/roster/bulk-delete/tasks/${encodeURIComponent(taskId)}`) as Promise<RosterBulkDeleteTaskStatus>
  },
}
