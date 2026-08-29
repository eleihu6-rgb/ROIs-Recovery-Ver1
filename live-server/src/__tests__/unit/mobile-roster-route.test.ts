import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mobileRosterService = vi.hoisted(() => {
  class MobileRosterServiceError extends Error {
    statusCode: number

    constructor(statusCode: number, message: string) {
      super(message)
      this.statusCode = statusCode
    }
  }

  return {
    authenticateAndLoadMobileRoster: vi.fn(),
    MobileRosterServiceError,
  }
})

vi.mock('../../services/mobile-roster/mobile-roster-service.js', () => mobileRosterService)
vi.mock('../../config/index.js', () => ({ env: { JWT_SECRET: 'test-secret' } }))

import authPlugin from '../../plugins/auth.js'
import mobileRosterRoutes from '../../routes/mobile-roster/mobile-roster.js'

const mobileRosterResponse = {
  apiVersion: '1' as const,
  airline: 'F8' as const,
  crew: {
    crewId: '113',
    firstName: 'F8',
    lastName: 'Crew',
    base: 'YEG',
    rank: 'CA',
  },
  pairings: [],
  groundDuties: [],
}

const buildApp = async () => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn() } as never)
  await app.register(authPlugin)
  await app.register(mobileRosterRoutes, { prefix: '/api/mobile-roster' })
  return app
}

describe('POST /api/mobile-roster/session', () => {
  afterEach(() => vi.resetAllMocks())

  it('rejects unsupported airlines before loading a roster', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/mobile-roster/session',
      payload: { airline: 'EK', crewId: '113', password: 'not-a-real-password' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ code: 400, data: null })
    expect(mobileRosterService.authenticateAndLoadMobileRoster).not.toHaveBeenCalled()
    await app.close()
  })

  it('allows an unauthenticated POST session request to reach the mobile roster service', async () => {
    mobileRosterService.authenticateAndLoadMobileRoster.mockResolvedValue(mobileRosterResponse)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/mobile-roster/session',
      payload: { airline: 'F8', crewId: '113', password: 'not-a-real-password' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 200, data: mobileRosterResponse, message: 'ok' })
    expect(mobileRosterService.authenticateAndLoadMobileRoster).toHaveBeenCalledWith(
      { pgPool: expect.anything() },
      { airline: 'F8', crewId: '113', password: 'not-a-real-password' },
    )
    await app.close()
  })

  it('rejects an unauthenticated GET session request', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/mobile-roster/session',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 401, data: null })
    await app.close()
  })

  it('rejects an unauthenticated POST request to a session descendant', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/mobile-roster/session/debug',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 401, data: null })
    await app.close()
  })

  it('preserves a mobile roster authentication error status', async () => {
    mobileRosterService.authenticateAndLoadMobileRoster.mockRejectedValue(
      new mobileRosterService.MobileRosterServiceError(401, 'Invalid crew credentials.'),
    )
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/mobile-roster/session',
      payload: { airline: 'F8', crewId: '113', password: 'not-a-real-password' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      code: 401,
      data: null,
      message: 'Invalid crew credentials.',
    })
    await app.close()
  })
})
