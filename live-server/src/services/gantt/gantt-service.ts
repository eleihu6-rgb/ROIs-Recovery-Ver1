import type { FastifyInstance } from 'fastify'
import { crewService } from '../crew/crew-service.js'
import { rosterService } from '../roster/roster-service.js'
import type { CrewListFilters } from '../crew/crew-service.js'

export interface BootstrapParams {
  startDate: string
  endDate: string
  /** crew 首页大小（前端 PAGE_SIZE 传入，避免在服务端硬编码业务常量）。 */
  pageSize: number
  sortBy?: CrewListFilters['sortBy']
  sortOrder?: CrewListFilters['sortOrder']
  /** 首屏 roster 窗口天数（前端 PROGRESSIVE_WINDOW_DAYS 传入）。 */
  rosterWindowDays: number
}

/** start .. min(end, start + windowDays) 的结束日期（YYYY-MM-DD），与前端渐进式首屏窗口对齐。 */
const firstWindowEnd = (startDate: string, endDate: string, windowDays: number): string => {
  const windowEnd = new Date(`${startDate}T00:00:00Z`)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays)
  const end = new Date(`${endDate}T00:00:00Z`)
  const chosen = windowEnd < end ? windowEnd : end
  return chosen.toISOString().slice(0, 10)
}

export const ganttService = {
  /**
   * Gantt 首屏 bootstrap：把「slim crew 首页」与「首屏窗口 roster」合并为一次请求，
   * 省去客户端 crew→roster 的串行往返（roster 依赖 crew 结果）。pairing/flight 与
   * 余下 roster 窗口仍由前端在首屏后后台补拉，保持渐进式首屏不变。
   *
   * 复用 crewService.list（slim）与 rosterService.getView（分片缓存），不重复业务逻辑。
   */
  async bootstrap(fastify: FastifyInstance, params: BootstrapParams) {
    const crew = await crewService.list(
      fastify,
      {
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        // 有效性窗口 = Gantt dateRange（RP 派生），首屏 bootstrap 也遵守全局 rank/base 门槛。
        dateRangeStart: params.startDate,
        dateRangeEnd: params.endDate,
      },
      { page: 1, pageSize: params.pageSize },
      { slim: true },
    )
    const crewIds = crew.items.map((c) => c.crewId)
    const windowEnd = firstWindowEnd(params.startDate, params.endDate, params.rosterWindowDays)
    const roster =
      crewIds.length > 0
        ? await rosterService.getView(fastify, { crewIds, startDate: params.startDate, endDate: windowEnd })
        : []
    return { crew, roster, rosterWindow: { startDate: params.startDate, endDate: windowEnd } }
  },
}
