import { api } from './api'
import { isCoverageMet } from '@/utils/pairing-coverage'
import type { PairingListQuery, PairingListResponse, PairingFlight, PairingSegment, Pairing, PairingFilters } from '@/types'

/** One composition slot row (from pairing detail) */
export interface PairingCompositionRow {
  actingRank: string
  plan: number
  fill: number
  open: number
}

/** Rule 7500 Ref TZ for one crew's duty on this pairing. */
export interface PairingDutyRef {
  crewId: string
  pairingId: number
  dutySeq: number
  dutyRefTz: number | null
}

/** Pairing detail response with segments */
export interface PairingDetailResponse {
  pairing: Pairing
  segments: PairingSegment[]
  compositions: PairingCompositionRow[]
  /** Optional crew-specific Rule 7500 refs; absent on older API responses. */
  rosterDutyRefs?: PairingDutyRef[]
}

/** One rostered crew member on a pairing (for the Pairing Info popup) */
export interface PairingCrewDetail {
  crewId: string
  name: string
  gender: string | null
  base: string | null
  position: string | null
  /** CrewRank / ActiveRank from roster_flight.active_rank. */
  crewRank?: string | null
  /** Pairing-level ActingRank from roster_flight.roster_acting_rank. */
  actingRank: string | null
  rosterActingRank?: string | null
  /** Flight-level Acting from roster_flight.flight_acting_rank. */
  flightActingRank?: string | null
  source: string | null
  /** Monthly block hours in minutes (null when no manday record). */
  mbhMin: number | null
  /** Pairing credit for this crew in minutes (act roster credit → sch roster credit → pairing duty credit). */
  creditMin: number | null
}

/** Build query params from PairingListQuery, including all filter fields */
function buildQueryParams(query: PairingListQuery): Record<string, string | number | boolean | undefined> {
  const params: Record<string, string | number | boolean | undefined> = {}

  // Pagination
  if (query.page !== undefined) params.page = query.page
  if (query.pageSize !== undefined) params.pageSize = query.pageSize

  // Date range
  if (query.startDate) params.startDate = query.startDate
  if (query.endDate) params.endDate = query.endDate

  // Sorting
  if (query.sortBy) params.sortBy = query.sortBy
  if (query.sortOrder) params.sortOrder = query.sortOrder

  // Filter params
  if (query.label) params.label = query.label
  if (query.fleet) params.fleet = query.fleet
  if (query.base) params.base = query.base
  if (query.division) params.division = query.division
  if (query.segFltNum) params.segFltNum = query.segFltNum
  if (query.depArp) params.depArp = query.depArp
  if (query.view) params.view = query.view
  if (query.isFull !== undefined) params.isFull = query.isFull
  if (query.coverage?.length) params.coverage = query.coverage.join(',')
  if (query.assignments?.length) params.assignments = query.assignments.join(',')

  return params
}

export const pairingApi = {
  /** Paginated pairing list (with composition info, no segments) */
  async list(query: PairingListQuery = {}): Promise<PairingListResponse> {
    const params = buildQueryParams(query)
    return api.get('/api/pairing', { params }) as Promise<PairingListResponse>
  },

  /** Get pairing detail with segments and compositions */
  async getDetail(pairingId: number): Promise<PairingDetailResponse> {
    const response = await api.get(`/api/pairing/${pairingId}`)
    const data = response.data ?? response
    const pairing = data as Pairing
    const compositions = (data as { compositions?: PairingCompositionRow[] }).compositions ?? []
    // The detail endpoint returns composition as separate rows (actingRank/plan/fill)
    // and does NOT populate the Pairing.composition[] that the pairing pane renders
    // (Comp column + coverage). Backfill it so a detail-loaded pairing matches a
    // list-loaded one — otherwise "Locate Pairing" rows show "-" and read as full.
    if (!Array.isArray(pairing.composition) || pairing.composition.length === 0) {
      pairing.composition = compositions.map((c) => ({ rank: c.actingRank, plan: c.plan, fill: c.fill }))
      pairing.isFull = isCoverageMet(pairing.composition)
    }
    return {
      pairing,
      segments: (data as { segments?: PairingSegment[] }).segments ?? [],
      compositions,
      rosterDutyRefs: (data as { rosterDutyRefs?: PairingDutyRef[] }).rosterDutyRefs,
    }
  },

  /** Rostered crew on a pairing with Pairing Info detail (name/base/position/actingRank/MBH/source) */
  async getCrewDetail(pairingId: number): Promise<PairingCrewDetail[]> {
    return (api.get(`/api/pairing/${pairingId}/crew-detail`) as Promise<PairingCrewDetail[]>) ?? []
  },

  /** Get flights within a pairing */
  async getFlights(pairingId: number): Promise<PairingFlight[]> {
    return api.get(`/api/pairing/${pairingId}/flights`) as Promise<PairingFlight[]>
  },

  /** Distinct crew IDs assigned to a pairing */
  async getCrew(pairingId: number): Promise<{ crewIds: string[] }> {
    return api.get(`/api/pairing/${pairingId}/crew`) as Promise<{ crewIds: string[] }>
  },

  /** Assign a pairing to a crew member */
  async assignToCrew(pairingId: number, crewId: string): Promise<void> {
    return api.post(`/api/pairing/${pairingId}/assign`, { crewId }) as Promise<void>
  },

  /** Unassign a crew member from a pairing */
  async unassignCrew(pairingId: number, crewId: string): Promise<void> {
    return api.post(`/api/pairing/${pairingId}/unassign`, { crewId }) as Promise<void>
  },

  /** Soft delete a pairing */
  async remove(pairingId: number): Promise<void> {
    return api.post(`/api/pairing/${pairingId}/delete`, {}) as Promise<void>
  },

  /** Add a flight segment to a pairing */
  async addSegment(pairingId: number, flightId: number): Promise<unknown> {
    return api.post(`/api/pairing/${pairingId}/segment`, { flightId }) as Promise<unknown>
  },

  /** Create a new pairing from selected flights */
  async createFromFlights(flightIds: number[], base?: string, division?: string): Promise<unknown> {
    return api.post('/api/pairing/create-from-flights', { flightIds, base, division }) as Promise<unknown>
  },

  /** Build a rules-aware pairing from selected flight sectors (returns new pairing id).
   * `warnings` surfaces build-rule violations (8h multi-seg block cap, base loop, station
   * continuity, time overlap) — the build itself never blocks ("build as-is, surface violations"). */
  async build(flightIds: number[]): Promise<{ pairingId: number; label: string; dutyCount: number; segCount: number; warnings?: string[] }> {
    return api.post('/api/pairing/build', { flightIds }) as Promise<{
      pairingId: number
      label: string
      dutyCount: number
      segCount: number
      warnings?: string[]
    }>
  },

  /** Remove one flight from a pairing (deletes pairing if it was the last flight) */
  async removeFlight(pairingId: number, fltId: number): Promise<{ pairingId: number; deleted: boolean }> {
    return api.post(`/api/pairing/${pairingId}/remove-flight`, { fltId }) as Promise<{
      pairingId: number
      deleted: boolean
    }>
  },
}
