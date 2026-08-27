/** Composition slot for a rank within a pairing */
export interface CompositionSlot {
  rank: string
  plan: number          // required count
  fill: number          // currently filled count
}

/** Pairing record from GET /api/pairing */
export interface Pairing {
  id: number
  /** Scenario Gantt display id may differ from sourcePairingId when Live and Scenario ids collide. */
  sourcePairingId?: number
  pairingSource?: 'scenario' | 'live'
  pairingLabel: string | null
  filiale: string | null
  division: string
  base: string
  fleet: string
  assignmentGroup: string
  assignment: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  durationDays: number
  tafb: number
  dutyCount: number
  segCount: number
  blockMinutes: number       // total block hours in minutes
  ver: number
  isDeleted: number
  source: string | null
  tags: string | null
  comments: string | null
  pairingDt: string | null   // civil date YYYY-MM-DD the planner used; avoids UTC shift for PM pairings

  // Composition info
  composition: CompositionSlot[]
  isFull: boolean            // true when no rank is short (coverage full or over-staffed)

  /** Segments loaded inline with list response (from backend list JOIN) */
  segments?: PairingSegment[]
}

/** Item as displayed in the Pairing Pane */
export interface PairingItem {
  pairing: Pairing
  flights: PairingFlight[]
  /** Full segment data for Segment Mode rendering */
  segments: PairingSegment[]
  /** Session IDs this item belongs to (for append mode tracking) */
  sessionTags: number[]
}

/** A flight segment within a pairing */
export interface PairingFlight {
  fltId: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
}

/**
 * Pairing segment with full duty info (from backend pairing_segment table)
 *
 * 进退场字段设计说明：
 * - 原设计：每个 Duty 层级支持 3 次进退场
 * - 新设计：保留首次 + 第二次进退场字段，全部可空
 *
 * 业务场景：
 * 1. 正常 Duty：只需一组 Pickup/Brief + Debrief/Dropoff
 * 2. 带休息的 Duty：先签退去酒店，再签回继续工作
 * 3. 大过站：在 Segment 层级单独签到签出
 *
 * 数据赋值规则：
 * - Duty 内第一段 Segment：只赋值 pickup/brief 字段
 * - Duty 内最后一段 Segment：只赋值 debrief/dropoff 字段
 * - 发生第二次签退签到时：double_* 字段全部赋值
 */
export interface PairingSegment {
  id: number
  pairingId: number
  dutySeq: number
  segSeq: number
  fltId: number | null
  fltNum: string
  airline: string
  depArp: string
  arvArp: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  segAssignment: string

  // Duty-level info (redundant, same for all segs in same duty)
  dutyStrArp: string
  dutyEndArp: string
  dutySchStrDtUtc: string
  dutySchEndDtUtc: string
  dutySchRestMin: number | null   // scheduled rest minutes
  dutyActRestMin: number | null   // actual rest minutes
  dutyActCreditedMinutes: string | null  // actual credited minutes for this duty (DB returns as numeric string)
  /** Compatibility fallback for pairing-level Rule 7500 Ref TZ. */
  dutyRefTz?: number | null

  // 首次进退场（可空）
  // 数据赋值规则：Duty内第一段赋值pickup/brief，最后段赋值debrief/dropoff
  pickupStartUtc: string | null
  pickupEndUtc: string | null
  briefAirport: string | null
  briefStartUtc: string | null
  briefEndUtc: string | null
  debriefAirport: string | null
  debriefStartUtc: string | null
  debriefEndUtc: string | null
  dropoffStartUtc: string | null
  dropoffEndUtc: string | null

  // 第二次进退场（可空）
  // 用于：带休息的Duty或大过站场景
  // 发生第二次签退签到时，所有double_*字段赋值
  doublePickupStartUtc: string | null
  doublePickupEndUtc: string | null
  doubleBriefAirport: string | null
  doubleBriefStartUtc: string | null
  doubleBriefEndUtc: string | null
  doubleDebriefAirport: string | null
  doubleDebriefStartUtc: string | null
  doubleDebriefEndUtc: string | null
  doubleDropoffStartUtc: string | null
  doubleDropoffEndUtc: string | null
}

/** Pairing filter params for search */
export interface PairingFilters {
  label?: string // pairingLabel ILIKE search
  fleet?: string // exact match
  base?: string // exact match
  division?: string // exact match (P/C)
  segFltNum?: string // segment.flt_num ILIKE search
  depArp?: string // segment.dep_arp exact match
  isFull?: boolean // full/partial filter
  assignments?: string[] // pairing type — assignment codes, OR match
}

/** Query session for tracking search history */
export interface QuerySession {
  id: number // 1, 2, 3... (append order)
  filters: PairingFilters
  page: number // current page loaded
  total: number // total matching from server
  exhausted: boolean // all pages loaded
}

/** Pairing list query params */
export interface PairingListQuery {
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
  sortBy?: 'schStrDtUtc' | 'pairingLabel' | 'tafb' | 'fleet' | 'base' | 'segCount' | 'durationDays'
  sortOrder?: 'asc' | 'desc'
  /** Response shape: 'summary' skips heavy joins (segments), 'detail' includes them. */
  view?: 'summary' | 'detail'
  // Filter params
  label?: string
  fleet?: string
  base?: string
  division?: string
  segFltNum?: string
  depArp?: string
  isFull?: boolean
  /** Crewing coverage states to keep (open|partial|full). */
  coverage?: string[]
  assignments?: string[]
}

/** Paginated pairing list response */
export interface PairingListResponse {
  items: Pairing[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
