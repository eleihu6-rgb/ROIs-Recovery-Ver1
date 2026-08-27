import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

const h = vi.hoisted(() => ({
  service: {
    exportCurrentPackage: vi.fn(),
    exportYeg14TestPackage: vi.fn(),
    exportScenarioPackage: vi.fn(),
  },
}))

vi.mock('../../config/index.js', () => ({
  env: {
    PBS_SCHEMA: 'f8_pbs',
  },
}))

vi.mock('../../services/algorithm-export/algorithm-export-service.js', () => ({
  createPbsAlgorithmExportService: vi.fn(() => h.service),
}))

import pbsAlgorithmExportAdminRoutes from './pbs-algorithm-export.js'

const buildApp = async (isAdmin = 1) => {
  const app = Fastify()
  app.decorate('db', {} as never)
  app.decorate('pgPool', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    ;(request as { authUser?: unknown }).authUser = {
      userCode: isAdmin ? 'admin' : 'crew',
      userName: isAdmin ? 'Admin' : 'Crew',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(pbsAlgorithmExportAdminRoutes, { prefix: '/api' })
  return app
}

describe('PBS algorithm export admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.service.exportScenarioPackage.mockResolvedValue({
      filename: 'pbs-algorithm-export-scenario-Jun-2026.tgz',
      contentType: 'application/gzip',
      buffer: Buffer.from('scenario-tgz-bytes'),
    })
  })

  it('exports a scenario-scoped package for admins', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/algorithm-export/scenario-package',
      payload: {
        rosterPeriodId: 6,
        periodCode: 'Jun 2026',
        crewIds: ['536', '247'],
        scenarioStart: '2026-06-01',
        scenarioEnd: '2026-06-30',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/gzip')
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="pbs-algorithm-export-scenario-Jun-2026.tgz"',
    )
    expect(response.body).toBe('scenario-tgz-bytes')
    expect(h.service.exportScenarioPackage).toHaveBeenCalledWith(
      6,
      'Jun 2026',
      ['536', '247'],
      '2026-06-01',
      '2026-06-30',
      undefined,
    )

    await app.close()
  })

  it('forwards scenario package export filters', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/algorithm-export/scenario-package',
      payload: {
        rosterPeriodId: 6,
        periodCode: 'Jun 2026',
        crewIds: ['536', '247'],
        filters: {
          division: 'P',
          status: 'ACTIVE',
          bases: ['yeg', ' YVR '],
          fleetQuals: ['737'],
        },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(h.service.exportScenarioPackage).toHaveBeenCalledWith(
      6,
      'Jun 2026',
      ['536', '247'],
      undefined,
      undefined,
      {
        division: 'P',
        status: 'ACTIVE',
        bases: ['YEG', 'YVR'],
        fleetQuals: ['737'],
      },
    )

    await app.close()
  })

  it('returns service 400 errors for scenario package exports', async () => {
    const app = await buildApp()
    h.service.exportScenarioPackage.mockRejectedValueOnce(
      Object.assign(new Error('No crews match the scenario package export filters.'), { statusCode: 400 }),
    )

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/algorithm-export/scenario-package',
      payload: {
        rosterPeriodId: 6,
        periodCode: 'Jun 2026',
        crewIds: ['536'],
        filters: { bases: ['YYZ'] },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('No crews match the scenario package export filters.')

    await app.close()
  })

  it('contains one scenario package failure to the request and remains available', async () => {
    const app = await buildApp()
    h.service.exportScenarioPackage
      .mockRejectedValueOnce(new Error('Generated SQL failed.'))
      .mockResolvedValueOnce({
        filename: 'pbs-algorithm-export-scenario-Jun-2026.tgz',
        contentType: 'application/gzip',
        buffer: Buffer.from('recovered-tgz-bytes'),
      })
    const request = {
      method: 'POST' as const,
      url: '/api/admin/algorithm-export/scenario-package',
      payload: { rosterPeriodId: 6, periodCode: 'Jun 2026', crewIds: ['536'] },
    }

    const failedResponse = await app.inject(request)
    const recoveredResponse = await app.inject(request)

    expect(failedResponse.statusCode).toBe(500)
    expect(failedResponse.json().message).toBe('Failed to export PBS scenario algorithm package.')
    expect(recoveredResponse.statusCode).toBe(200)
    expect(recoveredResponse.body).toBe('recovered-tgz-bytes')
    expect(h.service.exportScenarioPackage).toHaveBeenCalledTimes(2)

    await app.close()
  })

  it('rejects non-admin scenario package exports', async () => {
    const app = await buildApp(0)

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/algorithm-export/scenario-package',
      payload: { rosterPeriodId: 6, periodCode: 'Jun 2026', crewIds: ['536'] },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Admin access required')
    expect(h.service.exportScenarioPackage).not.toHaveBeenCalled()

    await app.close()
  })

  it('requires rosterPeriodId, periodCode and crewIds for scenario package exports', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/algorithm-export/scenario-package',
      payload: { crewIds: ['536'] },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('rosterPeriodId, periodCode and crewIds are required.')
    expect(h.service.exportScenarioPackage).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects empty crewIds for scenario package exports', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/algorithm-export/scenario-package',
      payload: { rosterPeriodId: 6, periodCode: 'Jun 2026', crewIds: [] },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('rosterPeriodId, periodCode and crewIds are required.')
    expect(h.service.exportScenarioPackage).not.toHaveBeenCalled()

    await app.close()
  })
})
