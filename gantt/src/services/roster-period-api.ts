import { api } from './api'

/**
 * A roster period option as returned by GET /api/roster-periods.
 * `rosterPeriod` is the unique period code (e.g. '2026RP07'); `name` is the
 * human-friendly label (e.g. '2026-07'); rpStart/rpEnd are 'YYYY-MM-DD' strings.
 */
export interface RosterPeriodOption {
  id: number
  rosterPeriod: string
  name: string
  rpStart: string
  rpEnd: string
  pbsPeriodCode?: string | null
  isCurrent: boolean
}

export interface RosterPeriodsResponse {
  /** Max RP span (max-min+1) selectable in the toolbar multi-select (RP_GANTT_MAX_PERIODS). */
  maxSpan: number
  /** RPs loaded per "Load earlier RPs" click (RP_SELECT_LOAD_MORE_COUNT). */
  loadMoreCount: number
  /** Whether older (historical) RPs exist beyond the returned batch. */
  hasMore: boolean
  items: RosterPeriodOption[]
}

export const fetchRosterPeriods = async (): Promise<RosterPeriodsResponse> =>
  api.get('/api/roster-periods') as Promise<RosterPeriodsResponse>

/** Fetch the oldest `limit` RPs strictly before `before` (for historical load-more). */
export const fetchOlderRosterPeriods = async (
  before: string,
  limit: number,
): Promise<RosterPeriodsResponse> =>
  api.get(`/api/roster-periods?before=${encodeURIComponent(before)}&limit=${limit}`) as Promise<RosterPeriodsResponse>
