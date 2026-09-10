import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import pairingRoutes from '../../../routes/pairing/pairing.js'
import { roundtripService } from '../../../services/pairing/roundtrip-service.js'
import profile from '../../../config/roundtrip-profile.json'

describe('roundtrip HTTP contract', () => {
  it('returns reference options in the existing envelope', async () => {
    const app = Fastify()
    const options = { bases: ['ADD'], fleets: ['738'], ranks: ['CA', 'FO'], defaults: profile.defaults, composition: profile.composition, narrowFleets: ['738'] }
    const spy = vi.spyOn(roundtripService, 'options').mockResolvedValue(options)
    await app.register(pairingRoutes)
    const result = await app.inject({ method: 'GET', url: '/roundtrip/options' })
    expect(result.json()).toEqual({ code: 200, data: options, message: 'ok' })
    spy.mockRestore()
    await app.close()
  })
  it('rejects relaxed rules without invoking a build', async () => {
    const app = Fastify()
    await app.register(pairingRoutes)
    const result = await app.inject({ method: 'POST', url: '/roundtrip/build', payload: { scope: { rules: { ...profile.defaults, restMin: 1 } }, flightIds: [1, 2] } })
    expect(result.statusCode).toBe(400)
    await app.close()
  })
  it('surfaces stale coverage as a controlled conflict', async () => {
    const app = Fastify()
    const spy = vi.spyOn(roundtripService, 'build').mockRejectedValue(Object.assign(new Error('Already covered'), { statusCode: 409 }))
    await app.register(pairingRoutes)
    const result = await app.inject({ method: 'POST', url: '/roundtrip/build', payload: { scope: { startDate: '2026-09-20', endDate: '2026-09-23', ganttStart: '2026-09-01', ganttEnd: '2026-09-30', timezone: 'UTC', base: 'ADD', fleet: '738', composition: profile.composition.narrow, rules: profile.defaults }, flightIds: [1, 2] } })
    expect(result.statusCode).toBe(409)
    expect(result.json().message).toBe('Already covered')
    spy.mockRestore()
    await app.close()
  })
})
