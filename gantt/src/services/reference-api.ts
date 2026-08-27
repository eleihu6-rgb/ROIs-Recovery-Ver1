import { api } from './api'

export interface BaseOption {
  id: number
  base: string
  name: string | null
  filiale: string
  isPrimeDisplayBase: number
  displayOrder: number
}

export interface RankOption {
  id: number
  rank: string
  division: string
  description: string | null
  displayOrder: number
  isCrewRank: number
}

export interface FleetOption {
  id: number
  fleet: string
  description: string | null
  fleetGrp: string
  acType: string
  displayOrder: number
}

/** A pairing "type" option = a distinct assignment code present on pairings. */
export interface PairingTypeOption {
  assignment: string
  description: string | null
}

export interface PairingAssignmentGroupOption {
  assignmentGroup: string
  description: string | null
}

/** Row from GET /api/division (division table). */
export interface DivisionOption {
  id: number
  division: string
  description: string | null
}

export const referenceApi = {
  async listBases(): Promise<BaseOption[]> {
    return (api.get('/api/base') as Promise<BaseOption[]>) ?? []
  },

  async listRanks(): Promise<RankOption[]> {
    return (api.get('/api/rank') as Promise<RankOption[]>) ?? []
  },

  async listFleets(): Promise<FleetOption[]> {
    return (api.get('/api/fleet') as Promise<FleetOption[]>) ?? []
  },

  /** Pairing type options — distinct assignment codes actually present on pairings. */
  async listPairingTypes(): Promise<PairingTypeOption[]> {
    return (api.get('/api/pairing/types') as Promise<PairingTypeOption[]>) ?? []
  },

  /** Distinct live pairing assignment_group values for Scenario Pairing scope Type. */
  async listPairingAssignmentGroups(): Promise<PairingAssignmentGroupOption[]> {
    return (api.get('/api/pairing/assignment-groups') as Promise<PairingAssignmentGroupOption[]>) ?? []
  },

  /** Division codes from the division master table (not dictionary DIVISION). */
  async listDivisions(): Promise<DivisionOption[]> {
    return (api.get('/api/division') as Promise<DivisionOption[]>) ?? []
  },
}
