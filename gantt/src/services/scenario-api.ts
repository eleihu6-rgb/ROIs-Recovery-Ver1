// gantt/src/services/scenario-api.ts
import { api } from './api'
import type { RosterAssignment } from '@/types'
import type {
  ScenarioItem,
  ScenarioDetail,
  ScenarioResults,
  ScenarioListQuery,
  ScenarioListResponse,
  ScenarioRunHealth,
  ScenarioRunProgress,
  ScenarioParameterResponse,
  ScenarioParameterSaveRequest,
  ScenarioVersionDiff,
  ScenarioNoteMessage,
  ScenarioNoteListResponse,
  CreateScenarioInput,
  UpdateScenarioInput,
  ScenarioStatus,
  ScenarioVersionListResponse,
} from '@/types'

export interface S3PairingPoTarget {
  id: number
  worksetId?: number | null
  name: string
  status: string
  strDtLoc: string
  endDtLoc: string
}

export type PairingScenarioOption = S3PairingPoTarget

export type S3PairingImportInput =
  | {
      file: File
      targetMode: 'existing'
      targetScenarioId: number
      clearBeforeImport: boolean
    }
  | {
      file: File
      targetMode: 'new'
      clearBeforeImport?: false
      newScenarioName?: string
      newStrDtLoc: string
      newEndDtLoc: string
      newDivision: string
    }

export interface S3PairingImportResult {
  scenarioId: number
  createdScenario: boolean
  importedPairings: number
  importedSegments: number
  importedCompositions: number
  warnings: string[]
}

