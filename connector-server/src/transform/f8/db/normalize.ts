// Shared F8 → ROIS normalization maps for the DB-import transforms.
// Mirrors data-migration/f8/utils.py so the live sync and the one-off
// migration agree on assignment/rank codes.

const RANK_MAP: Record<string, string> = { CAP: 'CA', CP: 'FO', CA: 'CA', FO: 'FO' }

const ASSIGNMENT_MAP: Record<string, string> = {
  FLIGHT: 'FLY',
  DH: 'DHD',
  RESERVE: 'SBY',
  TRAINING: 'GRD',
  TRANSPORT: 'DHD',
}

// rosterGround assignment values from F8 API → roster_ground.assignment code
const ROSTER_GROUND_ASSIGNMENT_MAP: Record<string, string> = {
  UNKNOWN: 'UNK',
  FLIGHT: 'FLY',
  ILLNESS: 'ILL',
  VACATION: 'VAC',
  COMPENSATION: 'COMP',
  TRANSPORT: 'DHD',
  STANDBY: 'SBY',
  STATIONSTANDBY: 'SSB',
  TRAINING: 'GRD',
  SIMULATOR: 'SIM',
  DAYOFF: 'DO',
  SHIFT: 'SFT',
  RESERVE: 'RES',
}

// "Unknown" is intentionally excluded — those records are not imported.
// "Flight" is fetched but routed to roster_flight (single-leg, pairingId=0)
// instead of roster_ground; pairingId>0 Flight records are ignored.
export const ALL_ROSTER_GROUND_ASSIGNMENTS: readonly string[] = [
  'Flight', 'Illness', 'Vacation', 'Compensation',
  'Transport', 'StandBy', 'StationStandBy', 'Training',
  'Simulator', 'DayOff', 'Shift', 'Reserve',
]

export const normalizeRank = (rank: string): string =>
  RANK_MAP[rank.toUpperCase()] ?? rank

export const normalizeAssignment = (assignment: string): string =>
  ASSIGNMENT_MAP[assignment.toUpperCase()] ?? assignment

export const normalizeRosterGroundAssignment = (assignment: string): string =>
  ROSTER_GROUND_ASSIGNMENT_MAP[assignment.toUpperCase()] ?? assignment
