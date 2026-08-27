/** A single roster entry from roster_flight table */
export interface RosterItem {
  id: number
  crewId: string
  pairingId: number | null
  pairingLabel?: string | null
  pairingInterfaceId?: string | null
  ver: number
  base: string
  depArp?: string | null
  arvArp?: string | null
  label: string | null
  assignmentGroup: string
  assignment: string | null
  role: string | null
  subRole: string | null
  source: string | null
  isRequested: number
  isSwapped: number
  preference: string | null
  comments: string | null
  score: number | null
  workingHour: string | null

  // Scheduled times
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null

  // Flight-specific
  fltId: number | null
  fltDt: string | null
  dutySeq: number | null
  segSeq: number | null
  division: string | null
  flightActingRank: string
  rosterActingRank: string | null
  activeRank: string | null
  position: string | null

  // Credit minutes
  schCreditedMinutes: string | null
  actCreditedMinutes: string | null
  dpMin?: number | null

  // Tags / exceptions
  tagSet: string | null
  exceptionCode: string | null

  // Ground task REST time (minutes). Flight tasks may leave this null; roster rendering
  // falls back to dutyActRestMin/dutySchRestMin from pairing_segment.
  actRestMin?: number | null

  /** From pairing_segment.seg_assignment when known (Live join / Scenario build). */
  segAssignment?: string | null

  // Duty-level fields from pairing_segment (for Segment Mode rendering, null for ground tasks)
  pickupStartUtc?: string | null
  pickupEndUtc?: string | null
  briefStartUtc?: string | null
  briefEndUtc?: string | null
  debriefStartUtc?: string | null
  debriefEndUtc?: string | null
  dropoffStartUtc?: string | null
  dropoffEndUtc?: string | null
  dutySchRestMin?: number | null
  dutyActRestMin?: number | null
  /** Duty-level credited minutes (from pairing_segment; same for every segment of a duty). The
   *  only populated credit source — roster_flight's own credit columns are null in the dataset. */
  dutyActCreditedMinutes?: string | null
  /** Crew-specific Rule 7500 Ref TZ, repeated on every segment row of a duty when loaded. */
  dutyRefTz?: number | null

  // Seniority statistics (pre-calculated)
  ybh: number | null   // Year Block Hours
  mbh: number | null   // Month Block Hours
  yal: number | null   // Year Annual Leave
  mal: number | null   // Month Annual Leave
  ydo: number | null   // Year Day Off
  mdo: number | null   // Month Day Off
  mcred: number | null // Month Credit

  /** True for unsaved/pending Scenario roster items (derived from pendingChanges). Set ONLY
   *  by buildScenarioRosterItems; never set for Live items so the shared renderer can style
   *  pending Scenario edits without marking committed Live manual (MA) adds. */
  isPending?: boolean
}

/** Input for creating a new roster entry */
export interface CreateRosterInput {
  crewId: string
  pairingId?: number | null
  base: string
  label?: string
  assignmentGroup: string
  assignment?: string
  role?: string
  flightActingRank: string
  schStrDtUtc: string
  schEndDtUtc: string
  fltId?: number
  fltDt?: string
  comments?: string
}

/** Input for batch-creating ground tasks for multiple crew members */
export interface CreateGroundTaskInput {
  crewIds: string[]
  assignment: string
  depArp: string
  arvArp: string
  startDtUtc: string
  endDtUtc: string
  comments?: string
  /** Planner-entered credited minutes. If omitted, fixedCreditMin remains the fallback. */
  creditMin?: number | null
  /** Client-side draft display hint; persisted server-side credit is derived from assignment. */
  fixedCreditMin?: number | null
  dpMin?: number | null
}

/** Input for updating a roster entry */
export interface UpdateRosterInput {
  label?: string
  base?: string
  depArp?: string | null
  arvArp?: string | null
  assignment?: string
  assignmentGroup?: string
  schCreditedMinutes?: string | number | null
  actCreditedMinutes?: string | number | null
  dpMin?: number | null
  actRestMin?: number | null
  role?: string
  schStrDtUtc?: string
  schEndDtUtc?: string
  comments?: string
}

/** Swap tasks request body */
export interface SwapTasksInput {
  taskIdA: number
  taskIdB: number
  username?: string
}

/** Move task request body */
export interface MoveTaskInput {
  taskId: number
  targetCrewId: string
  username?: string
}
