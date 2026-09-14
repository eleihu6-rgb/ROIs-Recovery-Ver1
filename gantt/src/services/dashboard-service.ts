import { api } from './api'

export interface DashboardOverview {
  flightsToday: number
  totalActiveCrew: number
  violations: number | null
  pendingApprovals: number | null
  crewByRank: Array<{ rank: string; count: number }>
  flightsByDay: Array<{ date: string; count: number }>
}

export type HandoverSeverity = 'info' | 'watch' | 'critical'

/** One crew-control shift-handover entry (shared, persisted server-side). */
export interface HandoverEntry {
  id: number
  shiftLabel: string
  author: string
  severity: HandoverSeverity
  caseRef: string | null
  note: string
  /** ISO timestamp. */
  createdAt: string
}

export interface AddHandoverInput {
  shiftLabel: string
  author: string
  severity?: HandoverSeverity
  caseRef?: string | null
  note: string
}

export const dashboardApi = {
  async overview(): Promise<DashboardOverview> {
    return api.get('/api/dashboard/overview') as Promise<DashboardOverview>
  },

  async handoverList(limit = 20): Promise<HandoverEntry[]> {
    return api.get('/api/dashboard/handover', { params: { limit } }) as Promise<HandoverEntry[]>
  },

  async handoverAdd(input: AddHandoverInput): Promise<HandoverEntry> {
    return api.post('/api/dashboard/handover', input) as Promise<HandoverEntry>
  },
}
