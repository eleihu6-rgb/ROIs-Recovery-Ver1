import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../services/crew/crew-service.js', () => ({
  crewService: { list: vi.fn() },
}))
vi.mock('../../../services/roster/roster-service.js', () => ({
  rosterService: { getView: vi.fn() },
}))

import { ganttService } from '../../../services/gantt/gantt-service.js'
import { crewService } from '../../../services/crew/crew-service.js'
import { rosterService } from '../../../services/roster/roster-service.js'

const fastify = {} as any

describe('ganttService.bootstrap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('merges slim crew page + first-window roster in one call', async () => {
    ;(crewService.list as any).mockResolvedValue({
      items: [{ crewId: 'C001' }, { crewId: 'C002' }],
      total: 2, page: 1, pageSize: 100, totalPages: 1,
    })
    ;(rosterService.getView as any).mockResolvedValue([{ id: 1, crewId: 'C001' }])

    const result = await ganttService.bootstrap(fastify, {
      startDate: '2026-03-01', endDate: '2026-03-31',
      pageSize: 100, sortBy: 'crew_id', sortOrder: 'asc', rosterWindowDays: 14,
    })

    // crew：slim 首页，排序透传，并携带有效性窗口（dateRangeStart/End = startDate/endDate）
    expect(crewService.list).toHaveBeenCalledWith(
      fastify,
      { sortBy: 'crew_id', sortOrder: 'asc', dateRangeStart: '2026-03-01', dateRangeEnd: '2026-03-31' },
      { page: 1, pageSize: 100 },
      { slim: true },
    )
    // roster：仅首屏窗口 start..start+14（其余由前端后台 append）
    expect(rosterService.getView).toHaveBeenCalledWith(fastify, {
      crewIds: ['C001', 'C002'], startDate: '2026-03-01', endDate: '2026-03-15',
    })
    expect(result.crew.items).toHaveLength(2)
    expect(result.roster).toEqual([{ id: 1, crewId: 'C001' }])
    expect(result.rosterWindow).toEqual({ startDate: '2026-03-01', endDate: '2026-03-15' })
  })

  it('clamps the roster window to endDate when the range is shorter than the window', async () => {
    ;(crewService.list as any).mockResolvedValue({ items: [{ crewId: 'C001' }], total: 1, page: 1, pageSize: 100, totalPages: 1 })
    ;(rosterService.getView as any).mockResolvedValue([])

    const result = await ganttService.bootstrap(fastify, {
      startDate: '2026-03-01', endDate: '2026-03-05', pageSize: 100, rosterWindowDays: 14,
    })

    expect(result.rosterWindow.endDate).toBe('2026-03-05')
    expect(rosterService.getView).toHaveBeenCalledWith(fastify, {
      crewIds: ['C001'], startDate: '2026-03-01', endDate: '2026-03-05',
    })
  })

  it('skips the roster query when no crew match', async () => {
    ;(crewService.list as any).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 0 })

    const result = await ganttService.bootstrap(fastify, {
      startDate: '2026-03-01', endDate: '2026-03-31', pageSize: 100, rosterWindowDays: 14,
    })

    expect(rosterService.getView).not.toHaveBeenCalled()
    expect(result.roster).toEqual([])
  })
})
