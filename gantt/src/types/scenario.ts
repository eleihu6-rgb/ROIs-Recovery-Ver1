// gantt/src/types/scenario.ts

export type ScenarioStatus = 'DRAFT' | 'RUNNING' | 'DONE' | 'FAILED' | 'PUBLISHED'
export type ScenarioType = 'PO' | 'RO' | 'TO'
export type FlightStatusFilter = 'SCHEDULED' | 'ACTUAL' | 'ALL'
/** Division table code (e.g. 'P', 'C'). Legacy 'ALL' is normalized to 'P' on read. */
export type CrewDivisionFilter = string
export type CrewStatusFilter = 'ACTIVE' | 'ALL'
export type PairingSourceFilter = 'MANUAL' | 'OPT' | 'IMPORT'
export type TrainingExpiryFilter = 'EXPIRING_90D' | 'ALL'

export interface NumberRangeFilter {
  min: number | null
  max: number | null
}

export interface DateRangeFilter {
  from: string
  to: string
}

export interface PoFilterParams {
  /** Optional bases; empty = all bases. Division lives on workset.division. */
  bases: string[]
  flightNos: string[]
  depAirports: string[]
  arrAirports: string[]
  fleets: string[]
  flightStatus: FlightStatusFilter
}

export interface RoFilterParams {
  crew: {
    bases: string[]
    fleets: string[]
    ranks: string[]
    seniority: NumberRangeFilter
    birthday: DateRangeFilter
    status: CrewStatusFilter
  }
  pairing: {
    bases: string[]
    fleets: string[]
    ranks: string[]
    types: string[]
    duration: NumberRangeFilter
    /** Legacy field; optimizer export does not use it and Scenario UI no longer exposes it. */
    sources?: PairingSourceFilter[]
  }
}

export interface ToFilterParams extends RoFilterParams {
  training: {
    courseTypes: string[]
    expiryFilter: TrainingExpiryFilter
    priorities: string[]
  }
}

export type FilterParams = PoFilterParams | RoFilterParams | ToFilterParams

export const isPoFilter = (p: FilterParams): p is PoFilterParams => 'flightNos' in p
export const isToFilter = (p: FilterParams): p is ToFilterParams => 'training' in p
export const isRoFilter = (p: FilterParams): p is RoFilterParams => !isPoFilter(p) && !isToFilter(p)

/** Lightweight row used in the scenario list */
export interface ScenarioItem {
  id: number
  /** Display name from workset.name */
  name: string
  fileType: ScenarioType
  status: ScenarioStatus
  strDtLoc: string   // 'YYYY-MM-DD'
  endDtLoc: string   // 'YYYY-MM-DD'
  /** From workset.division */
  division: string
  optimizedCount: number
  leadinLive: 0 | 1
  updatedBy: string | null
  updatedByName?: string | null
  updatedAt: string    // ISO datetime
}

/** Full detail returned by GET /api/scenario/:id */
export interface ScenarioDetail extends ScenarioItem {
  worksetId: number | null
  version: number | null
  /** Workset id for the rule set. Default 103 = PBS Solver Ruleset. */
  rulesetId: number | null
  pairingScenarioId: number | null
  filterParams: FilterParams | null
  filePaths?: ScenarioVersion[]
  comments: string | null
  createdBy: string | null
  createdAt: string
  /** Local-only parameter draft, submitted through the Scenario Save action. */
  algorithmParameters?: ScenarioParameterSaveRequest['items']
}

export interface ScenarioVersion {
  version: string
  taskId: string | null
  status: string | null
  archivePath: string | null
  filePath: string | null
  inputPath: string | null
  fileSize: number | null
  checksum: string | null
  executedBy: string | null
  executedAt: string | null
  fileTimestamp: string | null
  isCurrent: boolean
  hasDifferences: boolean
}

export interface ScenarioVersionDiffItem {
  path: string
  current: unknown
  version: unknown
}

export interface ScenarioVersionDiff {
  algorithmParameters: ScenarioVersionDiffItem[]
  ruleParameters: ScenarioVersionDiffItem[]
}

