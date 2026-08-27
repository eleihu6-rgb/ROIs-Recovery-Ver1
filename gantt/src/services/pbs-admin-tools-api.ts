import { api } from './api'

export type PbsCrewBidImportMode = 'dry_run' | 'import'
export type PbsCrewBidImportStatus = 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed' | 'rolled_back'
export type PbsCrewBidImportItemStatus = 'imported' | 'ready' | 'skipped' | 'failed'
export type PbsCrewBidImportProblemSeverity = 'warning' | 'error'
export type PbsAlgorithmExportDivision = 'P' | 'C' | 'A' | 'ALL'
export type PbsAlgorithmExportStatus = 'ACTIVE' | 'ALL'

export interface PbsAlgorithmExportFilters {
  division: PbsAlgorithmExportDivision
  status: PbsAlgorithmExportStatus
  bases: string[]
  fleetQuals: string[]
}

export interface PbsCrewBidImportOptions {
  importCurrentBid?: boolean
  importDefaultAsStanding?: boolean
  useCurrentBidWhenAvailable?: boolean
  fallbackToDefaultBid?: boolean
  firstPairingBidGroupOnly?: boolean
  overwriteCurrentBid?: boolean
  overwriteStandingBid?: boolean
  failOnUnmatchedPairing?: boolean
  failOnUnmatchedAirport?: boolean
}

export type PbsCrewBidImportTargetContext = 'Current' | 'StandingLineholder' | 'StandingReserve'

export interface PbsCrewBidImportProblem {
  crewId?: string
  category?: string
  bidContext?: 'Current' | 'Default'
  targetBidContext?: PbsCrewBidImportTargetContext
  sourceLineNumber?: number
  sourceSeq?: number
  severity: PbsCrewBidImportProblemSeverity
  code: string
  message: string
  rawText?: string
}

export interface PbsCrewBidImportItem {
  crewId: string
  category: string
  bidContext: 'Current' | 'Default'
  targetBidContext: PbsCrewBidImportTargetContext
  status: PbsCrewBidImportItemStatus
  parsedPreferenceCount: number
  importablePreferenceCount: number
  importedPreferenceCount: number
  skippedPreferenceCount: number
  failedPreferenceCount: number
  matchedPairingCount: number
  unmatchedPairingCount: number
  importedBidId?: number
  message?: string
}

export interface PbsCrewBidImportSummary {
  totalBlocks: number
  totalCrew: number
  selectedCrew: number
  readyCrew: number
  importedCrew: number
  skippedCrew: number
  failedCrew: number
  parsedPreferenceCount: number
  importablePreferenceCount: number
  importedPreferenceCount: number
  skippedPreferenceCount: number
  failedPreferenceCount: number
  matchedPairingCount: number
  unmatchedPairingCount: number
}

export type PbsCrewBidImportPerformancePhase =
  | 'parseSource'
  | 'selectBlocks'
  | 'prepareItems'
  | 'loadCrewContext'
  | 'resolvePairings'
  | 'resolveAirports'
  | 'loadPropertyIdentities'
  | 'writeBids'
  | 'writeSnapshots'
  | 'writeRunDetail'
  | 'total'

export interface PbsCrewBidImportPerformanceTiming {
  phase: PbsCrewBidImportPerformancePhase
  durationMs: number
  detail?: Record<string, number | string | boolean>
}

export interface PbsCrewBidImportPerformance {
  totalMs: number
  timings: PbsCrewBidImportPerformanceTiming[]
  selectedCrew: number
  selectedBlocks: number
  resolverScopeCount?: number
  pairingResolverQueryCount?: number
  airportResolverQueryCount?: number
  writtenBidCount?: number
}

export interface PbsCrewBidImportResponse {
  runId?: string
  rosterPeriodId: number
  mode: PbsCrewBidImportMode
  status: PbsCrewBidImportStatus
  periodCode: string
  sourcePeriodCode?: string
  startedAt: string
  completedAt?: string
  summary: PbsCrewBidImportSummary
  items: PbsCrewBidImportItem[]
  problems: PbsCrewBidImportProblem[]
  performance?: PbsCrewBidImportPerformance
}

export interface PbsCrewBidImportRunListItem {
  runId: string
  rosterPeriodId: number
  periodCode: string
  sourcePeriodCode?: string
  mode: PbsCrewBidImportMode
  status: PbsCrewBidImportStatus
  summary: PbsCrewBidImportSummary
  createdAt: string
  completedAt?: string
  createdBy: string
}

export interface PbsCrewBidImportRunListResponse {
  runs: PbsCrewBidImportRunListItem[]
}

