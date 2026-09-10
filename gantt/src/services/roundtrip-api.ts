import { api } from './api'

export interface RoundtripRules {
  checkinMin: number
  debriefMin: number
  restMin: number
  maxDutyBlockMin: number
  singleLegExemption: boolean
}
export interface RoundtripComposition { rank: string; plan: number }
export interface RoundtripScope {
  startDate: string
  endDate: string
  ganttStart: string
  ganttEnd: string
  timezone: string
  base: string
  fleets: string[]
  composition: RoundtripComposition[]
  rules: RoundtripRules
}
export interface RoundtripFlight {
  id: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  blockMin: number
  fleet: string
}
export interface RoundtripLinkCandidate {
  flightId: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  preferred: boolean
}
export interface RoundtripRotation {
  key: string
  flightIds: number[]
  dutyFlightIds: number[][]
  blockMin: number
  layoverMinutes: number[]
}
export interface RoundtripSearch {
  flights: RoundtripFlight[]
  linkedFlights: Record<number, RoundtripFlight>
  rotations: RoundtripRotation[]
  selectionRotations: Record<number, RoundtripRotation>
  links: Record<number, RoundtripLinkCandidate[]>
}
export interface RoundtripOptions {
  bases: string[]
  fleets: string[]
  ranks: string[]
  defaults: RoundtripRules
  composition: { narrow: RoundtripComposition[]; wide: RoundtripComposition[] }
  narrowFleets: string[]
}
export const roundtripApi = {
  options: async (): Promise<RoundtripOptions> =>
    api.get('/api/pairing/roundtrip/options') as Promise<RoundtripOptions>,
  search: async (scope: RoundtripScope): Promise<RoundtripSearch> =>
    api.post('/api/pairing/roundtrip/search', { scope }) as Promise<RoundtripSearch>,
  build: async (scope: RoundtripScope, flightIds: number[]): Promise<{ pairingId: number; label: string; dutyCount: number; segCount: number }> =>
    api.post('/api/pairing/roundtrip/build', { scope, flightIds }) as Promise<{ pairingId: number; label: string; dutyCount: number; segCount: number }>,
}
