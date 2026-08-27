import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/index.js', () => ({ env: { LIVE_SCHEMA: 'f8' } }))
vi.mock('../../config/env.js', () => ({ env: { LIVE_SCHEMA: 'f8' } }))

const { getSysParamMapMock } = vi.hoisted(() => ({ getSysParamMapMock: vi.fn() }))

vi.mock('../../services/base/dictionary-service.js', () => ({
  getSysParamMap: getSysParamMapMock,
}))

const periodRows = [
  { id: 1, roster_period: '2026RP02', name: '2026-02', rp_start: '2026-02-01', rp_end: '2026-03-01', pbs_period_code: 'Feb 2026', is_current: true },
  { id: 2, roster_period: '2026RP03', name: '2026-03', rp_start: '2026-03-02', rp_end: '2026-03-31', pbs_period_code: 'Mar 2026', is_current: false },
]

describe('GET /api/roster-periods', () => {
  let app: ReturnType<typeof Fastify>
  let queryMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Empty SYS_PARAM map → all defaults apply (back/forward 6, maxSpan 6, loadMore 12).
    getSysParamMapMock.mockResolvedValue(new Map())
    queryMock = vi.fn(async () => ({ rows: periodRows }))
    app = Fastify()
    ;(app as any).pgPool = { connect: vi.fn(async () => ({ query: queryMock, release: vi.fn() })) }
    const { default: rosterPeriodsRoutes } = await import('../../routes/base/roster-periods.js')
    await app.register(rosterPeriodsRoutes, { prefix: '/api/roster-periods' })
    await app.ready()
  })

  it('returns windowed roster periods with maxSpan/loadMoreCount/hasMore', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(queryMock.mock.calls[0][0]).toContain('current_date between rp_start::date and rp_end::date')
    expect(queryMock.mock.calls[0][0]).toContain('p.pbs_period_code')
    expect(queryMock.mock.calls[0][0]).toContain('p.rp_start::date::text as rp_start')
    expect(body.data.items).toHaveLength(2)
    expect(body.data.items[0]).toMatchObject({
      id: 1, rosterPeriod: '2026RP02', name: '2026-02',
      rpStart: '2026-02-01', rpEnd: '2026-03-01',
      pbsPeriodCode: 'Feb 2026', isCurrent: true,
    })
    expect(body.data.maxSpan, 'maxSpan default 6').toBe(6)
    expect(body.data.loadMoreCount, 'loadMoreCount default 12').toBe(12)
    expect(body.data.hasMore, 'fixture has no RP older than window earliest → false').toBe(false)
    expect(body.data.maxPeriods, 'maxPeriods removed').toBeUndefined()
  })

  it('sizes the window from RP_SELECT_BACK_COUNT / FORWARD_COUNT', async () => {
    getSysParamMapMock.mockResolvedValue(new Map([
      ['RP_SELECT_BACK_COUNT', '2'],
      ['RP_SELECT_FORWARD_COUNT', '3'],
    ]))
    await app.inject({ method: 'GET', url: '/api/roster-periods' })
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [2, 3])
  })

  it('falls back to 6/6 window, maxSpan 6, loadMore 12 when the params are absent', async () => {
    getSysParamMapMock.mockResolvedValue(new Map())
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods' })
    const body = JSON.parse(res.body)
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [6, 6])
    expect(body.data.maxSpan).toBe(6)
    expect(body.data.loadMoreCount).toBe(12)
  })

  it('returns body code 404 when no period contains now() (fail keeps HTTP 200)', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(404)
    expect(body.data).toBeNull()
  })

  it('loads the nearest older periods via before+limit, ascending, with an N+1 hasMore probe', async () => {
    // DB returns `order by rp_start asc, id asc limit 13`: the OLDEST 13
    // (2025RP01..2025RP12, 2026RP01). The route must take the tail so the batch
    // nearest to `before` (2026RP01 first) is surfaced, still ascending.
    const mk = (roster_period: string, year: string, month: string): Record<string, unknown> => ({
      id: 100 + Number(month),
      roster_period,
      name: `${year}-${month}`,
      rp_start: `${year}-${month}-01`,
      rp_end: `${year}-${month}-28`,
      is_current: false,
    })
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => mk(`2025RP${String(i + 1).padStart(2, '0')}`, '2025', String(i + 1).padStart(2, '0'))),
      mk('2026RP01', '2026', '01'),
    ]
    queryMock.mockResolvedValue({ rows })
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods?before=2026-02-01&limit=12' })
    const body = JSON.parse(res.body)
    expect(body.code).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('order by rp_start asc'),
      ['2026-02-01', 13], // batch 12 + 1 probe
    )
    expect(body.data.items).toHaveLength(12)
    expect(body.data.hasMore, 'probe 2025RP01 remains → older history exists').toBe(true)
    // Tail batch returned ascending (store prepends and expects ascending).
    expect(body.data.items[0].rosterPeriod).toBe('2025RP02')
    expect(body.data.items[11].rosterPeriod).toBe('2026RP01')
    expect(body.data.items[0].isCurrent).toBe(false)
  })

  it('does not skip the period immediately before the window (regression: 2026RP01 cut by head-slice)', async () => {
    // 13 older periods exist (12 of 2025 + 2026RP01). Taking the HEAD of the
    // ascending probe returns all 12 of 2025 and silently drops 2026RP01, making it
    // unreachable in the UI. Taking the tail must keep 2026RP01 in the response.
    const mk = (id: number, roster_period: string, rp_start: string): Record<string, unknown> => ({
      id, roster_period, name: roster_period, rp_start, rp_end: rp_start, is_current: false,
    })
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => mk(133 + i, `2025RP${String(i + 1).padStart(2, '0')}`, `2025-${String(i + 1).padStart(2, '0')}-01`)),
      mk(1, '2026RP01', '2026-01-01'),
    ]
    queryMock.mockResolvedValue({ rows })
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods?before=2026-01-31&limit=12' })
    const body = JSON.parse(res.body)
    expect(body.code).toBe(200)
    const codes = (body.data.items as { rosterPeriod: string }[]).map((r) => r.rosterPeriod)
    expect(codes).toContain('2026RP01')
    expect(codes[0]).toBe('2025RP02')
    expect(codes).not.toContain('2025RP01')
  })

  it('uses RP_SELECT_LOAD_MORE_COUNT as the default limit', async () => {
    getSysParamMapMock.mockResolvedValue(new Map([['RP_SELECT_LOAD_MORE_COUNT', '5']]))
    queryMock.mockResolvedValue({ rows: [] })
    await app.inject({ method: 'GET', url: '/api/roster-periods?before=2026-01-01' })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('rp_start < $1'),
      ['2026-01-01', 6], // default 5 + 1 probe
    )
  })

  it('rejects a malformed before date with code 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/roster-periods?before=01/01/2026' })
    const body = JSON.parse(res.body)
    expect(body.code).toBe(400)
  })
})