export const scenarioApi = {
  async list(query: ScenarioListQuery): Promise<ScenarioListResponse> {
    const params: Record<string, unknown> = {
      page: query.page,
      pageSize: query.pageSize,
    }
    if (query.search) params.search = query.search
    if (query.name) params.name = query.name
    if (query.fileType) params.fileType = query.fileType
    if (query.status) params.status = query.status
    return api.get('/api/scenario', { params }) as Promise<ScenarioListResponse>
  },

  async getById(id: number): Promise<ScenarioDetail> {
    return api.get(`/api/scenario/${id}`) as Promise<ScenarioDetail>
  },

  async create(data: CreateScenarioInput): Promise<ScenarioDetail> {
    return api.post('/api/scenario', data) as Promise<ScenarioDetail>
  },

  async update(id: number, data: UpdateScenarioInput): Promise<ScenarioDetail> {
    return api.put(`/api/scenario/${id}`, data) as Promise<ScenarioDetail>
  },

  async remove(id: number): Promise<void> {
    return api.delete(`/api/scenario/${id}`) as Promise<void>
  },

  async transition(id: number, status: ScenarioStatus, options?: { deleteVersionFiles?: boolean }): Promise<ScenarioDetail> {
    return api.post(`/api/scenario/${id}/transition`, { status, ...(options ?? {}) }) as Promise<ScenarioDetail>
  },

  async getVersions(id: number): Promise<ScenarioVersionListResponse> {
    return api.get(`/api/scenario/${id}/versions`) as Promise<ScenarioVersionListResponse>
  },

  async deleteVersion(id: number, version: string): Promise<void> {
    return api.delete(`/api/scenario/${id}/versions/${encodeURIComponent(version)}`) as Promise<void>
  },

  async getVersionDiff(id: number, version: string): Promise<ScenarioVersionDiff> {
    return api.get(`/api/scenario/${id}/versions/${encodeURIComponent(version)}/diff`) as Promise<ScenarioVersionDiff>
  },

  async getNotes(id: number): Promise<ScenarioNoteListResponse> {
    return api.get(`/api/scenario/${id}/notes`) as Promise<ScenarioNoteListResponse>
  },

  async addNote(id: number, input: { text: string; author: string; replyTo?: string | null }): Promise<{ item: ScenarioNoteMessage }> {
    return api.post(`/api/scenario/${id}/notes`, input) as Promise<{ item: ScenarioNoteMessage }>
  },

  async patchNote(id: number, messageId: string, text: string): Promise<{ item: ScenarioNoteMessage }> {
    return api.patch(`/api/scenario/${id}/notes/${encodeURIComponent(messageId)}`, { text }) as Promise<{ item: ScenarioNoteMessage }>
  },

  async deleteNote(id: number, messageId: string): Promise<{ ok: true }> {
    return api.delete(`/api/scenario/${id}/notes/${encodeURIComponent(messageId)}`) as Promise<{ ok: true }>
  },

  async clearNotes(id: number): Promise<{ ok: true }> {
    return api.delete(`/api/scenario/${id}/notes`) as Promise<{ ok: true }>
  },

  async getResults(id: number): Promise<ScenarioResults> {
    return api.get(`/api/scenario/${id}/results`) as Promise<ScenarioResults>
  },

  async getProgress(id: number): Promise<ScenarioRunProgress> {
    return api.get(`/api/scenario/${id}/progress`) as Promise<ScenarioRunProgress>
  },

  /**
   * Kick off RO optimization on engine-server via live-server.
   * live-server waits for engine `/optimize/start`, which builds ro_input +
   * scenario bid package synchronously (often minutes for YYZ/multi-fleet
   * scopes). Keep the client timeout aligned with ENGINE_START_TIMEOUT_MS
   * (default 600s) so axios does not abort with "timeout of 30000ms exceeded".
   */
  async run(id: number): Promise<{ taskId: string }> {
    return api.post(`/api/scenario/${id}/run`, {}, { timeout: 600_000 }) as Promise<{ taskId: string }>
  },

  async getRunHealth(): Promise<ScenarioRunHealth> {
    return api.get('/api/scenario/run-health') as Promise<ScenarioRunHealth>
  },

  async getParameters(id: number): Promise<ScenarioParameterResponse> {
    return api.get(`/api/scenario/${id}/parameters`) as Promise<ScenarioParameterResponse>
  },

  async saveParameters(id: number, data: ScenarioParameterSaveRequest): Promise<ScenarioParameterResponse> {
    return api.put(`/api/scenario/${id}/parameters`, data) as Promise<ScenarioParameterResponse>
  },

  async listS3PairingPoTargets(): Promise<{ items: S3PairingPoTarget[] }> {
    return api.get('/api/scenario/import-targets/po') as Promise<{ items: S3PairingPoTarget[] }>
  },

  async listPairingScenarioOptions(): Promise<PairingScenarioOption[]> {
    const res = await this.listS3PairingPoTargets()
    return res.items
  },

  async importS3Pairing(input: S3PairingImportInput): Promise<S3PairingImportResult> {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('targetMode', input.targetMode)
    formData.append('clearBeforeImport', String(input.targetMode === 'existing' ? input.clearBeforeImport : false))

    if (input.targetMode === 'existing') {
      formData.append('targetScenarioId', String(input.targetScenarioId))
    } else {
      if (input.newScenarioName) formData.append('newScenarioName', input.newScenarioName)
      formData.append('newStrDtLoc', input.newStrDtLoc)
      formData.append('newEndDtLoc', input.newEndDtLoc)
      formData.append('newDivision', input.newDivision)
    }

    return api.post('/api/scenario/s3-pairing-import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
    }) as Promise<S3PairingImportResult>
  },

  /** Clone a scenario as a new DRAFT with "Copy of <name>". */
  async duplicate(id: number): Promise<ScenarioDetail> {
    return api.post(`/api/scenario/${id}/duplicate`, {}) as Promise<ScenarioDetail>
  },

  /** Read the optimized roster with enriched pairing metadata. */
  async getRoster(id: number): Promise<{ assignments: RosterAssignment[]; publishSupported?: boolean }> {
    return api.get(`/api/scenario/${id}/roster`) as Promise<{ assignments: RosterAssignment[]; publishSupported?: boolean }>
  },

  /** Import selected optimized assignments back to live roster_flight. */
  async publishRoster(
    id: number,
    rosterIds: number[],
  ): Promise<{ published: number }> {
    return api.post(`/api/scenario/${id}/publish`, { rosterIds }) as Promise<{ published: number }>
  },

  /** List worksets for the Pairing Sc. dropdown (filters by type). */
  async listWorksets(type?: string): Promise<{ id: number; name: string; type: string; division: string; category: string }[]> {
    const params: Record<string, string> = {}
    if (type) params.type = type
    return api.get('/api/workset', { params }) as Promise<{ id: number; name: string; type: string; division: string; category: string }[]>
  },
}
