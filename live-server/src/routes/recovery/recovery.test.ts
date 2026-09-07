import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import recoveryRoutes from './recovery.js'

const buildApp = async () => {
  const app = Fastify({ logger: false })
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    request.authUser = {
      userCode: 'planner',
      userName: 'Recovery Planner',
      schema: 'dev_live',
      isAdmin: 0,
      tokenVersion: 1,
    }
  })
  await app.register(recoveryRoutes, { prefix: '/api/recovery' })
  return app
}

const flightChange = {
  flightNo: 'MU5123',
  departure: 'PVG',
  arrival: 'PEK',
  oldAircraftType: 'A320',
  newAircraftType: 'A350',
  oldTailNumber: 'B-1234',
  newTailNumber: 'B-308X',
}

describe('recovery routes', () => {
  it('exposes rule-independent recovery method capabilities', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/recovery/methods' })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { data: Array<{ id: string; operations: string[] }> }
    expect(body.data).toEqual([
      expect.objectContaining({ id: 'roster-assignment', operations: ['transfer', 'swap'] }),
      expect.objectContaining({ id: 'callout-standby', operations: ['callout-standby'] }),
      expect.objectContaining({ id: 'cross-base', operations: ['cross-base-standby', 'cross-base-swap'] }),
    ])
    await app.close()
  })

  it('validates generic method requests before touching roster data', async () => {
    const app = await buildApp()
    const swapResponse = await app.inject({
      method: 'POST',
      url: '/api/recovery/methods/roster-assignment',
      payload: {
        operation: 'swap',
        sourceCrewId: 'C00128',
        sourcePairingId: 135559,
        targetCrewId: 'C00331',
      },
    })
    const standbyResponse = await app.inject({
      method: 'POST',
      url: '/api/recovery/methods/callout-standby',
      payload: {
        sourceCrewId: 'C00128',
        sourcePairingId: 135559,
        targetCrewId: 'S00072',
      },
    })

    expect(swapResponse.statusCode).toBe(400)
    expect(standbyResponse.statusCode).toBe(400)
    await app.close()
  })

  it('creates an aircraft qualification alert and two recovery plans', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'POST', url: '/api/recovery/simulate-flight-change', payload: flightChange })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { data: { alert: { ruleCode: string }; plans: Array<{ id: string }> } }
    expect(body.data.alert.ruleCode).toBe('8004')
    expect(body.data.plans.map((plan) => plan.id)).toEqual(['standby', 'swap'])
    await app.close()
  })

  it('applies the selected plan and records its effective state', async () => {
    const app = await buildApp()
    const created = await app.inject({ method: 'POST', url: '/api/recovery/simulate-flight-change', payload: flightChange })
    const sessionId = (created.json() as { data: { id: string } }).data.id
    const applied = await app.inject({ method: 'POST', url: `/api/recovery/sessions/${sessionId}/apply`, payload: { planId: 'swap' } })

    expect(applied.statusCode).toBe(200)
    const body = applied.json() as { data: { status: string; selectedPlanId: string; appliedBy: string; appliedAt: string | null } }
    expect(body.data).toMatchObject({ status: 'applied', selectedPlanId: 'swap', appliedBy: 'planner' })
    expect(body.data.appliedAt).toBeTruthy()
    await app.close()
  })

  it('rejects a no-op aircraft type change', async () => {
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/recovery/simulate-flight-change',
      payload: { ...flightChange, newAircraftType: 'A320' },
    })

    expect(response.statusCode).toBe(400)
    await app.close()
  })
})
