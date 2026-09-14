import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openCost, standbyCost, transferCost } = vi.hoisted(() => ({ openCost: vi.fn(), standbyCost: vi.fn(), transferCost: vi.fn() }))

vi.mock('../../services/recovery/open-pairing-gh-cost.js', () => ({ calculateOpenPairingGhCost: openCost }))
vi.mock('../../services/recovery/standby-gh-cost.js', () => ({ calculateStandbyGhCost: standbyCost }))
vi.mock('../../services/recovery/transfer-gh-cost.js', () => ({ calculateTransferGhCost: transferCost }))

import recoveryCostRoutes from './recovery-cost.js'

const base = { crossBase: 0, crossDivision: 0, crossRole: 0, changed: 0, followOnImpactCount: 0, dhdOutboundSectors: 0, dhdFlightCost: 0, dhdCostSavings: 0 }
const priced = { directCost: 7, currency: 'USD', breakdown: [], notes: [] }

const buildApp = async () => {
  const app = Fastify({ logger: false })
  app.decorateRequest('authUser', undefined)
  app.decorate('pgPool', { query: vi.fn(async () => ({ rows: [] })) } as unknown as import('pg').Pool)
  app.addHook('onRequest', async (request) => {
    request.authUser = { userCode: 'planner', userName: 'Planner', schema: 'f8', isAdmin: 0, tokenVersion: 1 }
  })
  await app.register(recoveryCostRoutes, { prefix: '/api/recovery' })
  return app
}

describe('recovery cost route dispatch', () => {
  beforeEach(() => {
    openCost.mockReset().mockResolvedValue(priced)
    standbyCost.mockReset().mockResolvedValue(priced)
    transferCost.mockReset().mockResolvedValue(priced)
  })

  it('dispatches openPairingContext by target and optional donor identity', async () => {
    const app = await buildApp()
    const context = { crewId: 'J4001', pairingId: 152800, donorPairingId: 152801 }
    const response = await app.inject({ method: 'POST', url: '/api/recovery/calculate-cost', payload: { ...base, mode: 'transfer', openPairingContext: context } })

    expect(response.statusCode).toBe(200)
    expect(openCost).toHaveBeenCalledWith(expect.anything(), context)
    expect(standbyCost).not.toHaveBeenCalled()
    expect(transferCost).not.toHaveBeenCalled()
    await app.close()
  })

  it('keeps standby and one-way transfer contexts on their existing branches', async () => {
    const app = await buildApp()
    const standby = { crewId: 'J4001', pairingId: 152800, standbyTaskId: 501 }
    const transfer = { sourceCrewId: 'J4002', sourcePairingId: 152801, targetCrewId: 'J4001' }

    const standbyResponse = await app.inject({ method: 'POST', url: '/api/recovery/calculate-cost', payload: { ...base, mode: 'standby', standbyContext: standby } })
    const transferResponse = await app.inject({ method: 'POST', url: '/api/recovery/calculate-cost', payload: { ...base, mode: 'transfer', transferContext: transfer } })

    expect(standbyResponse.statusCode).toBe(200)
    expect(transferResponse.statusCode).toBe(200)
    expect(standbyCost).toHaveBeenCalledWith(expect.anything(), standby)
    expect(transferCost).toHaveBeenCalledWith(expect.anything(), transfer)
    await app.close()
  })
})
