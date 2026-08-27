/** Flight record from GET /api/flight */
export interface Flight {
  id: number
  airline: string
  fltDt: string
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  actDepDtUtc: string
  actArvDtUtc: string
  actDepArp: string
  actArvArp: string
  flightFlag: string
  blkMin: number
  fleet: string
  register: string | null
  fltType: string
  fltSts: string | null
  isDeleted: number
  isCancelled: boolean
}

/** Flight item as displayed in the Flight Pane (grouped by registration) */
export interface FlightItem {
  registration: string
  fleet: string
  flights: Flight[]
  /** true when grouped by fleet (no aircraft registration available) */
  isFleetGrouped?: boolean
  /** Session tags for append mode (which search sessions include this item) */
  sessionTags: number[]
}

/** Composition status for a flight in the Flight Pane */
export type FlightCompositionStatus = 'full' | 'partial' | 'cancelled'

/** Flight list query params */
export interface FlightListQuery {
  startDate: string
  endDate: string
  depArp?: string
  arvArp?: string
  fltNum?: string
  fleet?: string
  status?: string
  page?: number
  pageSize?: number
}

/** Flight list response (grouped FlightItem) */
export interface FlightListResponse {
  items: FlightItem[]
  /** RegNo row count after grouping / bin-pack (pagination). */
  total: number
  /** Single-leg flight count in the query (pre-group). */
  flightTotal?: number
}

/** Flight filter params for search */
export interface FlightFilters {
  fltNum?: string // ILIKE search
  depArp?: string // exact match
  arvArp?: string // exact match
  fleet?: string // exact match
  status?: string // exact match
}

/** Query session for flight */
export interface FlightQuerySession {
  id: number
  filters: FlightFilters
  page: number
  total: number
  exhausted: boolean
}

/** Crew assignment item for flight detail modal */
export interface FlightCrewItem {
  seqOrder: number
  crewId: string
  crewName: string
  /** Home base effective on the flight's Flight Date; null when unknown. */
  base: string | null
  /** Crew seniority (numeric(10,2) as string); lower = more senior. Null when unknown. */
  seniorityNum: string | null
  crewRank: string
  actingRank: string
  label: string
  source: 'SYSTEM' | 'IMPORT' | 'MANUAL'
  mbh: string
  mfdp: string | null
}

/** Composition counts for flight */
export interface FlightCompositionCounts {
  plan: number
  actual: number
}

export type FlightComposition = Record<string, FlightCompositionCounts>

/** Response of POST /api/flight/compositions: fltId → per-rank plan/actual. */
export type FlightCompositionsResponse = Record<number, FlightComposition>

/** Flight crew API response */
export interface FlightCrewResponse {
  items: FlightCrewItem[]
  composition: FlightComposition
  status: 'full' | 'partial' | 'cancelled'
}

/** Distinct ids of pairings that use a flight via their segments (GET /api/flight/:id/pairings) */
export interface FlightPairingsResponse {
  pairingIds: number[]
}

/** Per-flight pairing & crew count for the Flight Navi table. */
export interface FlightNaviCount {
  fltId: number
  pairingCount: number
  crewCount: number
}

/** Response of GET /api/flight/navi-counts. */
export interface FlightNaviCountsResponse {
  counts: FlightNaviCount[]
}
