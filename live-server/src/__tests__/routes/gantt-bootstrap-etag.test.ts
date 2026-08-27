import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify from 'fastify'

// Mock the service so the route runs without a DB — we only exercise the route's
// ETag/304 + pageSize handling. vi.hoisted so the fn exists when vi.mock is hoisted.
const { bootstrap } = vi.hoisted(() => ({ bootstrap: vi.fn() }))
vi.mock('../../services/gantt/gantt-service.js', () => ({ ganttService: { bootstrap } }))

import ganttRoutes from '../../routes/gantt/gantt.js'

/**
 * Bootstrap ETag / 304 (Asia↔Canada WAN perf, Tier-2 quick win).
 *
 * The first-screen bootstrap payload is large; on a page reload an unchanged response
 * should come back as 304 (empty body) instead of re-sending the whole window across
 * the Pacific. Pins: ETag present on 200; matching If-None-Match → 304 empty body;
 * a changed payload yields a different ETag (no false 304).
 */
describe('GET /api/gantt/bootstrap ETag', () => {
  const app = Fastify({ logger: false })
  const url = '/api/gantt/bootstrap?startDate=2026-06-01&endDate=2026-06-14&pageSize=100&rosterWindowDays=14'

  beforeAll(async () => {
    bootstrap.mockResolvedValue({ crew: { items: [{ crewId: 'C1' }], total: 1 }, roster: [], rosterWindow: 14 })
    await app.register(ganttRoutes, { prefix: '/api/gantt' })
    await app.ready()
  })
  afterAll(async () => { await app.close() })

  it('returns 200 with an ETag and a body on first request', async () => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(200)
    expect(res.headers.etag).toBeTruthy()
    expect(res.json().data.crew.items).toEqual([{ crewId: 'C1' }])
  })

  // Speed optimisation P3: Apply now drives bootstrap with pageSize=0 (full slim crew).
  // The route must accept 0 (no-limit), not reject it as it did under `.positive()`.
  it('accepts pageSize=0 (full slim crew, no-limit mode)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/gantt/bootstrap?startDate=2026-06-01&endDate=2026-06-14&pageSize=0&rosterWindowDays=14',
    })
    expect(res.statusCode).toBe(200)
    expect(bootstrap).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pageSize: 0 }))
  })

  it('returns 304 with empty body when If-None-Match matches', async () => {
    const first = await app.inject({ method: 'GET', url })
    const etag = first.headers.etag as string

    const second = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag } })
    expect(second.statusCode).toBe(304)
    expect(second.body).toBe('')
  })

  it('yields a different ETag when the payload changes (no false 304)', async () => {
    const first = await app.inject({ method: 'GET', url })
    const etag1 = first.headers.etag as string

    bootstrap.mockResolvedValueOnce({ crew: { items: [{ crewId: 'C2' }], total: 1 }, roster: [], rosterWindow: 14 })
    const changed = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag1 } })
    expect(changed.statusCode).toBe(200) // not 304 — content differs
    expect(changed.headers.etag).not.toBe(etag1)
  })
})
