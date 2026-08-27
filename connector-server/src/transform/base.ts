/**
 * TransformPlugin interface
 * Converts between external system formats and ROIS standard formats
 */
export interface TransformPlugin {
  /**
   * Inbound: Convert external format to ROIS standard format
   * @param raw - Raw data from external system
   * @returns Standard format record for ROIS internal use
   */
  toStandard(raw: unknown): StandardRecord

  /**
   * Outbound: Convert ROIS standard format to external format
   * @param record - Standard format record from ROIS
   * @returns External format for the target system
   */
  fromStandard(record: StandardRecord): unknown
}

/**
 * Standard record format - aligned with live-server internal models
 * This is the canonical format for data exchange within ROIS
 */
export interface StandardRecord {
  recordType: 'flight' | 'crew' | 'roster' | 'pairing'
  data: Record<string, unknown>
  metadata?: {
    sourceRef?: string // Source batch/timestamp for deduplication
    externalId?: string // ID in external system
    version?: number // Version for update detection
  }
}

/**
 * Flight standard record structure
 */
export interface StandardFlight {
  flightNo: string
  depDate: string // ISO date
  depAirport: string
  arrAirport: string
  depTime?: string // ISO datetime
  arrTime?: string // ISO datetime
  aircraftType?: string
  acReg?: string
  crewBase?: string
  serviceType?: string // J/F/Y etc
  carrier?: string
}

/**
 * Crew standard record structure
 */
export interface StandardCrew {
  crewCode: string
  crewName?: string
  rank?: string
  base?: string
  fleet?: string
  hireDate?: string
  status?: string // active/leave/etc
}

/**
 * Roster standard record structure
 */
export interface StandardRoster {
  crewCode: string
  rosterDate: string // ISO date
  dutyType: string // FLT/OFD/SBY/DO etc
  pairingId?: string | null // null for ground duties
  flightId?: string
  depTime?: string
  arrTime?: string
  depAirport?: string
  arrAirport?: string
  role?: string // CA/FO etc
}

/**
 * Pairing standard record structure
 */
export interface StandardPairing {
  pairingId: string
  pairingDate: string // ISO date yyyy-MM-dd
  label?: string // route label e.g. "YYZ/KIN/YYZ"
  base?: string // crew base IATA
  fleet?: string
  durationDays?: number
  compositions?: Array<{
    rank: string // CA or FO (normalized)
    planValue: number
  }>
}