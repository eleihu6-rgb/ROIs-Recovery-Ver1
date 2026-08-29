import { api } from './api'
import type { Flight, FlightListQuery, FlightListResponse, FlightCrewResponse, FlightPairingsResponse, FlightNaviCountsResponse, FlightCompositionsResponse } from '@/types'

export const flightApi = {
  /** Paginated flight list with date range and filters (returns grouped FlightItem) */
  async list(query: FlightListQuery): Promise<FlightListResponse> {
    return api.get('/api/flight', { params: query }) as Promise<FlightListResponse>
  },

  /** Get flight detail by id (returns single Flight) */
  async getById(id: number): Promise<Flight> {
    return api.get(`/api/flight/${id}`) as Promise<Flight>
  },

  /** Add a flight to a pairing (building a pairing loop) */
  async addToPairing(flightId: number, pairingId: number): Promise<void> {
    return api.post(`/api/flight/${flightId}/add-to-pairing`, { pairingId }) as Promise<void>
  },

  /** Assign a flight directly to a crew member */
  async assignToCrew(flightId: number, crewId: string): Promise<void> {
    return api.post(`/api/flight/${flightId}/assign`, { crewId }) as Promise<void>
  },

  /** Get crew assignment list for a flight */
  async getCrewList(id: number): Promise<FlightCrewResponse> {
    return api.get(`/api/flight/${id}/crew`) as Promise<FlightCrewResponse>
  },

  /** Get the distinct pairing ids this flight is rostered into */
  async getPairingIds(id: number): Promise<FlightPairingsResponse> {
    return api.get(`/api/flight/${id}/pairings`) as Promise<FlightPairingsResponse>
  },

  /** Per-flight pairing & crew counts for a date range (Flight Navi table). */
  async naviCounts(startDate: string, endDate: string): Promise<FlightNaviCountsResponse> {
    return api.get('/api/flight/navi-counts', { params: { startDate, endDate } }) as Promise<FlightNaviCountsResponse>
  },

  /** Bulk per-flight composition (plan/actual) for the given flight ids. */
  async compositions(flightIds: number[]): Promise<FlightCompositionsResponse> {
    return api.post('/api/flight/compositions', { flightIds }) as Promise<FlightCompositionsResponse>
  },

  /** Update a flight's scheduled/actual departure & arrival times (STD/STA/ATD/ATA), and optionally fleet/register. */
  async updateTimes(id: number, payload: {
    schDepDtUtc: string
    schArvDtUtc: string
    actDepDtUtc: string
    actArvDtUtc: string
    fleet?: string
    register?: string | null
  }): Promise<Flight> {
    return api.put(`/api/flight/${id}`, payload) as Promise<Flight>
  },

  /** Mark a flight cancelled. */
  async cancel(id: number): Promise<Flight> {
    return api.post(`/api/flight/${id}/cancel`) as Promise<Flight>
  },

  /** Clear a flight's cancelled status. */
  async restore(id: number): Promise<Flight> {
    return api.post(`/api/flight/${id}/restore`) as Promise<Flight>
  },
}
