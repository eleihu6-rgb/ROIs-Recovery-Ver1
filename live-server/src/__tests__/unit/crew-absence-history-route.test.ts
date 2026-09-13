import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Crew Recovery Story 101 follow-up: the crew-app absence-history endpoint
 * (POST /api/crew-app/v1/absences). The route is body-credential authenticated
 * like the rest of the crew-app contract, so it must also stay exempt from the
 * global JWT hook — otherwise the crew would never reach the handler.
 */

const mobileRosterService = vi.hoisted(() => ({
  verifyMobileCrewCredentials: vi.fn(),
}))

const absenceService = vi.hoisted(() => ({
  listCrewAbsences: vi.fn(),
  submitCrewAbsence: vi.fn(),
}))

vi.mock('../../services/mobile-roster/mobile-roster-service.js', () => mobileRosterService)
vi.mock('../../services/absence/crew-absence-service.js', () => absenceService)
vi.mock('../../services/crew-notify/crew-notify-service.js', () => ({
  listForCrew: vi.fn(),
  markRead: vi.fn(),
  appendNotification: vi.fn(),
}))
vi.mock('../../services/crew-notify/discretion-consent-service.js', () => ({
  createConsent: vi.fn(),
  decideConsent: vi.fn(),
  discretionProposalSchema: { safeParse: vi.fn() },
  getControllerConsent: vi.fn(),
  getCrewConsent: vi.fn(),
  listOpenConsents: vi.fn(),
  prepareConsent: vi.fn(),
}))
vi.mock('../../config/index.js', () => ({ env: { JWT_SECRET: 'test-secret' } }))

import authPlugin from '../../plugins/auth.js'
import crewNotifyRoutes from '../../routes/crew-notify/crew-notify.js'

/**
 * Real rows for ET J4002 in September 2026, shaped exactly like the SIT
 * `crew_absence` records (one active 11 Sep day, one cancelled 24 Sep day).
 */
const septemberRows = [
  {
    id: 10,
    airline: 'ET',
    crewId: 'J4002',
    crewName: 'Jemal Bekele',
    absenceType: 'sick',
    assignment: 'ILL',
    fromDate: '2026-09-24',
    toDate: '2026-09-24',
    base: 'ADD',
    note: 'S1-20260912-J4002-RETAIN-DUTY-UI',
    status: 'cancelled',
    source: 'CREW_APP',
    removedPairingIds: [152056],
    createdAt: '2026-09-13T12:14:39.851Z',
  },
  {
    id: 3,
    airline: 'ET',
    crewId: 'J4002',
    crewName: 'Jemal Bekele',
    absenceType: 'sick',
    assignment: 'ILL',
    fromDate: '2026-09-11',
    toDate: '2026-09-11',
    base: 'ADD',
    note: '',
    status: 'active',
    source: 'CREW_APP',
    removedPairingIds: [],
    createdAt: '2026-09-12T16:54:56.485Z',
  },
]

const monthRequest = {
  airline: 'ET' as const,
  crewId: 'J4002',
  password: 'Pier2026',
  fromDate: '2026-09-01',
  toDate: '2026-09-30',
}

const buildApp = async () => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn() } as never)
  await app.register(authPlugin)
  await app.register(crewNotifyRoutes, { prefix: '/api/crew-app/v1' })
  return app
}

describe('POST /api/crew-app/v1/absences', () => {
  afterEach(() => vi.resetAllMocks())

  it("returns the crew's own September requests, cancelled ones included, without planner internals", async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockResolvedValue({ crewId: 'J4002' })
    absenceService.listCrewAbsences.mockResolvedValue(septemberRows)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/absences',
      payload: monthRequest,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 200,
      data: {
        absences: [
          {
            id: 10,
            absenceType: 'sick',
            assignment: 'ILL',
            fromDate: '2026-09-24',
            toDate: '2026-09-24',
            status: 'cancelled',
            note: 'S1-20260912-J4002-RETAIN-DUTY-UI',
            createdAt: '2026-09-13T12:14:39.851Z',
          },
          {
            id: 3,
            absenceType: 'sick',
            assignment: 'ILL',
            fromDate: '2026-09-11',
            toDate: '2026-09-11',
            status: 'active',
            note: '',
            createdAt: '2026-09-12T16:54:56.485Z',
          },
        ],
      },
      message: 'ok',
    })
    // The month window is the caller's; the crew id is the verified one.
    expect(absenceService.listCrewAbsences).toHaveBeenCalledWith(expect.anything(), {
      crewId: 'J4002',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
    })
    await app.close()
  })

  it('scopes the query to the verified crew id, not the id typed in the body', async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockResolvedValue({ crewId: 'J4002' })
    absenceService.listCrewAbsences.mockResolvedValue([])
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/absences',
      payload: { ...monthRequest, crewId: 'j4002 ' },
    })

    expect(response.statusCode).toBe(200)
    expect(absenceService.listCrewAbsences).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ crewId: 'J4002' }),
    )
    await app.close()
  })

  it('reaches the handler without a Bearer token (crew body-credential route)', async () => {
    mobileRosterService.verifyMobileCrewCredentials.mockResolvedValue({ crewId: 'J4002' })
    absenceService.listCrewAbsences.mockResolvedValue([])
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/absences',
      payload: monthRequest,
    })

    // The global JWT hook returns 401 for anything not on the exemption list.
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 200, data: { absences: [] }, message: 'ok' })
    await app.close()
  })

  it('rejects a malformed window before touching the absence table', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/absences',
      payload: { ...monthRequest, fromDate: '01-09-2026' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().code).toBe(400)
    expect(absenceService.listCrewAbsences).not.toHaveBeenCalled()
    expect(mobileRosterService.verifyMobileCrewCredentials).not.toHaveBeenCalled()
    await app.close()
  })

  it('passes a credential failure through with its own status', async () => {
    const failure = Object.assign(new Error('Invalid crew credentials'), { statusCode: 401 })
    mobileRosterService.verifyMobileCrewCredentials.mockRejectedValue(failure)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/crew-app/v1/absences',
      payload: monthRequest,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      code: 401,
      data: null,
      message: 'Invalid crew credentials',
    })
    expect(absenceService.listCrewAbsences).not.toHaveBeenCalled()
    await app.close()
  })
})
