import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import dashboardRoutes from '../../routes/dashboard/dashboard.js'
import { createMockFastify, mockDbChainResult, mockDbReturning } from '../helpers/mock-fastify.js'

const buildApp = (db: ReturnType<typeof createMockFastify>['db'], authUser?: { userCode: string }) => {
  const app = Fastify()
  app.decorate('db', db)
  app.decorateRequest('authUser', undefined)
  if (authUser) {
    app.addHook('onRequest', async (request) => {
      ;(request as { authUser?: unknown }).authUser = authUser
    })
  }
  app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  return app
}

describe('GET /api/dashboard/handover', () => {
  it('returns the mocked recent handover entries as HandoverEntry[]', async () => {
    const { db } = createMockFastify()
    const rows = [
      {
        id: 3,
        shiftLabel: 'Night',
        author: 'A. Bekele',
        severity: 'critical',
        caseRef: 'case-2',
        note: 'ET2681 (pairing 152675) published delay — FDP over on Rule 3007.',
        createdAt: new Date('2026-09-14T02:00:00Z'),
      },
      {
        id: 2,
        shiftLabel: 'Night',
        author: 'A. Bekele',
        severity: 'watch',
        caseRef: 'case-3',
        note: 'Pairing 152227 fleet change 788->7M8 — Rule 8004.',
        createdAt: new Date('2026-09-14T01:00:00Z'),
      },
    ]
    mockDbChainResult(db, rows)

    const app = buildApp(db)
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/handover' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toEqual([
      {
        id: 3,
        shiftLabel: 'Night',
        author: 'A. Bekele',
        severity: 'critical',
        caseRef: 'case-2',
        note: 'ET2681 (pairing 152675) published delay — FDP over on Rule 3007.',
        createdAt: '2026-09-14T02:00:00.000Z',
      },
      {
        id: 2,
        shiftLabel: 'Night',
        author: 'A. Bekele',
        severity: 'watch',
        caseRef: 'case-3',
        note: 'Pairing 152227 fleet change 788->7M8 — Rule 8004.',
        createdAt: '2026-09-14T01:00:00.000Z',
      },
    ])
    expect(db.limit).toHaveBeenCalledWith(20)

    await app.close()
  })

  it('honors an explicit limit query param', async () => {
    const { db } = createMockFastify()
    mockDbChainResult(db, [])

    const app = buildApp(db)
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/handover?limit=5' })

    expect(res.statusCode).toBe(200)
    expect(db.limit).toHaveBeenCalledWith(5)

    await app.close()
  })
})

describe('POST /api/dashboard/handover', () => {
  it.each(['case-1', 'case-4'])('inserts a valid %s entry and returns it', async (caseRef) => {
    const note = caseRef === 'case-4' ? 'Ad hoc new flight ET895 ADD–BJM: build an unpaired base-return rotation before staffing.' : 'J4002 ILL absence overlaps pairing 152056 flying duty (Rule 1001).'
    const { db } = createMockFastify()
    const insertedRow = {
      id: 4,
      shiftLabel: 'Day',
      author: 'S. Tadesse',
      severity: 'info',
      caseRef,
      note,
      createdAt: new Date('2026-09-14T06:00:00Z'),
    }
    mockDbReturning(db, [insertedRow])

    const app = buildApp(db, { userCode: 'S_TADESSE' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/dashboard/handover',
      payload: {
        shiftLabel: 'Day',
        author: 'S. Tadesse',
        severity: 'info',
        caseRef,
        note,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toEqual({
      id: 4,
      shiftLabel: 'Day',
      author: 'S. Tadesse',
      severity: 'info',
      caseRef,
      note,
      createdAt: '2026-09-14T06:00:00.000Z',
    })
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({
      shiftLabel: 'Day',
      author: 'S. Tadesse',
      severity: 'info',
      caseRef,
      note,
      createdBy: 'S_TADESSE',
    }))

    await app.close()
  })

  it('rejects an empty note before inserting', async () => {
    const { db } = createMockFastify()

    const app = buildApp(db)
    const res = await app.inject({
      method: 'POST',
      url: '/api/dashboard/handover',
      payload: {
        shiftLabel: 'Day',
        author: 'S. Tadesse',
        note: '',
      },
    })

    // Project convention: fail() returns HTTP 200 with body.code = 400
    expect(res.statusCode).toBe(200)
    expect(res.json().code).toBe(400)
    expect(db.insert).not.toHaveBeenCalled()

    await app.close()
  })
})
