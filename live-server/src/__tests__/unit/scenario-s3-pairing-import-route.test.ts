import { describe, expect, it, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    create: vi.fn(async () => ({ id: 701, status: 'DRAFT' })),
    getById: vi.fn(async () => ({
      id: 701,
      name: 'PO Target',
      fileType: 'PO',
      status: 'DRAFT',
      strDtLoc: new Date('2026-01-31T00:00:00Z'),
      endDtLoc: new Date('2026-02-28T00:00:00Z'),
      leadinLive: 0,
      pairingScenarioId: 0,
      flightScenarioId: 0,
    })),
    update: vi.fn(async () => ({ id: 701, status: 'DRAFT' })),
    duplicate: vi.fn(async () => ({ id: 702, status: 'DRAFT' })),
    transition: vi.fn(async () => ({ id: 701, status: 'DRAFT' })),
  },
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(async () => ({
    scenarioId: 800,
    createdScenario: false,
    importedPairings: 1,
    importedSegments: 2,
    importedCompositions: 2,
    warnings: [],
  })),
}))

vi.mock('../../services/scenario/scenario-gantt-db-service.js', () => ({
  buildGanttDataFromDb: vi.fn(async () => ({
    scenarioId: 701,
    scenarioName: 'PO Target',
    fileType: 'PO',
    capabilities: {},
    strDtLoc: new Date('2026-01-31T00:00:00Z'),
    endDtLoc: new Date('2026-02-28T00:00:00Z'),
    scenarioStrDt: '2026-01-31T00:00:00.000Z',
    scenarioEndDt: '2026-02-28T00:00:00.000Z',
    leadinLive: 0,
    dataSource: 'db',
    crew: [],
    pairings: [{ pairingId: 1 }],
    assignments: [],
    pairingSegments: [],
    flights: [],
    groundItems: [],
    crewStats: {},
  })),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: {
    getByParentCode: vi.fn(async () => []),
  },
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'
import { importS3PairingPrg } from '../../services/scenario/s3-pairing-import-service.js'
import { buildGanttDataFromDb } from '../../services/scenario/scenario-gantt-db-service.js'

const build = async () => {
  const app = Fastify()
  app.decorate('db', {
    execute: vi.fn(async () => ({ rows: [{ n: 0 }] })),
  } as never)
  app.decorate('pgPool', {
    query: vi.fn(async () => ({
      rows: [{
        id: '800',
        workset_id: '900',
        name: 'PO Target',
        status: 'DRAFT',
        str_dt_loc: new Date('2026-01-31T00:00:00Z'),
        end_dt_loc: new Date('2026-02-28T00:00:00Z'),
      }],
    })),
  } as never)
  app.decorate('redis', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'kevin',
      userName: 'Kevin Zhang',
      schema: 'f8',
      isAdmin: 1,
    }
  })
  await app.register(multipart)
  await app.register(scenarioRoutes)
  return app
}

const multipartBody = (boundary: string): Buffer => Buffer.from([
  `--${boundary}`,
  'Content-Disposition: form-data; name="targetMode"',
  '',
  'existing',
  `--${boundary}`,
  'Content-Disposition: form-data; name="targetScenarioId"',
  '',
  '800',
  `--${boundary}`,
  'Content-Disposition: form-data; name="clearBeforeImport"',
  '',
  'true',
  `--${boundary}`,
  'Content-Disposition: form-data; name="file"; filename="sample.PRG"',
  'Content-Type: text/plain',
  '',
  '1T4101 20260131',
  `--${boundary}--`,
  '',
].join('\r\n'))

const newScenarioMultipartBody = (boundary: string): Buffer => Buffer.from([
  `--${boundary}`,
  'Content-Disposition: form-data; name="targetMode"',
  '',
  'new',
  `--${boundary}`,
  'Content-Disposition: form-data; name="clearBeforeImport"',
  '',
  'false',
  `--${boundary}`,
  'Content-Disposition: form-data; name="newScenarioName"',
  '',
  'S3 Pairing sample',
  `--${boundary}`,
  'Content-Disposition: form-data; name="newStrDtLoc"',
  '',
  '2026-01-31',
  `--${boundary}`,
  'Content-Disposition: form-data; name="newEndDtLoc"',
  '',
  '2026-02-28',
  `--${boundary}`,
  'Content-Disposition: form-data; name="newDivision"',
  '',
  'P',
  `--${boundary}`,
  'Content-Disposition: form-data; name="file"; filename="sample.PRG"',
  'Content-Type: text/plain',
  '',
  '1T4101 20260131',
  `--${boundary}--`,
  '',
].join('\r\n'))

describe('scenario S3 pairing import routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists PO scenario import targets before the dynamic :id route', async () => {
    const app = await build()

    const res = await app.inject({ method: 'GET', url: '/import-targets/po' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: { items: [{ id: 800, worksetId: 900, name: 'PO Target', status: 'DRAFT' }] },
    })
  })

  it('rejects non-multipart import requests', async () => {
    const app = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/s3-pairing-import',
      payload: { targetMode: 'existing' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 400,
      message: expect.stringContaining('multipart/form-data'),
    })
  })

  it('passes multipart PRG import payload to the service with authenticated user', async () => {
    const app = await build()
    const boundary = '----rois-s3-test'

    const res = await app.inject({
      method: 'POST',
      url: '/s3-pairing-import',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary),
    })

    expect(res.statusCode).toBe(200)
    expect(importS3PairingPrg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fileName: 'sample.PRG',
        fileText: '1T4101 20260131',
        targetMode: 'existing',
        targetScenarioId: 800,
        clearBeforeImport: true,
        username: 'kevin',
      }),
    )
  })

  it('parses new scenario options without a base filter', async () => {
    const app = await build()
    const boundary = '----rois-s3-new-test'

    const res = await app.inject({
      method: 'POST',
      url: '/s3-pairing-import',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: newScenarioMultipartBody(boundary),
    })

    expect(res.statusCode).toBe(200)
    expect(importS3PairingPrg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetMode: 'new',
        clearBeforeImport: false,
        newScenario: expect.objectContaining({
          division: 'P',
        }),
      }),
    )
  })

  it('opens PO gantt-data without a loaded roster', async () => {
    const app = await build()

    const res = await app.inject({ method: 'GET', url: '/701/gantt-data' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: { scenarioId: 701, fileType: 'PO', dataSource: 'db' },
    })
    expect(buildGanttDataFromDb).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: 701,
      fileType: 'PO',
    }))
    expect((app as never as { db: { execute: ReturnType<typeof vi.fn> } }).db.execute).not.toHaveBeenCalled()
  })

  it('returns an empty roster payload for PO scenarios without reading roster rows', async () => {
    const app = await build()

    const res = await app.inject({ method: 'GET', url: '/701/roster' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: { assignments: [] },
    })
    expect((app as never as { db: { execute: ReturnType<typeof vi.fn> } }).db.execute).not.toHaveBeenCalled()
  })
})
