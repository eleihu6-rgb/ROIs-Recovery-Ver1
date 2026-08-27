import type { GanttCapabilities } from '@/components/gantt/source/gantt-pane-source'
import type { CrewRankRecord, CrewBaseRecord } from './crew'

export interface ScenarioGanttCrew {
  crewId: string
  base: string
  division: string
  /** CrewRank / ActiveRank. */
  crewRank?: string
  /** Deprecated compatibility alias for crewRank. */
  rank: string
  /** Date-effective crew rank history (from live crew_rank), for per-task-date resolution. */
  ranks?: CrewRankRecord[]
  /** Date-effective crew base history (from live crew_base), for per-task-date resolution. */
  bases?: CrewBaseRecord[]
  seniorityNum: string | null
  crewName: string | null
}

export interface ScenarioGanttCompositionSlot {
  rank: string
  plan: number
  fill: number
}

export interface ScenarioGanttPairing {
  pairingId: number
  sourcePairingId?: number
  pairingSource?: 'scenario' | 'live'
  pairingLabel: string | null
  interfaceId?: string | null
  base: string
  fleet: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc?: string
  actEndDtUtc?: string
  assignmentGroup: string
  assignment: string
  division: string
  compositions: ScenarioGanttCompositionSlot[]
}

export interface ScenarioGanttAssignment {
  crewId: string
  pairingId: number
  source: 'IMP' | 'PA' | 'MA' | 'CR'
  /** CrewRank / ActiveRank from roster_flight.active_rank. */
  crewRank?: string | null
  /** Pairing-level ActingRank from roster_flight.roster_acting_rank. */
  rosterActingRank?: string | null
  /** Flight-level Acting from roster_flight.flight_acting_rank. */
  flightActingRank?: string | null
  /** Deprecated compatibility alias for rosterActingRank. */
  rank?: string | null
  sourcePairingId?: number
  pairingSource?: 'scenario' | 'live'
}

/** Scenario snapshot of one crew's Rule 7500 Ref TZ for one pairing duty. */
export interface ScenarioGanttDutyRef {
  crewId: string
  pairingId: number
  dutySeq: number
  dutyRefTz: number | null
}

/** One row from the pairing_segment section of input.gz — extended with all fields needed for renderPairingTasks */
export interface ScenarioGanttPairingSegment {
  pairingId: number
  dutySeq: number
  segSeq: number
  fltId: number | null
  fltDt: string | null
  fltNum: string
  airline: string
  depArp: string
  arvArp: string
  segAssignment: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc?: string
  actEndDtUtc?: string
  dutyStrArp: string
  dutyEndArp: string
  dutySchStrDtUtc: string
  dutySchEndDtUtc: string
  dutySchRestMin:         number | null
  dutyActRestMin:         number | null
  dutyActCreditedMinutes: number | null
  /** Compatibility fallback for pairing-level Rule 7500 Ref TZ. */
  dutyRefTz?: number | null
  brief1StartUtc: string
  brief1EndUtc: string
  debrief1StartUtc: string
  debrief1EndUtc: string
  pickup1StartUtc: string
  pickup1EndUtc: string
  dropoff1StartUtc: string
  dropoff1EndUtc: string
}

/** One row from the flight section of input.gz — for Flight Pane aircraft rows */
export interface ScenarioGanttFlight {
  id: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  fleet: string
  register: string | null
}

/** Ground task row from the ROSTER section of output.gz (pairingId=null). */
export interface ScenarioGanttGroundItem {
  crewId: string
  base?: string
  depArp?: string | null
  arvArp?: string | null
  assignmentGroup: string
  assignment: string
  /** Specific display code from Live roster_flight.label (e.g. GDO when assignment is DO). */
  label?: string | null
  schStrDtUtc: string
  schEndDtUtc: string
  actingRank: string
  source: 'IMP' | 'PA' | 'MA' | 'CR'
  actCreditedMinutes?: number
  dpMin?: number
}

export interface ScenarioGanttData {
  scenarioId: number
  scenarioName: string | null
  fileType: 'PO' | 'RO' | 'TO'
  /** Scenario-owned legality workset id; displayed read-only in the Scenario toolbar. */
  rulesetId?: number | null
  /** Scenario-type capabilities (visible panes + edit permissions) — derived server-side (P2). */
  capabilities: GanttCapabilities
  /** Full canvas range — includes lead-in/out days derived from actual pairing data. */
  strDtLoc: string
  endDtLoc: string
  /** Official scenario dates from DB — used for default viewport zoom (excludes lead-in/out). */
  scenarioStrDt: string
  scenarioEndDt: string
  leadinLive: number
  dataSource: 'live-refresh' | 'snapshot' | 'db' | 'seed'
  /** Seed/preview view (DRAFT/FAILED, no loaded roster) — editing disabled. */
  readOnly?: boolean
  crew: ScenarioGanttCrew[]
  pairings: ScenarioGanttPairing[]
  assignments: ScenarioGanttAssignment[]
  pairingSegments: ScenarioGanttPairingSegment[]
  /** Optional crew-specific Rule 7500 refs from the scenario result. */
  rosterDutyRefs?: ScenarioGanttDutyRef[]
  flights: ScenarioGanttFlight[]
  /** Ground tasks from output.gz ROSTER section (source='CR') */
  groundItems: ScenarioGanttGroundItem[]
  /** Per-crew per-month manday stats computed from optimization data. crewId → yearMonth → stats */
  crewStats: Record<string, Record<string, ScenarioMonthStats>>
}

export interface ScenarioMonthStats {
  credit: number      // total credited minutes for the month
  dayOffCount: number // number of DO-assignment days
  alCount: number     // number of VAC-assignment days (FD)
  leaveCount: number  // number of ILL-assignment days (CC)
  /** Optional Live manday KPIs for seed/lead-in scenario views. */
  ybh?: number
  mbh?: number
  mcred?: number
  yal?: number
  mal?: number
  ydo?: number
  mdo?: number
}

/** A pending edit not yet saved to output.gz */
export interface AssignmentPatch {
  op: 'add' | 'remove' | 'reassign'
  crewId: string
  pairingId: number | null
  /** Resolved pairing-composition slot rank for add/reassign; written to roster_acting_rank. */
  rosterActingRank?: string
  toCrewId?: string
  startDtUtc?: string
  endDtUtc?: string
  assignmentGroup?: string
  assignment?: string
}

export interface LockStatus {
  locked: boolean
  owner: string | null
  ttl: number | null
  isOwner: boolean
}
