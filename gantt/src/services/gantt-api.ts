import { api } from './api'
import type { CrewListResponse } from '@/types/crew'
import type { RosterItem } from '@/types'

export interface GanttBootstrapParams {
  startDate: string
  endDate: string
  /** crew 首页大小（= crew-store PAGE_SIZE）。 */
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** 首屏 roster 窗口天数（= PROGRESSIVE_WINDOW_DAYS）。 */
  rosterWindowDays: number
}

export interface GanttBootstrapResult {
  crew: CrewListResponse
  roster: RosterItem[]
  rosterWindow: { startDate: string; endDate: string }
}

export const ganttApi = {
  /** 首屏合并：一次取回 slim crew 首页 + 首屏窗口 roster，省去 crew→roster 串行往返。 */
  async bootstrap(params: GanttBootstrapParams): Promise<GanttBootstrapResult> {
    // Bootstrap joins crew + roster against a remote Postgres — cold-start query takes
    // 30-60 s. Override the shared 30s default so a slow first request doesn't trigger
    // the fallback chain (fetchCrews → selectedCrewIds empty → violations never load).
    return api.get('/api/gantt/bootstrap', { params, timeout: 90_000 }) as unknown as Promise<GanttBootstrapResult>
  },
}
