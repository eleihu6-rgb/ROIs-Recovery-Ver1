import { api } from './api'

export type RosterPublishStatus = 'ADD' | 'UPDATE' | 'DELETE' | 'NO_CHANGE'
export type RosterPublishKind = 'FLYING' | 'GROUND'

export interface RosterPublishDiffRequest {
  rosterPeriodId: number
  divisions?: string[]
  crewFleets?: string[]
  bases?: string[]
  crewId?: string
  pairingId?: number
  pairingLabel?: string
  statuses?: RosterPublishStatus[]
  page?: number
  pageSize?: number
}

export interface RosterPublishDiffRow {
  key: string
  kind: RosterPublishKind
  status: RosterPublishStatus
  crewId: string
  crewName: string | null
  crewFleet: string | null
  base: string | null
  pairingId: number | null
  pairingLabel: string | null
  rosterIds: number[]
  publishIds: number[]
  assignmentGroup: string | null
  assignment: string | null
  actingRank: string | null
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  segmentCount: number
  changedFields: string[]
  publishStatus: 'PUBLISHED' | 'UNPUBLISHED'
  source: string | null
  noc: 'Ignore' | 'Pending' | 'Success' | null
}

export interface RosterPublishDiffResponse {
  items: RosterPublishDiffRow[]
  total: number
  page: number
  pageSize: number
  summary: {
    add: number
    update: number
    delete: number
    noChange: number
    actionable: number
  }
}

export interface RosterPublishApplyRequest {
  rosterPeriodId: number
  keys: string[]
}

export interface RosterPublishApplyResponse {
  applied: number
  inserted: number
  updated: number
  deleted: number
  skipped: number
  staleKeys: string[]
}

export const rosterPublishApi = {
  diff(input: RosterPublishDiffRequest): Promise<RosterPublishDiffResponse> {
    return api.post('/api/roster/publish/diff', input) as Promise<RosterPublishDiffResponse>
  },

  apply(input: RosterPublishApplyRequest): Promise<RosterPublishApplyResponse> {
    return api.post('/api/roster/publish/apply', input) as Promise<RosterPublishApplyResponse>
  },
}
