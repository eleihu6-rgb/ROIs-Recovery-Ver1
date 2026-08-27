import { api } from './api'
import type {
  Crew,
  CrewBaseRecord,
  CrewCertificateRecord,
  CrewDetail,
  CrewFleetRecord,
  CrewInfo,
  CrewListResponse,
  CrewListFilters,
  CrewQualSummary,
  CrewQualificationRecord,
  CrewFilters,
  CrewRankRecord,
  CrewStats,
  CrewTeamRecord,
} from '@/types'

export type { CrewQualSummary }

/** Build query params from CrewListFilters and CrewFilters */
function buildQueryParams(filters: CrewListFilters & CrewFilters): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {}

  // Pagination
  if (filters.page !== undefined) params.page = filters.page
  if (filters.pageSize !== undefined) params.pageSize = filters.pageSize

  // Sorting
  if (filters.sortBy) params.sortBy = filters.sortBy
  if (filters.sortOrder) params.sortOrder = filters.sortOrder

  // CrewListFilters
  if (filters.division) params.division = filters.division
  if (filters.rank) params.rank = filters.rank
  if (filters.base) params.base = filters.base
  if (filters.fleet) params.fleet = filters.fleet
  if (filters.status) params.status = filters.status
  if (filters.search) params.search = filters.search

  // Global array filters (comma-separated)
  if (filters.divisions?.length) params.divisions = filters.divisions.join(',')
  if (filters.bases?.length) params.bases = filters.bases.join(',')
  if (filters.ranks?.length) params.ranks = filters.ranks.join(',')
  if (filters.fleets?.length) params.fleets = filters.fleets.join(',')
  if (filters.crewIds?.length) params.crewIds = filters.crewIds.join(',')
  if (filters.dateRangeStart) params.dateRangeStart = filters.dateRangeStart
  if (filters.dateRangeEnd) params.dateRangeEnd = filters.dateRangeEnd

  // CrewFilters (search params)
  if (filters.empCode) params.empCode = filters.empCode
  if (filters.name) params.name = filters.name

  return params
}

export const crewApi = {
  /**
   * Paginated crew list with filters.
   * P1-3: view='gantt-panel' 返回精简数据（仅当前生效 rank/base/fleet，无全量历史），首屏提速。
   */
  async list(filters: CrewListFilters & CrewFilters = {}, view?: 'gantt-panel'): Promise<CrewListResponse> {
    const params = buildQueryParams(filters)
    if (view) params.view = view
    return api.get('/api/crew', { params }) as Promise<CrewListResponse>
  },

  /** Single crew detail with current effective records */
  async getDetail(id: number): Promise<CrewDetail> {
    return api.get(`/api/crew/${id}/detail`) as Promise<CrewDetail>
  },

  /** Single crew by id */
  async getById(id: number): Promise<Crew> {
    return api.get(`/api/crew/${id}`) as Promise<Crew>
  },

  async getInfo(crewId: string): Promise<CrewInfo> {
    const [list, ranks, bases, fleets, qualifications, certifications, teams] = await Promise.all([
      crewApi.list({ crewIds: [crewId], page: 1, pageSize: 1 }, 'gantt-panel'),
      api.get(`/api/crew/${encodeURIComponent(crewId)}/ranks`) as Promise<CrewRankRecord[]>,
      api.get(`/api/crew/${encodeURIComponent(crewId)}/bases`) as Promise<CrewBaseRecord[]>,
      api.get(`/api/crew/${encodeURIComponent(crewId)}/fleets`) as Promise<CrewFleetRecord[]>,
      crewApi.getQualifications(crewId),
      crewApi.getCertificates(crewId),
      crewApi.getTeams(crewId),
    ])
    const crew = list.items[0]
    if (!crew) throw new Error('Crew not found')
    return { crew, ranks, bases, fleets, qualifications, certifications, teams }
  },

  /** Full history of crew qualifications for a single crew. */
  async getQualifications(crewId: string): Promise<CrewQualificationRecord[]> {
    return api.get(`/api/crew/${encodeURIComponent(crewId)}/qualifications`) as Promise<CrewQualificationRecord[]>
  },

  /** Full history of crew certificates for a single crew. */
  async getCertificates(crewId: string): Promise<CrewCertificateRecord[]> {
    return api.get(`/api/crew/${encodeURIComponent(crewId)}/certificates`) as Promise<CrewCertificateRecord[]>
  },

  /** Full history of crew teams for a single crew. */
  async getTeams(crewId: string): Promise<CrewTeamRecord[]> {
    return api.get(`/api/crew/${encodeURIComponent(crewId)}/teams`) as Promise<CrewTeamRecord[]>
  },

  /** Batch fetch qualifications for rule engine */
  async batchQuals(crewIds: string[]): Promise<CrewQualSummary[]> {
    return api.post('/api/crew/batch-quals', { crewIds }) as Promise<CrewQualSummary[]>
  },

  /**
   * Fetch manday stats for crew header panel columns (YBH/RpBH/RpCred/YAL/MAL/YDO/RpDO).
   * rosterPeriod (YYYYRPMM) selects the roster period; backend defaults to current RP.
   */
  async getCrewStats(crewIds: string[], rosterPeriod?: string): Promise<Record<string, CrewStats>> {
    const params: Record<string, string> = { crewIds: crewIds.join(',') }
    if (rosterPeriod) params.rosterPeriod = rosterPeriod
    return api.get('/api/crew/stats', { params }) as Promise<Record<string, CrewStats>>
  },

  /**
   * Per-day credit + blh + dp (minutes) for Manday Info dialog.
   * Live: GET /api/crew/manday-daily. Scenario: GET /api/scenario/:id/manday-daily.
   */
  async getMandayDaily(
    crewId: string,
    start: string,
    end: string,
    scenarioId?: number | null,
  ): Promise<MandayDailyResponse> {
    const params = { crewId, start, end }
    if (scenarioId != null) {
      return api.get(`/api/scenario/${scenarioId}/manday-daily`, { params }) as Promise<MandayDailyResponse>
    }
    return api.get('/api/crew/manday-daily', { params }) as Promise<MandayDailyResponse>
  },
}

export interface MandayDailyDay {
  date: string
  creditMin: number
  blhMin: number
  dpMin: number
}

export interface MandayDailyResponse {
  crewId: string
  base: string
  zoneId: string
  days: MandayDailyDay[]
}
