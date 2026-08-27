/** Composition Management Types */
export interface Composition {
  id: number
  filiale: string | null
  division: string
  name: string
  nameDesc: string | null
  displayOrder: number
  hierarchy: number | null
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

export interface CompositionRank {
  id: number
  compId: number
  rank: string
  planValue: number // always set when row exists; null cell = no row in DB
  planValueExtra: number
  options: number // option index, 1-based
}

export interface CompositionLoad {
  id: number
  filiale: string
  division: string
  sequence: number
  fltNum: string | null
  fleet: string | null
  flightFlag: string | null
  fltType: string | null
  segType: string | null
  routeId: number | null
  loadFactor: string | null
  effDt: string
  expDt: string | null
  dow: string
  description: string | null
  compId: number | null
  subFleet: string | null
  flightAssignment: string | null
  serviceType: string | null
  paxNum: string | null
  restFacility: number | null
  departureTime: string | null
  arrivalTime: string | null
  optionId: number | null
  blhLow: string | null
  blhUpper: string | null
}

export type CreateCompositionData = {
  filiale?: string | null
  division: string
  name: string
  nameDesc?: string | null
  displayOrder: number
  hierarchy?: number | null
}

export type CreateLoadData = Omit<CompositionLoad, 'id' | 'filiale'> & {
  filiale?: string | null // optional - backend uses DB default if not provided
}

export type CreateRankData = {
  compId: number
  rank: string
  planValue: number
  planValueExtra: number
  options: number
}