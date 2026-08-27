import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/index.js', () => ({
  env: { LIVE_SCHEMA: 'f8', PBS_SCHEMA: 'f8_pbs' },
}))

const periodRow = {
  id: 6,
  roster_period: '2026RP06',
  name: '2026-06',
  pbs_period_code: 'Jun 2026',
  rp_start: '2026-06-01',
  rp_end: '2026-06-30',
}

const bidRow = {
  bid_id: 1001,
  crew_id: 'B79185',
  period_code: 'Jun 2026',
  bid_context: 'Current',
  bid_status: 'SUBMITTED',
  total_tiers: 1,
  submitted_at: '2026-05-08T14:00:00.000Z',
  crew_name: 'Mary Nasso',
  seniority_num: 1,
  base: 'YYZ',
  rank: 'IFD',
  bid_type: 'Pairing',
  group_count: 1,
  applied_tiers: [1],
  group_details: [{
    tier: 1,
    groupSeq: 1,
    actionId: 1,
    propertyName: 'Pairing Number',
    operator: 'In',
    paramA: '10751',
    paramB: null,
    limitN: null,
    allOrNothing: null,
    minimumN: null,
  }],
}

describe('GET /api/pbs/crew-bids', () => {
  let app: ReturnType<typeof Fastify>
  let queryMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('from f8.roster_period')) return { rows: [periodRow] }
      if (sql.includes('FROM f8_pbs.pbs_bid b')) return { rows: [bidRow] }
      if (sql.includes('FROM f8.pairing')) return { rows: [{ id: '10751', label: 'V4102' }] }
      return { rows: [] }
    })
    app = Fastify()
    ;(app as any).pgPool = { connect: vi.fn(async () => ({ query: queryMock, release: vi.fn() })) }
    const { default: crewBidsRoutes } = await import('../../routes/pbs/crew-bids.js')
    await app.register(crewBidsRoutes, { prefix: '/api/pbs' })
    await app.ready()
  })

  it('queries current bids by rosterPeriodId and resolves base/rank from live effective tables', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/crew-bids?rosterPeriodId=6&base=YYZ&rank=IFD',
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(200)
    expect(body.data.total).toBe(1)
    expect(body.data.rows[0]).toMatchObject({
      crewId: 'B79185',
      crewName: 'Mary Nasso',
      base: 'YYZ',
      rank: 'IFD',
      periodCode: 'Jun 2026',
      bidContext: 'Current',
    })
    expect(body.data.rows[0].bidTypes[0].groupDetails[0].paramA).toBe('V4102')

    const bidQuery = queryMock.mock.calls.find(([sql]) => String(sql).includes('FROM f8_pbs.pbs_bid b'))
    expect(bidQuery, 'main crew-bids SQL should run').toBeTruthy()
    const sql = String(bidQuery?.[0])
    expect(sql).toContain('b.roster_period_id = $1::bigint')
    expect(sql).toContain('FROM f8.crew_base crew_base')
    expect(sql).toContain('FROM f8.crew_rank crew_rank')
    expect(sql).toContain('cb.base = ANY')
    expect(sql).toContain('cr.rank = ANY')
    expect(sql).not.toContain('pbs_user')
    expect(bidQuery?.[1]).toEqual([6, '2026-06-01', ['YYZ'], ['IFD']])
  })

  it('rejects old periodCode-only requests instead of guessing a roster period', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/crew-bids?periodCode=Jun%202026',
    })

    const body = JSON.parse(res.body)
    expect(body.code).toBe(400)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('returns a clear not-found response for unknown roster periods', async () => {
    queryMock.mockImplementationOnce(async () => ({ rows: [] }))

    const res = await app.inject({
      method: 'GET',
      url: '/api/pbs/crew-bids?rosterPeriodId=999',
    })

    const body = JSON.parse(res.body)
    expect(body.code).toBe(404)
    expect(body.message).toBe('Roster period was not found')
  })
})
