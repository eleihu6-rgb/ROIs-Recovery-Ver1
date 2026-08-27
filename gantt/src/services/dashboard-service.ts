import { api } from './api'

export interface DashboardOverview {
  flightsToday: number
  totalActiveCrew: number
  violations: number | null
  pendingApprovals: number | null
  crewByRank: Array<{ rank: string; count: number }>
  flightsByDay: Array<{ date: string; count: number }>
}

export const dashboardApi = {
  async overview(): Promise<DashboardOverview> {
    return api.get('/api/dashboard/overview') as Promise<DashboardOverview>
  },
}
