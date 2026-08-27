import { api } from './api'

export interface BidGroupDetail {
  tier: number
  groupSeq: number
  actionId: number | null
  propertyName: string | null
  operator: string | null
  paramA: string | null
  paramB: string | null
  limitN: number | null
  allOrNothing: number | null
  minimumN: number | null
}

export interface CrewBidTypeRow {
  bidType: string | null
  groupCount: number
  appliedTiers: number[]
  groupDetails: BidGroupDetail[]
}

export interface CrewBidCrewRow {
  crewId: string
  crewName: string
  seniorityNum: number | null
  base: string | null
  rank: string | null
  periodCode: string
  bidContext: string
  bidStatus: string
  totalTiers: number
  submittedAt: string | null
  bidTypes: CrewBidTypeRow[]
}

export interface CrewBidsResponse {
  rows: CrewBidCrewRow[]
  total: number
}

export interface CrewBidsParams {
  rosterPeriodId: number
  bidContext?: 'Default' | 'Current' | 'all'
  bases?: string[]
  ranks?: string[]
  crewId?: string
}

export interface PeriodOption {
  periodCode: string
}

export interface BaseOption {
  id: number
  base: string
  name: string | null
  displayOrder: number
}

export interface RankOption {
  id: number
  rank: string
  division: string
  description: string | null
  displayOrder: number
}

export interface FleetOption {
  id: number
  fleet: string
  description: string | null
  displayOrder: number
}

export const fetchCrewBids = async (params: CrewBidsParams): Promise<CrewBidsResponse> => {
  const q = new URLSearchParams()
  q.set('rosterPeriodId', String(params.rosterPeriodId))
  if (params.bidContext && params.bidContext !== 'all') q.set('bidContext', params.bidContext)
  if (params.bases && params.bases.length > 0) q.set('base', params.bases.join(','))
  if (params.ranks && params.ranks.length > 0) q.set('rank', params.ranks.join(','))
  if (params.crewId) q.set('crewId', params.crewId)
  return api.get(`/api/pbs/crew-bids?${q.toString()}`) as Promise<CrewBidsResponse>
}

export const fetchPeriodOptions = async (): Promise<PeriodOption[]> =>
  api.get('/api/pbs/periods') as Promise<PeriodOption[]>

export const fetchBaseOptions = async (): Promise<BaseOption[]> =>
  api.get('/api/base') as Promise<BaseOption[]>

export const fetchRankOptions = async (): Promise<RankOption[]> =>
  api.get('/api/rank') as Promise<RankOption[]>

export const fetchFleetOptions = async (): Promise<FleetOption[]> =>
  api.get('/api/fleet') as Promise<FleetOption[]>
