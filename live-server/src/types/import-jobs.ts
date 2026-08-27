// connector-server/src/types/import-jobs.ts

export interface ImportJobMeta {
  syncId: string
  filiale: string
  syncRangeDt: [string, string] // [startDt, endDt] YYYY-MM-DD
  importId?: string
}

// ---- Flight ----
export interface FlightImportJob extends ImportJobMeta {
  records: FlightImportRecord[]
}
export interface FlightImportRecord {
  interfaceFltId: string
  fltNum: string
  airline: string
  fltDt: string          // YYYY-MM-DD
  depArp: string
  arvArp: string
  fleet: string
  tailNum: string | null
  schStrDtUtc: string    // ISO datetime string
  schEndDtUtc: string
  actStrDtUtc: string    // defaults to schStrDtUtc if no actual
  actEndDtUtc: string
  estStrDtUtc: string | null   // estimated departure (etd)
  estEndDtUtc: string | null   // estimated arrival (eta)
  actTakeOffUtc: string | null // actual take-off (toff)
  actTouchDownUtc: string | null // actual touch-down (tdwn)
  segType: string | null       // stc → seg_type
  deviceCode: string | null    // divCode → device_code
  blkMin: number
  fltType: string        // 'PAX' default
  fltSts: string | null
}

// ---- Crew ----
export interface CrewImportJob extends ImportJobMeta {
  records: CrewImportRecord[]
}
export interface CrewBaseRecord {
  base: string
  effDt: string | null
  expDt: string | null
  isPrimary: boolean
}
export interface CrewRankRecord {
  rank: string           // normalized (CAP→CA, CP→FO)
  effDt: string | null
  expDt: string | null
}
export interface CrewCertRecord {
  certificate: string
  effDt: string | null   // defaults to 1970-01-01 when API omits it
  expDt: string | null
  isValid: boolean
  firstName: string
  middleName: string
  lastName: string
}
export interface CrewFleetRecord {
  fleet: string          // uppercased
  effDt: string | null
  expDt: string | null
}
export interface CrewQualRecord {
  qualification: string
  effDt: string | null
  expDt: string | null
  isValid: boolean
}
export interface CrewTeamRecord {
  team: string
  effDt: string | null
  expDt: string | null
  isValid: boolean
  remarks: string
}
export interface CrewImportRecord {
  crewId: string         // String(F8 crewId)
  interfaceId: string
  firstName: string
  middleName: string
  lastName: string
  preferredName: string
  gender: string         // 'M' | 'F' | 'U'
  birthday: string | null
  seniorityNum: number | null
  homeAddress: string
  tel: string
  email: string
  contractType: string
  emplDt: string | null  // joinDate
  division: string       // 'P' | 'C' (from latest rank)
  filiale: string
  bases: CrewBaseRecord[]
  ranks: CrewRankRecord[]        // overlap-filtered + sorted; feeds crew_rank + crew_status
  certificates: CrewCertRecord[]
  fleets: CrewFleetRecord[]
  qualifications: CrewQualRecord[]
  teams: CrewTeamRecord[]
}

// ---- Pairing ----
export interface PairingImportJob extends ImportJobMeta {
  pairings: PairingImportRecord[]
  purgeStalePairings?: boolean
  snapshotPairingInterfaceIds?: string[]
}
export interface PairingImportRecord {
  interfaceId: string
  pairingLabel: string | null
  base: string
  fleet: string
  division: string
  assignmentGroup: string
  assignment: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  durationDays: number
  tafb: number
  comments: string
  perDiemMins: number
  perDiemMinsAdjustment: number
  fmLhPerDiemMins: number
  wpMins: number
  wpMinsAdjustment: number
  source: string         // 'F8'
  duties: PairingDutyRecord[]
  compositions: Array<{ rank: string; plan: number }>
}
export interface PairingDutyRecord {
  dutySeq: number
  strArp: string
  endArp: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  creditedMinutes: number
  // duty minute stats (mapped to pairing_segment.duty_* columns)
  fdpDiscretionMin: number
  maxFdpMin: number
  minRestMin: number
  actRestMin: number
  layoverNits: number
  planFlightMin: number
  planFdpMin: number
  actFlightMin: number
  actFdpMin: number
  actualDutyMinutes: number
  briefMin: number
  debriefMin: number
  comments: string
  pickupStartUtc?: string
  pickupEndUtc?: string
  briefStartUtc?: string
  briefEndUtc?: string
  debriefStartUtc?: string
  debriefEndUtc?: string
  dropoffStartUtc?: string
  dropoffEndUtc?: string
  doublePickupStartUtc?: string
  doublePickupEndUtc?: string
  doubleBriefStartUtc?: string
  doubleBriefEndUtc?: string
  doubleDebriefStartUtc?: string
  doubleDebriefEndUtc?: string
  doubleDropoffStartUtc?: string
  doubleDropoffEndUtc?: string
  segments: PairingSegmentRecord[]
}
export interface PairingSegmentRecord {
  segSeq: number
  interfaceFltId: string | null
  fltNum: string
  airline: string
  depArp: string
  arvArp: string
  fleet: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  segAssignment: string  // 'FLY' | 'DH' | 'SBY' | 'SIM'
  isLongTransit: number
  fltDt: string | null
}

