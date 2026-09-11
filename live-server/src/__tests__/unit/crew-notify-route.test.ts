import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

const crewNotifyService = vi.hoisted(() => ({
  listForCrew: vi.fn(),
  markRead: vi.fn(),
  CrewNotifyServiceError: class CrewNotifyServiceError extends Error {},
}))

const mobileRosterService = vi.hoisted(() => {
  class MobileRosterServiceError extends Error {
    statusCode: number

    constructor(statusCode: number, message: string) {
      super(message)
      this.statusCode = statusCode
    }
  }

  return {
    verifyMobileCrewCredentials: vi.fn(),
    MobileRosterServiceError,
  }
})

vi.mock('../../services/crew-notify/crew-notify-service.js', () => crewNotifyService)
vi.mock('../../services/mobile-roster/mobile-roster-service.js', () => mobileRosterService)
vi.mock('../../config/index.js', () => ({ env: { JWT_SECRET: 'test-secret' } }))

import authPlugin from '../../plugins/auth.js'
import crewNotifyRoutes from '../../routes/crew-notify/crew-notify.js'

const credentials = { airline: 'F8', crewId: '113', password: 'Pier2026' }

const feed = {
  cursor: 7,
  notifications: [
    {
      notifId: 'n-1',
      crewId: '113',
      type: 'roster_change',
      createdUtc: '2026-09-11T10:00:00.000Z',
      title: 'Roster updated',
      body: 'F8123 was assigned to you.',
      status: 'unread',
      readUtc: null,
      seq: 7,
      relatedPairingId: '12345',
      relatedFlightId: null,
      relatedDutyId: null,
      discretionId: null,
    },
  ],
  openDiscretions: [],
}

const buildApp = async () => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn() } as never)
  await app.register(authPlugin)
  await app.register(crewNotifyRoutes, { prefix: '/api/crew-app/v1' })
  return app
}

describe('POST /api/crew-app/v1/notifications', () => {
  afterEach(() => vi.resetAllMocks())

  it('returns the feed envelope for valid F8 credentials without a JWT', async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockResolvedValue({ crewId: '113' })
    crewNotifyService.listForCrew.mockResolvedValue(feed)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/notifications',
      payload: credentials,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 200, data: feed, message: 'ok' })
    expect(crewNotifyService.listForCrew).toHaveBeenCalledWith(
      expect.anything(),
      { airline: 'F8', crewId: '113', since: undefined },
    )
  })

  it('passes the since cursor through to the feed query', async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockResolvedValue({ crewId: '113' })
    crewNotifyService.listForCrew.mockResolvedValue(feed)
    const app = await buildApp()

    await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/notifications',
      payload: { ...credentials, since: 4 },
    })

    expect(crewNotifyService.listForCrew).toHaveBeenCalledWith(
      expect.anything(),
      { airline: 'F8', crewId: '113', since: 4 },
    )
  })

  it('rejects a bad password with the verifier status code', async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockRejectedValue(
      new mobileRosterService.MobileRosterServiceError(401, 'Invalid crew ID or password.'),
    )
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/notifications',
      payload: { ...credentials, password: 'wrong' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 401, data: null })
    expect(crewNotifyService.listForCrew).not.toHaveBeenCalled()
  })

  it('rejects an unsupported airline before authenticating', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/notifications',
      payload: { ...credentials, airline: 'EK' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ code: 400, data: null })
    expect(mobileRosterService.verifyMobileCrewCredentials).not.toHaveBeenCalled()
  })
})

describe('POST /api/crew-app/v1/notifications/:notifId/read', () => {
  afterEach(() => vi.resetAllMocks())

  it('marks a notification read and is exempt from the JWT hook', async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockResolvedValue({ crewId: '113' })
    crewNotifyService.markRead.mockResolvedValue(true)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/notifications/n-1/read',
      payload: credentials,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 200, data: { ok: true }, message: 'ok' })
    expect(crewNotifyService.markRead).toHaveBeenCalledWith(
      expect.anything(),
      { airline: 'F8', crewId: '113', notifId: 'n-1' },
    )
  })

  it('returns 404 for a notification the crew cannot see', async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockResolvedValue({ crewId: '113' })
    crewNotifyService.markRead.mockResolvedValue(false)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/notifications/n-999/read',
      payload: credentials,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 404, data: null })
  })
})