export interface PbsCrewBidImportRunDetailResponse extends PbsCrewBidImportResponse {
  createdBy: string
  rolledBackAt?: string
  rolledBackBy?: string
}

export interface PbsCrewBidImportRollbackResponse {
  runId: string
  status: 'rolled_back'
  restoredBidCount: number
  deletedImportedBidCount: number
  completedAt: string
}

export interface CrewBidImportUploadInput {
  file: File
  rosterPeriodId: number
  periodCode: string
  sourcePeriodCode?: string
  scopeBase?: string
  scopeCategories?: string[]
  scopeCrewIds?: string[]
  options?: PbsCrewBidImportOptions
}

export interface CrewBidImportRunQuery {
  rosterPeriodId?: number
  limit?: number
}

const appendIfPresent = (formData: FormData, key: string, value: string | undefined): void => {
  if (value?.trim()) {
    formData.append(key, value.trim())
  }
}

const buildImportFormData = (input: CrewBidImportUploadInput, confirm?: boolean): FormData => {
  const formData = new FormData()
  formData.append('file', input.file)
  formData.append('rosterPeriodId', String(input.rosterPeriodId))
  appendIfPresent(formData, 'sourcePeriodCode', input.sourcePeriodCode)
  appendIfPresent(formData, 'scopeBase', input.scopeBase)

  if (input.scopeCategories && input.scopeCategories.length > 0) {
    formData.append('scopeCategories', JSON.stringify(input.scopeCategories))
  }
  if (input.scopeCrewIds && input.scopeCrewIds.length > 0) {
    formData.append('scopeCrewIds', JSON.stringify(input.scopeCrewIds))
  }
  if (input.options) {
    formData.append('options', JSON.stringify(input.options))
  }
  if (confirm !== undefined) {
    formData.append('confirm', String(confirm))
  }

  return formData
}

const buildQuery = (params: Record<string, string | number | string[] | undefined>): string => {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item.trim().length > 0) {
          search.append(key, item.trim())
        }
      })
      return
    }

    if (value !== undefined && String(value).trim().length > 0) {
      search.set(key, String(value))
    }
  })

  return search.toString()
}

export const downloadAlgorithmPackage = async (
  rosterPeriodId: number,
  periodCode: string,
  variant: 'current' | 'yeg-test',
  filters?: PbsAlgorithmExportFilters,
): Promise<Blob> => {
  const query = buildQuery({
    rosterPeriodId,
    periodCode,
    ...(variant === 'current' && filters ? {
      division: filters.division,
      status: filters.status,
      bases: filters.bases,
      fleetQuals: filters.fleetQuals,
    } : {}),
  })
  const path = variant === 'current'
    ? `/api/admin/algorithm-export?${query}`
    : `/api/admin/algorithm-export/yeg-test-package?${query}`

  return api.get(path, { responseType: 'blob', timeout: 120000 }) as Promise<Blob>
}

export const dryRunCrewBidImport = async (
  input: CrewBidImportUploadInput,
): Promise<PbsCrewBidImportResponse> =>
  api.post('/api/admin/crew-bid-imports/dry-run', buildImportFormData(input), {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }) as Promise<PbsCrewBidImportResponse>

export const importCrewBids = async (
  input: CrewBidImportUploadInput,
): Promise<PbsCrewBidImportResponse> =>
  api.post('/api/admin/crew-bid-imports', buildImportFormData(input, true), {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }) as Promise<PbsCrewBidImportResponse>

export const fetchCrewBidImportRuns = async (
  query: CrewBidImportRunQuery,
): Promise<PbsCrewBidImportRunListResponse> => {
  const search = buildQuery({
    rosterPeriodId: query.rosterPeriodId,
    limit: query.limit,
    _ts: Date.now(),
  })
  return api.get(`/api/admin/crew-bid-imports${search ? `?${search}` : ''}`) as Promise<PbsCrewBidImportRunListResponse>
}

export const fetchCrewBidImportRun = async (
  runId: string,
): Promise<PbsCrewBidImportRunDetailResponse> =>
  api.get(`/api/admin/crew-bid-imports/${encodeURIComponent(runId)}?_ts=${Date.now()}`) as Promise<PbsCrewBidImportRunDetailResponse>

export const rollbackCrewBidImportRun = async (
  runId: string,
  restorePrevious: boolean,
): Promise<PbsCrewBidImportRollbackResponse> =>
  api.delete(`/api/admin/crew-bid-imports/${encodeURIComponent(runId)}`, {
    data: { confirm: true, restorePrevious },
  }) as Promise<PbsCrewBidImportRollbackResponse>
