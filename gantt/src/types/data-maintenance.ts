export type DataRootId = 'basic' | 'crew' | 'metadata'

export type DataPageId =
  | 'basic.org-base'
  | 'basic.rank'
  | 'basic.fleet-aircraft'
  | 'basic.location-route'
  | 'basic.assignment'
  | 'basic.qualification'
  | 'basic.composition'
  | 'basic.roster-period'
  | 'basic.config-dictionary'
  | 'basic.query'
  | 'basic.holiday'
  | 'crew.master'
  | 'crew.workload-summary'
  | 'metadata.live'
  | 'metadata.scenario'

export type DataEntityId =
  | 'filiale' | 'base' | 'department' | 'division' | 'division_construction' | 'team'
  | 'rank' | 'rank_acting' | 'rank_position'
  | 'fleet' | 'aircraft'
  | 'airport' | 'route' | 'hotel'
  | 'assignment' | 'assignment_group' | 'assignment_group_map'
  | 'qualification' | 'qualification_projection' | 'certificate' | 'language' | 'port_qual_reqmnt'
  | 'composition' | 'composition_rank' | 'composition_load'
  | 'roster_period' | 'roster_period_config'
  | 'dictionary' | 'attribute' | 'live_config' | 'severity' | 'pane_header'
  | 'query_criteria' | 'sort_criteria' | 'user_query' | 'query'
  | 'holiday'
  | 'crew' | 'crew_base' | 'crew_rank' | 'crew_fleet' | 'crew_qualification' | 'crew_team'
  | 'crew_status' | 'crew_certificate' | 'crew_license' | 'crew_lic_instructor' | 'crew_language'
  | 'crew_entitlement' | 'crew_memo' | 'crew_profile' | 'crew_seniority' | 'crew_kpi_adjust'

export interface DataColumnConfig {
  key: string
  dbField: string
  label: string
  type: 'text' | 'number' | 'date' | 'datetime' | 'select' | 'multi-code' | 'boolean'
  inputKind?: 'text' | 'integer' | 'decimal' | 'percentRatio' | 'boolean' | 'date' | 'datetime' | 'time' | 'select' | 'colorHex'
  required?: boolean
  maxLength?: number
  min?: number
  max?: number
  step?: number
  placeholder?: string
  helpText?: string
  pattern?: string
  nullable?: boolean
  referenceEntity?: DataEntityId
  readonly?: boolean
  /** Cell alignment override. Numeric/date/datetime columns default to right; text defaults to left. */
  align?: 'left' | 'right'
}

export interface DataFilterField {
  key: string
  label: string
  type: 'text' | 'select'
  options?: { label: string; value: string }[]
}

export interface DataReferenceConfig {
  childField: string
  parentEntity: DataEntityId
  parentField: string
  required: boolean
  parser?: 'single-code' | 'csv-code-list'
}

export interface DataEntityConfig {
  id: DataEntityId
  tableName: string
  pageId: DataPageId
  label: string
  editable: boolean
  primaryKey: 'id'
  businessKey: string[]
  columns: DataColumnConfig[]
  references: DataReferenceConfig[]
  effectiveDate?: {
    effField: 'effDt' | 'eff_dt'
    expField: 'expDt' | 'exp_dt'
    overlapKey: string[]
  }
  creatable?: boolean
  deletable?: boolean
  filterFields?: DataFilterField[]
  /** Override the default sort column key (defaults to first businessKey). */
  defaultSort?: string
  /** Override rows-per-fetch for large entities (defaults to 500). */
  pageSize?: number
}

export interface DataTableQuery {
  pageId: DataPageId
  entityId?: DataEntityId
  page: number
  pageSize: number
  filters?: Record<string, unknown>
  expiry?: DataExpiryFilter
}

export interface DataExpiryFilter {
  scope: 'all' | 'base' | 'rank' | 'fleet' | 'qualification' | 'team' | 'status' | 'certificate' | 'license' | 'language' | 'entitlement' | 'profile'
  mode: 'current' | 'expired' | 'expiring_in_days' | 'range'
  referenceDate: string
  days?: number
  from?: string
  to?: string
}

export interface DataChange {
  clientChangeId: string
  entityId: DataEntityId
  action: 'create' | 'update' | 'expire' | 'delete'
  rowId?: number
  crewId?: string
  before?: Record<string, unknown>
  after: Record<string, unknown>
}

export interface DataValidationIssue {
  severity: 'error' | 'warning'
  code:
    | 'missing_parent'
    | 'duplicate_key'
    | 'invalid_effective_range'
    | 'overlap_effective_range'
    | 'parent_in_use'
    | 'invalid_value'
  entityId: DataEntityId
  rowId?: number
  clientChangeId?: string
  field?: string
  message: string
  parentEntityId?: DataEntityId
  parentField?: string
  parentValue?: string
}

export interface DataPageRow {
  [key: string]: unknown
}

export interface DataPageResult {
  rows: DataPageRow[]
  total: number
  page: number
  pageSize: number
}
