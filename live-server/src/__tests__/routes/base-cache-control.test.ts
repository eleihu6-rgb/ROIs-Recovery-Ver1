import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify from 'fastify'

// Mock just the airport service so the real base-routes plugin (and its Cache-Control
// onSend hook) runs without a DB.
const list = vi.fn(async (..._args: unknown[]) => [{ airport: 'YOW', zoneId: 'America/Toronto' }])
const create = vi.fn(async (..._args: unknown[]) => ({ id: 1, airport: 'YOW' }))
vi.mock('../../services/base/airport-service.js', () => ({
  airportService: { list: (...a: unknown[]) => list(...a), create: (...a: unknown[]) => create(...a) },
}))

import baseDataRoutes from '../../routes/base/index.js'

/**
 * Master-data Cache-Control hook (Asia↔Canada WAN perf, Tier-1 quick win).
 *
 * Low-frequency reference data (airports/bases/ranks/dictionary…) should carry a private
 * browser cache so a session doesn't re-fetch it across the Pacific on every open/reload.
 * Pins: GET responses get `private, max-age=3600`; mutations (POST) do NOT (the hook is
 * GET-only, so an edit's response is never cached).
 */
describe('base-data Cache-Control hook', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    await app.register(baseDataRoutes)
    await app.ready()
  })
  afterAll(async () => { await app.close() })

  it('sets private, max-age=3600 on a master-data GET', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/airport' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('private, max-age=3600')
  })

  it('does NOT cache a mutation response (GET-only hook)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/airport',
      payload: { airport: 'YOW', city: 'YOW', dir: 'E', zoneId: 'America/Toronto', utcStandardOffset: -300 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBeUndefined()
  })
})
