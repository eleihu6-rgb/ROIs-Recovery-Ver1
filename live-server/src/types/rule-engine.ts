// Shared rule-engine data contract (PairingInput / CrewInfo / CheckResult etc.).
// Consumed by the rule-check data/result services; the rule engine itself is invoked
// as direct Rust process calls (see live-server/scripts/legality-recheck-core.mjs).

export interface FlightSegment {
  fltNo: string
  depPort: string
  arrPort: string
  stdUtc: Date
  staUtc: Date
  blockMinutes: number
  isNight: boolean
  fleetCode?: string | null
  isDeadhead?: boolean
}

export interface DutyPeriod {
  dutySeq: number
  reportUtc: Date
  releaseUtc: Date
  segments: FlightSegment[]
  restAfterMinutes?: number
  reportLocal?: string
  baseUtcOffset?: number
}

export interface PairingInput {
  pairingId: number
  crewBase: string
  duties: DutyPeriod[]
  seatPosition?: string | null
}

export interface CrewInfo {
  crewId: string
  division: string
  rank: string
  fleetQuals: string[]
  airportQuals: string[]
  recentFlightHours: {
    last24h: number
    last7d: number
    last28d: number
    last90d: number
    last365d: number
  }
  recentLandings90d?: number
  totalHours?: number
  dateOfBirth?: string | null
}

export interface CheckInput {
  ruleGroupCode: string
  pairing: PairingInput
  crew?: CrewInfo
}

export interface GroundDutyInput {
  assignment: string         // 'DO' | 'VAC' | 'ILL' | 'SBY' | 'GRD' | 'DHD' | 'SIM' | 'SFT'
  assignmentGroup: string    // always 'GRD'
  startUtc: Date
  endUtc: Date
  isFreeFromDuty: boolean    // true for DO/VAC/ILL; false for SBY/GRD/DHD/SIM/SFT
}

export interface RosterInput {
  ruleGroupCode: string
  crew: CrewInfo
  pairings: PairingInput[]
  periodStart: Date
  periodEnd: Date
  groundDuties?: GroundDutyInput[]
}

export interface CalcResult {
  ruleCode: string
  ruleName: string
  value: number
  unit: string
}

export interface CheckResult {
  ruleCode: string
  ruleName: string
  passed: boolean
  severity: number
  actualValue: number
  limitValue: number
  unit: string
  message: string
}

export interface EngineResult {
  checkResults: CheckResult[]
  calcResults: CalcResult[]
  passedAll: boolean
  highestSeverity: number
}

export interface RosterEngineResult {
  pairingResults: Map<number, EngineResult>
  rosterViolations: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}
