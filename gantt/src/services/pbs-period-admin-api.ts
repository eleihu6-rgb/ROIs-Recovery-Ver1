import { api } from './api'

export type PbsPeriodStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'AWARDED' | 'PUBLISHED'
export type PbsComputedPeriodStage = 'NOT_OPEN' | 'OPEN' | 'CLOSED' | 'INCOMPLETE'
export interface PbsPeriod {
  id: number
  periodCode: string
  rpStart: string
  rpEnd: string
  bidOpenAt: string
  bidCloseAt: string
  awardPublishAt: string | null
  awardFinalAt: string | null
  misAwardDeadlineAt: string | null
  status: PbsPeriodStatus
  computedStage: PbsComputedPeriodStage
  firstPublishedAt: string | null
  latestPublishedAt: string | null
  latestPublishBatchId: number | null
  createdAt: string | null
  updatedAt: string | null
}

export interface PbsPeriodListResponse {
  rows: PbsPeriod[]
  total: number
}

export interface PbsPeriodFilters {
  periodCode?: string
  status?: PbsComputedPeriodStage
}

export interface PbsPeriodInput {
  periodCode: string
  rpStart: string
  rpEnd: string
  bidOpenAt: string
  bidCloseAt: string
  awardPublishAt: string
  awardFinalAt: string
  misAwardDeadlineAt: string
}

export interface PbsPeriodYearGenerateInput {
  year: number
  bidOpenTime: string
  bidCloseTime: string
}

export interface PbsPeriodYearPreviewItem {
  periodCode: string
  rpStart: string
  rpEnd: string
  bidOpenAt: string
  bidCloseAt: string
  awardPublishAt: string
  awardFinalAt: string
  misAwardDeadlineAt: string
  computedStage: PbsComputedPeriodStage
  exists: boolean
  existingId: number | null
}

export interface PbsPeriodYearPreviewResponse {
  items: PbsPeriodYearPreviewItem[]
  total: number
  newCount: number
  existingCount: number
}

export interface PbsPeriodYearGenerateResponse {
  items: Array<PbsPeriodYearPreviewItem & { created: boolean }>
  created: PbsPeriod[]
  createdCount: number
  skippedCount: number
}

const buildQuery = (filters: PbsPeriodFilters): string => {
  const search = new URLSearchParams()
  if (filters.periodCode?.trim()) search.set('periodCode', filters.periodCode.trim())
  if (filters.status) search.set('status', filters.status)
  search.set('_ts', String(Date.now()))
  return search.toString()
}

export const fetchPbsPeriods = async (filters: PbsPeriodFilters = {}): Promise<PbsPeriodListResponse> =>
  api.get(`/api/pbs/period-admin?${buildQuery(filters)}`) as Promise<PbsPeriodListResponse>

export const createPbsPeriod = async (input: PbsPeriodInput): Promise<PbsPeriod> =>
  api.post('/api/pbs/period-admin', input) as Promise<PbsPeriod>

export const updatePbsPeriod = async (id: number, input: PbsPeriodInput): Promise<PbsPeriod> =>
  api.patch(`/api/pbs/period-admin/${id}`, input) as Promise<PbsPeriod>

export const deletePbsPeriod = async (id: number): Promise<{ id: number }> =>
  api.delete(`/api/pbs/period-admin/${id}`) as Promise<{ id: number }>

export const previewPbsPeriodYear = async (
  input: PbsPeriodYearGenerateInput,
): Promise<PbsPeriodYearPreviewResponse> =>
  api.post('/api/pbs/period-admin/generate-year/preview', input) as Promise<PbsPeriodYearPreviewResponse>

export const generatePbsPeriodYear = async (
  input: PbsPeriodYearGenerateInput,
): Promise<PbsPeriodYearGenerateResponse> =>
  api.post('/api/pbs/period-admin/generate-year', input) as Promise<PbsPeriodYearGenerateResponse>