export interface ScenarioVersionListResponse {
  items: ScenarioVersion[]
}

/** A single thread message in a scenario's Notes (stored in scenario_result, type='notes'). */
export interface ScenarioNoteMessage {
  id: string
  author: string
  text: string
  at: string
  editedAt: string | null
  replyTo: string | null
}

export interface ScenarioNoteListResponse {
  items: ScenarioNoteMessage[]
}

export interface ScenarioKpi {
  id: number
  scenarioId: number
  kpiNames: string
  kpiValues: string
  description: string | null
  idx: number | null
  type: 'UTILIZATION' | 'COST' | 'FAIRNESS' | null
}

export type ScenarioResultRow = Record<string, unknown>

export interface ScenarioResults {
  kpi: ScenarioKpi[]
  creditHours: ScenarioResultRow[]
  uncovered: ScenarioResultRow[]
  distribution: unknown
  rawResult: unknown | null
}

export type ScenarioRunPhase =
  | 'starting'
  | 'extracting_input'
  | 'solving'
  | 'producing_result'
  | 'loading_roster'
  | 'done'
  | 'failed'

export interface ScenarioRunProgress {
  scenarioId: number
  taskId: string | null
  status: ScenarioStatus
  phase: ScenarioRunPhase
  percent: number
  stageLabel: string
  detail: string | null
  stageIndex: number | null
  stageTotal: number | null
  stepIndex: number | null
  stepTotal: number | null
  elapsedSec: number | null
  progressAgeSec: number | null
  error: string | null
}

export interface ScenarioListQuery {
  page: number
  pageSize: number
  search?: string
  /** Deprecated: use search for broad id/name/user matching. */
  name?: string
  fileType?: ScenarioType | ''
  status?: ScenarioStatus | ''
}

export interface ScenarioListResponse {
  items: ScenarioItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type ScenarioRunHealthOverall = 'healthy' | 'unhealthy'
export type ScenarioRunServiceStatus = 'healthy' | 'unhealthy' | 'unreachable'
export type ScenarioRunServiceKey = 'engine' | 'pbs'

export interface ScenarioRunServiceHealth {
  key: ScenarioRunServiceKey
  label: string
  healthy: boolean
  status: ScenarioRunServiceStatus
  detail: string
  latencyMs: number | null
}

export interface ScenarioRunHealth {
  overall: ScenarioRunHealthOverall
  checkedAt: string
  services: ScenarioRunServiceHealth[]
}

export type ScenarioParameterType = 'OBJ' | 'LIST'

export interface ScenarioParameterItem {
  code: string
  type: ScenarioParameterType
  description: string | null
  idx: number | null
  schema: Record<string, unknown>
  defaultValue: unknown
  value: unknown
  hasScenarioValue: boolean
}

export interface ScenarioParameterResponse {
  items: ScenarioParameterItem[]
  summary: {
    templateCount: number
    configuredCount: number
  }
}

export interface ScenarioParameterSaveRequest {
  items: {
    code: string
    value: unknown
  }[]
}

export interface CreateScenarioInput {
  name: string
  fileType: ScenarioType
  strDtLoc: string
  endDtLoc: string
  leadinLive: 0 | 1
  /** Written to workset.division */
  division?: string | null
  worksetId?: number | null
  rulesetId?: number | null
  pairingScenarioId?: number | null
  filterParams?: FilterParams | null
  comments?: string | null
}

export type UpdateScenarioInput = Partial<CreateScenarioInput> & {
  algorithmParameters?: ScenarioParameterSaveRequest['items']
}

export interface RosterAssignment {
  kind: 'FLYING' | 'GROUND'
  crewId: string
  pairingId: number | null
  source: 'PA' | 'MA' | 'CR'
  rosterIds: number[]
  pairingLabel: string | null
  base: string
  assignmentGroup: string
  assignment: string
  division: string
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  status: 'PRE_ASSIGN' | 'PENDING' | 'PUBLISHED' | 'EXCEPTION'
  published: boolean
  publishable: boolean
}