// ---- Roster ----
export interface RosterImportJob extends ImportJobMeta {
  records: RosterFlightRecord[]
  filteredCount: number
  rejectionFile: string | null
  /** When rosterGround is in the same sync batch, its final worker owns Manday recompute. */
  deferMandayRecompute?: boolean
}
export interface RosterFlightRecord {
  crewId: string
  pairingInterfaceId: string
  actingRank: string
  activeRank: string
  division: string
  seqOrder: number
  assignment: string       // 'FLY' | 'DH' | 'SBY'
  assignmentGroup: string
  base: string
  source: string           // 'F8'
}

// ---- Roster Ground ----
// Non-Flight assignments become roster_flight rows with pairing_id = NULL.
// Single-leg Flight records (pairingId=0) are materialized into a synthetic
// pairing + segment + roster_flight by the live-server worker.
export interface RosterGroundImportJob extends ImportJobMeta {
  groundRecords: RosterGroundRecord[]
  singleLegRecords: SingleLegFlightRecord[]
  filteredCount: number
  rejectionFile: string | null
}
export interface RosterGroundRecord {
  crewId: string
  assignment: string       // normalized: ILL/VAC/COMP/SBY/...
  assignmentGroup: string
  location: string
  depArp: string           // startLocation from API
  arvArp: string           // endLocation from API
  strDtUtc: string
  endDtUtc: string
  division: string
  label: string
  role: string
  credit: number           // act_credited_minutes (minutes)
  source: string           // 'F8'
}
export interface SingleLegFlightRecord {
  crewId: string
  airline: string         // 2-char IATA, derived from F8 label prefix (e.g. "F8")
  interfaceFltId: string   // F8 fltId — matches flight.interface_flt_id
  label: string            // flight number with airline prefix stripped (e.g. "001")
  strDtUtc: string         // scheduled departure (UTC)
  endTimeUtc: string       // scheduled arrival (UTC) — for flight creation
  checkInUtc: string       // brief start time; used as pairing sch_str_dt_utc
  dutyEndUtc: string       // duty end time; used as pairing sch_end_dt_utc
  actualDepartureTime: string  // HH:MM actual dep — reference when creating flight
  actualArrivalTime: string    // HH:MM actual arv — reference when creating flight
  startLocation: string    // dep_arp for flight creation
  endLocation: string      // arv_arp for flight creation
  division: string
  credit: number           // rosterGround Flight credit minutes
  source: string           // 'F8'
}

// ---- Manday (FD 飞行员 & CC/AM 客舱) ----
export interface MandayImportJob extends ImportJobMeta {
  tableType: 'fd' | 'cc_am'
  records: MandayFdRecord[] | MandayCcAmRecord[]
}

export interface MandayFdRecord {
  crewId: string
  crewBaseDt: string
  ft?: number; augumentFt?: number; doubleFt?: number
  blh?: number; augumentBlh?: number; doubleBlh?: number
  fdp?: number; dp?: number; nightDp?: number
  travel?: number; credit?: number; fatigue?: number
  isLeave?: number; isDayOff?: number; standby?: number
  actTakeOffs?: number; actLandings?: number; ground?: number
  actingRank?: string | null; fleet?: string | null
  perDiem?: number; normalWp?: number; extendWp?: number
  csb?: number; hsb?: number; asb?: number; isAl?: number
  updowns?: number; cat2Updowns?: number; expBlh?: number; quarantine?: number
  custData1?: number | null; custData2?: number | null
  highPlateau?: number; operatingFleets?: string | null; operatingAirports?: string | null
  takeoff?: number; landing?: number; isPosition?: number; workingHour?: number | null
  pncCredit?: number | null; simCredit?: number | null; alCredit?: number | null
  olCredit?: number | null; freighterCredit?: number | null
  layoverDay?: number | null; lhPerDiem?: number | null; sbyDp?: number; dhdDp?: number
  fleetTakeoff?: string | null; fleetLanding?: string | null
  nightTakeoff?: string | null; nightLanding?: string | null
  schCredit?: number | null; schPerDiem?: number | null; schLhPerDiem?: number | null
  schPncCredit?: number | null; schSimCredit?: number | null
  schAlCredit?: number | null; schOlCredit?: number | null; schFreighterCredit?: number | null
  attributes?: string | null
  intBlh?: number | null; fltNum?: number | null
  crossTzDutyCount?: number | null; layoverTimes?: number | null; layoverDuration?: number | null
}

export interface MandayCcAmRecord {
  crewId: string
  crewBaseDt: string
  ft?: number; blh?: number; fdp?: number; dp?: number; custDp?: number; nightDp?: number
  travel?: number; credit?: number; fatigue?: number
  isLeave?: number; isDayOff?: number; standby?: number; ground?: number
  perDiem?: number; normalWp?: number; extendWp?: number
  csb?: number; hsb?: number; asb?: number; isAl?: number; quarantine?: number
  custData1?: number | null; custData2?: number | null
  highPlateau?: number; operatingFleets?: string | null; operatingAirports?: string | null
  workingHour?: number
  pncCredit?: number | null; simCredit?: number | null; alCredit?: number | null
  olCredit?: number | null; freighterCredit?: number | null
  layoverDay?: number | null; lhPerDiem?: number | null; sbyDp?: number; dhdDp?: number
  attributes?: string | null
  intBlh?: number | null; fltNum?: number | null
  crossTzDutyCount?: number | null; layoverTimes?: number | null; layoverDuration?: number | null
}
