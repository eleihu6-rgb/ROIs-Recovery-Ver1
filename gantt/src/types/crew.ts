/** Crew member from GET /api/crew list */

/** Crew qualification summary for rule checking */
export interface CrewQualSummary {
  crewId: string
  division: string
  rank: string
  fleetQuals: string[]
  airportQuals: string[]
}

export interface Crew {
  id: number
  crewId: string
  firstName: string
  middleName: string | null
  lastName: string
  preferredName: string | null
  gender: string
  division: string
  filiale: string
  status: number
  remarks: string | null
  /** Crew seniority (numeric(10,2) returned as string); present in slim list response. */
  seniorityNum: string | null

  /** Qualifications loaded inline with list response */
  quals?: CrewQualSummary

  /** P1-3 slim 模式当前生效值（view=gantt-panel；首屏即可显示，无需历史数组） */
  panelRank?: string | null
  panelBase?: string | null
  panelFleets?: string[]

  /** History arrays loaded inline with list response（slim 模式下缺省，首屏后台再拉） */
  ranks?:  CrewRankRecord[]
  bases?:  CrewBaseRecord[]
  fleets?: CrewFleetRecord[]
  /** Full history inlined in the non-slim list response (CrewInfo reads these locally). */
  qualifications?: CrewQualificationRecord[]
  certifications?: CrewCertificateRecord[]
  teams?: CrewTeamRecord[]
}

/** Manday stats for a crew member (from cc_am or fd monthly tables) */
export interface CrewStats {
  crewId: string
  ybh:   number  // Year Block Hours (minutes)
  mbh:   number  // Month Block Hours (minutes)
  mcred: number  // Month Credit
  yal:   number  // Year Annual Leave (days)
  mal:   number  // Month Annual Leave (days)
  ydo:   number  // Year Day Off (days)
  mdo:   number  // Month Day Off (days)
}

/** Current effective history record */
export interface CrewRankRecord {
  id: number
  crewId: string
  rank: string
  effDt: string
  expDt: string | null
}

export interface CrewBaseRecord {
  id: number
  crewId: string
  base: string
  effDt: string
  expDt: string | null
}

export interface CrewFleetRecord {
  id: number
  crewId: string
  fleetSpecific: string
  effDt: string
  expDt: string | null
}

export interface CrewQualificationRecord {
  id: number
  crewId: string
  qualification: string
  effDt: string
  renewedDt: string | null
  expDt: string | null
  fleetSpecific: string | null
  acType: string | null
  rank: string | null
  position: string | null
  isValid: number
  remarks: string | null
  interfaceCrewQualId: string | null
  airport: string | null
  interfaceQualificationId: string | null
  remarkDetails: string | null
  bases: string | null
  ranks: string | null
  fleets: string | null
  teams: string | null
  nextPlannedDate: string | null
  displayFlag: number
  status: string | null
  interfaceCrewRecurrentId: string | null
  projectDate: string | null
  recordStatus: string | null
  baseMonth: string | null
}

export interface CrewTeamRecord {
  id: number
  crewId: string
  team: string
  effDt: string
  expDt: string | null
  isValid: number
  remarks: string | null
  source: string | null
  teamTaskId: string | null
}

export interface CrewCertificateRecord {
  id: number
  crewId: string
  certificate: string
  certificateNo: string | null
  effDt: string
  invalidDt: string | null
  expDt: string | null
  tmpIssueCountry: string | null
  tmpIssueAuthority: string | null
  referenceNo: string | null
  referenceId: number | null
  isValid: number
  remarks: string | null
  interfaceCrewCertId: string | null
  interfaceCertId: string | null
  firstName: string | null
  middleName: string | null
  lastName: string | null
  isPrimary: number | null
  nationality: string | null
  surname: string | null
  titleName: string | null
  givenName: string | null
}

export interface CrewStatusRecord {
  id: number
  crewId: string
  status: string
  effDt: string
  expDt: string | null
}

/** Crew detail from GET /api/crew/:id/detail */
export interface CrewDetail extends Crew {
  birthday: string | null
  emplDt: string
  retireDt: string | null
  termDt: string | null
  seniorityNum: string | null
  nationality: string | null
  tel: string | null
  emailAddr: string | null
  currentRank: CrewRankRecord | null
  currentBase: CrewBaseRecord | null
  currentFleet: CrewFleetRecord | null
  currentStatus: CrewStatusRecord | null
}

export interface CrewInfo {
  crew: Crew
  ranks: CrewRankRecord[]
  bases: CrewBaseRecord[]
  fleets: CrewFleetRecord[]
  qualifications: CrewQualificationRecord[]
  certifications: CrewCertificateRecord[]
  teams: CrewTeamRecord[]
}

/** Crew list API response (paginated) */
export interface CrewListResponse {
  items: Crew[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Crew list query filters */
export interface CrewListFilters {
  division?: string
  rank?: string
  base?: string
  fleet?: string
  status?: string
  search?: string
  sortBy?: 'crew_id' | 'name' | 'rank' | 'base'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  /** Global filter: multiple divisions (OR). */
  divisions?: string[]
  /** Global filter: multiple bases (OR), checked against date range validity. */
  bases?: string[]
  /** Global filter: multiple ranks (OR), checked against date range validity. */
  ranks?: string[]
  /** Global filter: multiple fleets (OR), checked against date range validity. */
  fleets?: string[]
  /** Start of Gantt date range for validity checks (YYYY-MM-DD). */
  dateRangeStart?: string
  /** End of Gantt date range for validity checks (YYYY-MM-DD). */
  dateRangeEnd?: string
  /** Hydrate a specific set of crew by ID (exact match). Used by Find Crew. */
  crewIds?: string[]
}

/** Crew filter params for search */
export interface CrewFilters {
  empCode?: string // crewId ILIKE search
  name?: string // firstName/lastName/preferredName ILIKE
  rank?: string // exact match
  base?: string // exact match
  fleet?: string // exact match
}

/** Query session for crew */
export interface CrewQuerySession {
  id: number
  filters: CrewFilters
  page: number
  total: number
  exhausted: boolean
}

/** Crew item with session tags for append mode */
export interface CrewItem {
  crew: Crew
  sessionTags: number[]
}
