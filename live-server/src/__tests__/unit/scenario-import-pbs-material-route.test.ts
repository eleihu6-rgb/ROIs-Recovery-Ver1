import http from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    BULLMQ_REDIS_URL: 'redis://localhost:6379/3',
    JWT_SECRET: 'test-secret',
    LIVE_SCHEMA: 'f8',
    FILIALE: 'f8',
    CONNECTOR_SERVER_URL: 'http://127.0.0.1:31094',
  },
}))

vi.mock('../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    BULLMQ_REDIS_URL: 'redis://localhost:6379/3',
    JWT_SECRET: 'test-secret',
    LIVE_SCHEMA: 'f8',
    FILIALE: 'f8',
    CONNECTOR_SERVER_URL: 'http://127.0.0.1:31094',
  },
}))

const progressBusMocks = vi.hoisted(() => ({
  publishImportProgress: vi.fn(async () => undefined),
  readImportProgressSnapshot: vi.fn(async (): Promise<unknown> => null),
}))

vi.mock('../../utils/import-progress-bus.js', () => ({
  publishImportProgress: progressBusMocks.publishImportProgress,
  readImportProgressSnapshot: progressBusMocks.readImportProgressSnapshot,
}))

const redisMocks = vi.hoisted(() => {
  const subscribe = vi.fn(async () => undefined)
  const unsubscribe = vi.fn(async () => undefined)
  const quit = vi.fn(async () => undefined)
  const connect = vi.fn(async () => undefined)
  const on = vi.fn()
  return {
    subscribe,
    unsubscribe,
    quit,
    connect,
    on,
    createClient: vi.fn(() => ({
      connect,
      subscribe,
      unsubscribe,
      quit,
      on,
    })),
  }
})

vi.mock('redis', () => ({
  createClient: redisMocks.createClient,
}))

import importPbsMaterialRoutes from '../../routes/scenario/import-pbs-material.js'

type ConnectorRequest = {
  method: string | undefined
  url: string
  authorization: string | undefined
}

let connectorRequests: ConnectorRequest[] = []
let connectorHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>

const sendConnectorJson = (res: http.ServerResponse, data: unknown, status = 200): void => {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

const connectorServer = http.createServer((req, res) => {
  connectorRequests.push({
    method: req.method,
    url: req.url ?? '',
    authorization: req.headers.authorization,
  })
  void Promise.resolve(connectorHandler(req, res)).catch((err: unknown) => {
    sendConnectorJson(res, {
      code: 500,
      data: null,
      message: err instanceof Error ? err.message : String(err),
    }, 500)
  })
})

const periodRows = Array.from({ length: 11 }, (_, index) => {
  const month = index + 1
  return {
    id: month,
    roster_period: `2026-${String(month).padStart(2, '0')}`,
    rp_start: `2026-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
    rp_end: `2026-${String(month).padStart(2, '0')}-28T23:59:59.000Z`,
    is_current: month === 6,
  }
})

const bullmqMocks = vi.hoisted(() => {
  const queueClose = vi.fn(async () => undefined)
  const queueEventsClose = vi.fn(async () => undefined)
  const waitUntilReady = vi.fn(async () => undefined)
  const completedJob = {
    getState: vi.fn(async () => 'completed'),
    returnvalue: {
      entity: 'roster_ground',
      imported: 12,
      added: 7,
      updated: 5,
      deleted: 2,
      success: 12,
      failed: 0,
      skipped: 1,
      warnings: ['one duplicate skipped'],
      errors: [],
    },
    processedOn: 1_000,
    finishedOn: 3_500,
  }
  return {
    queueClose,
    queueEventsClose,
    waitUntilReady,
    completedJob,
    Queue: vi.fn(() => ({ close: queueClose, on: vi.fn() })),
    QueueEvents: vi.fn(() => ({ waitUntilReady, close: queueEventsClose, on: vi.fn() })),
    fromId: vi.fn(async () => completedJob),
  }
})

vi.mock('bullmq', () => ({
  Queue: bullmqMocks.Queue,
  QueueEvents: bullmqMocks.QueueEvents,
  Job: {
    fromId: bullmqMocks.fromId,
  },
}))

const build = async (query: ReturnType<typeof vi.fn>, isAdmin = 1) => {
  const app = Fastify()
  const release = vi.fn()
  const redis = {
    set: vi.fn(async (): Promise<'OK' | null> => 'OK'),
    get: vi.fn(async (): Promise<string | null> => null),
    eval: vi.fn(async () => 1),
  }
  app.decorate('pgPool', {
    connect: vi.fn(async () => ({ query, release })),
  } as never)
  app.decorate('redis', redis as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'lei',
      userName: 'Lei',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(importPbsMaterialRoutes, { prefix: '/api/scenario' })
  return { app, release, redis }
}

describe('scenario Import PBS material routes', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      connectorServer.listen(31094, '127.0.0.1', () => resolve())
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    connectorRequests = []
    bullmqMocks.fromId.mockResolvedValue(bullmqMocks.completedJob)
    bullmqMocks.completedJob.getState.mockResolvedValue('completed')
    progressBusMocks.publishImportProgress.mockResolvedValue(undefined)
    progressBusMocks.readImportProgressSnapshot.mockResolvedValue(null)
    connectorHandler = (req, res) => {
      const url = req.url ?? ''
      if (url.endsWith('/api/admin/connectors')) {
        sendConnectorJson(res, {
          code: 200,
          data: [
            { id: 9, connectorCode: 'f8-roster-flight', isEnabled: 1, isDeleted: 0 },
            { id: 7, connectorCode: 'f8-crew', isEnabled: 1, isDeleted: 0 },
          ],
          message: 'ok',
        })
        return
      }
      if (url.includes('/api/admin/connectors/9/trigger')) {
        sendConnectorJson(res, {
          code: 200,
          data: { syncId: 'sync-9', filteredCount: 0, rejectionFile: null, status: 'success' },
          message: 'ok',
        })
        return
      }
      throw new Error(`Unexpected fetch ${url}`)
    }
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      connectorServer.close((err) => err ? reject(err) : resolve())
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns importId immediately without waiting for connector work', async () => {
    let resolveTrigger: (() => void) | undefined
    const triggerGate = new Promise<void>((resolve) => {
      resolveTrigger = resolve
    })

    connectorHandler = async (req, res) => {
      const url = req.url ?? ''
      if (url.endsWith('/api/admin/connectors')) {
        sendConnectorJson(res, {
          code: 200,
          data: [{ id: 9, connectorCode: 'f8-roster-flight', isEnabled: 1, isDeleted: 0 }],
          message: 'ok',
        })
        return
      }
      if (url.includes('/api/admin/connectors/9/trigger')) {
        await triggerGate
        sendConnectorJson(res, {
          code: 200,
          data: { syncId: 'sync-9', filteredCount: 0, rejectionFile: null, status: 'success' },
          message: 'ok',
        })
        return
      }
      throw new Error(`Unexpected fetch ${url}`)
    }

    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === 6) return { rows: [periodRows[5]] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      headers: { authorization: 'Bearer live-admin-token' },
      payload: {
        rosterPeriodId: 6,
        scope: {
          roster: true,
          rosterGround: true,
          flight: false,
          pairing: false,
          crew: false,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      rosterPeriodId: 6,
      rosterPeriod: '2026-06',
      startDt: '2026-06-01',
      endDt: '2026-06-28',
      materials: ['roster', 'rosterGround'],
    })
    expect(res.json().data.importId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(res.json().data.results).toBeUndefined()
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('from f8.roster_period'),
      [6],
    )

    await vi.waitFor(() => {
      expect(progressBusMocks.publishImportProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'started',
          importId: res.json().data.importId,
          materials: ['roster', 'rosterGround'],
        }),
      )
    })

    resolveTrigger?.()
    await vi.waitFor(() => {
      expect(connectorRequests.some((req) =>
        req.method === 'POST'
        && req.authorization === 'Bearer live-admin-token'
        && req.url.includes(`/api/admin/connectors/9/trigger?startDt=2026-06-01&endDt=2026-06-28&importId=${res.json().data.importId}`),
      )).toBe(true)
    })
    await vi.waitFor(() => {
      expect(progressBusMocks.publishImportProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          importId: res.json().data.importId,
        }),
      )
    })
  })

  it('rejects a concurrent import before creating an import id or calling the connector', async () => {
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === 6) return { rows: [periodRows[5]] }
      return { rows: [] }
    })
    const { app, redis } = await build(query)
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
    redis.get.mockResolvedValue(JSON.stringify({
      token: 'active-token',
      operation: 'import-pbs-material',
      userCode: 'planner-1',
      acquiredAt: 1,
    }))

    const payload = {
      rosterPeriodId: 6,
      scope: {
        roster: true,
        rosterGround: false,
        flight: false,
        pairing: false,
        crew: false,
      },
    }
    const first = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      headers: { authorization: 'Bearer live-admin-token' },
      payload,
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      headers: { authorization: 'Bearer live-admin-token' },
      payload,
    })

    expect(second.statusCode).toBe(409)
    expect(second.json()).toMatchObject({
      code: 409,
      data: null,
      message: expect.stringContaining('Your Import PBS Material request was not started'),
    })
    expect(second.json().data).toBeNull()
    expect(redis.set).toHaveBeenCalledTimes(2)

    await app.close()
  })

  it('requires authorization token before starting import', async () => {
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === 6) return { rows: [periodRows[5]] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      payload: {
        rosterPeriodId: 6,
        scope: {
          roster: true,
          rosterGround: false,
          flight: false,
          pairing: false,
          crew: false,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 401,
      message: 'Missing authorization token for connector trigger',
    })
    expect(connectorRequests).toHaveLength(0)
    expect(progressBusMocks.publishImportProgress).not.toHaveBeenCalled()
  })

  it('waits for all queued import jobs and publishes database timing on complete', async () => {
    connectorHandler = (req, res) => {
      const url = req.url ?? ''
      if (url.endsWith('/api/admin/connectors')) {
        sendConnectorJson(res, {
          code: 200,
          data: [{ id: 9, connectorCode: 'f8-roster-flight', isEnabled: 1, isDeleted: 0 }],
          message: 'ok',
        })
        return
      }
      if (url.includes('/api/admin/connectors/9/trigger')) {
        sendConnectorJson(res, {
          code: 200,
          data: {
            syncId: 'sync-9',
            filteredCount: 0,
            rejectionFile: null,
            status: 'success',
            timings: [
              {
                material: 'roster',
                fetchMs: 1_000,
                transformMs: 100,
                enqueueMs: 10,
                recordsIn: 5,
                recordsOut: 5,
                rejected: 0,
              },
              {
                material: 'rosterGround',
                fetchMs: 4_000,
                transformMs: 300,
                enqueueMs: 20,
                recordsIn: 20,
                recordsOut: 12,
                rejected: 0,
              },
            ],
            queueJobs: [
              {
                material: 'roster',
                queueName: 'connector.roster_flight.inbound',
                jobId: 'job-roster',
              },
              {
                material: 'rosterGround',
                queueName: 'connector.roster_ground.inbound',
                jobId: 'job-1',
              },
            ],
          },
          message: 'ok',
        })
        return
      }
      throw new Error(`Unexpected fetch ${url}`)
    }
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === 6) return { rows: [periodRows[5]] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      headers: { authorization: 'Bearer live-admin-token' },
      payload: {
        rosterPeriodId: 6,
        scope: {
          roster: true,
          rosterGround: true,
          flight: false,
          pairing: false,
          crew: false,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    const importId = res.json().data.importId as string

    await vi.waitFor(() => {
      expect(connectorRequests.some((req) =>
        req.method === 'POST'
        && req.url.includes(`/api/admin/connectors/9/trigger?startDt=2026-06-01&endDt=2026-06-28&importId=${importId}`)
        && req.url.includes('roster=true')
        && req.url.includes('rosterGround=true')
      )).toBe(true)
    })

    await vi.waitFor(() => {
      expect(bullmqMocks.Queue).toHaveBeenCalledWith('connector.roster_flight.inbound', expect.any(Object))
      expect(bullmqMocks.Queue).toHaveBeenCalledWith('connector.roster_ground.inbound', expect.any(Object))
      expect(bullmqMocks.fromId).toHaveBeenCalledWith(expect.any(Object), 'job-roster')
      expect(bullmqMocks.fromId).toHaveBeenCalledWith(expect.any(Object), 'job-1')
    })

    await vi.waitFor(() => {
      expect(progressBusMocks.publishImportProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          importId,
          result: expect.objectContaining({
            rosterPeriodId: 6,
            results: [
              expect.objectContaining({
                connectorCode: 'f8-roster-flight',
                timings: [
                  expect.objectContaining({
                    material: 'roster',
                    databaseMs: 2_500,
                    totalMs: 3_610,
                  }),
                  expect.objectContaining({
                    material: 'rosterGround',
                    fetchMs: 4_000,
                    transformMs: 300,
                    enqueueMs: 20,
                    databaseMs: 2_500,
                    totalMs: 6_820,
                    recordsIn: 20,
                    recordsOut: 12,
                    rejected: 0,
                  }),
                ],
              }),
            ],
            materialStats: [
              expect.objectContaining({
                material: 'roster',
                success: 14,
                added: 7,
                updated: 5,
                deleted: 2,
                skipped: 1,
                status: 'success',
                timings: expect.objectContaining({
                  databaseMs: 2_500,
                  totalMs: 3_610,
                }),
              }),
              expect.objectContaining({
                material: 'rosterGround',
                recordsIn: 20,
                recordsOut: 12,
                success: 14,
                added: 7,
                updated: 5,
                deleted: 2,
                skipped: 1,
                rejected: 0,
                warnings: ['one duplicate skipped'],
                timings: expect.objectContaining({
                  fetchMs: 4_000,
                  transformMs: 300,
                  enqueueMs: 20,
                  databaseMs: 2_500,
                  totalMs: 6_820,
                }),
              }),
            ],
          }),
        }),
      )
    })
  })

  it('publishes partial result details when one connector trigger disconnects', async () => {
    connectorHandler = (req, res) => {
      const url = req.url ?? ''
      if (url.endsWith('/api/admin/connectors')) {
        sendConnectorJson(res, {
          code: 200,
          data: [
            { id: 5, connectorCode: 'f8-crew', isEnabled: 1, isDeleted: 0 },
            { id: 7, connectorCode: 'f8-pairing', isEnabled: 1, isDeleted: 0 },
          ],
          message: 'ok',
        })
        return
      }
      if (url.includes('/api/admin/connectors/5/trigger')) {
        sendConnectorJson(res, {
          code: 200,
          data: {
            syncId: 'sync-crew',
            filteredCount: 0,
            rejectionFile: null,
            status: 'success',
            timings: [{
              material: 'crew',
              fetchMs: 100,
              transformMs: 10,
              enqueueMs: 1,
              recordsIn: 2,
              recordsOut: 2,
              rejected: 0,
            }],
            queueJobs: [{
              material: 'crew',
              queueName: 'connector.crew.inbound',
              jobId: 'job-crew',
            }],
          },
          message: 'ok',
        })
        return
      }
      if (url.includes('/api/admin/connectors/7/trigger')) {
        res.destroy(new Error('socket hang up'))
        return
      }
      throw new Error(`Unexpected fetch ${url}`)
    }
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === 6) return { rows: [periodRows[5]] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      headers: { authorization: 'Bearer live-admin-token' },
      payload: {
        rosterPeriodId: 6,
        scope: {
          roster: false,
          rosterGround: false,
          flight: false,
          pairing: true,
          crew: true,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    const importId = res.json().data.importId as string

    await vi.waitFor(() => {
      expect(progressBusMocks.publishImportProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          importId,
          result: expect.objectContaining({
            materialStats: expect.arrayContaining([
              expect.objectContaining({
                material: 'crew',
                status: 'success',
                failed: 0,
              }),
              expect.objectContaining({
                material: 'pairing',
                status: 'failed',
                failed: 1,
                errors: [expect.objectContaining({
                  id: 'pairing',
                  reason: expect.stringMatching(/socket hang up|aborted|ECONNRESET/i),
                })],
              }),
            ]),
          }),
        }),
      )
    })
    expect(progressBusMocks.publishImportProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', importId }),
    )
  })

  it('uses material progress history when a grouped roster-flight trigger fails after rosterGround write failure', async () => {
    connectorHandler = (req, res) => {
      const url = req.url ?? ''
      if (url.endsWith('/api/admin/connectors')) {
        sendConnectorJson(res, {
          code: 200,
          data: [{ id: 9, connectorCode: 'f8-roster-flight', isEnabled: 1, isDeleted: 0 }],
          message: 'ok',
        })
        return
      }
      if (url.includes('/api/admin/connectors/9/trigger')) {
        sendConnectorJson(res, {
          code: 200,
          data: {
            syncId: 'sync-9',
            filteredCount: 0,
            rejectionFile: null,
            status: 'fail',
            timings: [],
            queueJobs: [],
          },
          message: 'ok',
        })
        return
      }
      throw new Error(`Unexpected fetch ${url}`)
    }

    progressBusMocks.readImportProgressSnapshot.mockImplementation(async (...args: unknown[]) => {
      const importId = String(args[0])
      const at = (second: number): string => `2026-07-29T01:${String(second).padStart(2, '0')}:00.000Z`
      const doneEvents = (material: string, offset: number, success: number, recordsIn = success) => [
        { type: 'stage', importId, material, stage: 'fetch', status: 'running', at: at(offset) },
        { type: 'stage', importId, material, stage: 'fetch', status: 'done', recordsIn, at: at(offset + 1) },
        { type: 'stage', importId, material, stage: 'transform', status: 'running', at: at(offset + 1) },
        { type: 'stage', importId, material, stage: 'transform', status: 'done', recordsOut: success, at: at(offset + 2) },
        { type: 'stage', importId, material, stage: 'enqueue', status: 'running', at: at(offset + 2) },
        { type: 'stage', importId, material, stage: 'enqueue', status: 'done', at: at(offset + 3) },
        { type: 'stage', importId, material, stage: 'write', status: 'running', at: at(offset + 3) },
        {
          type: 'stage',
          importId,
          material,
          stage: 'write',
          status: 'done',
          processed: success,
          total: success,
          added: 0,
          updated: success,
          deleted: 0,
          success,
          failed: 0,
          skipped: 0,
          at: at(offset + 4),
        },
      ]
      return [
        ...doneEvents('crew', 10, 3176),
        ...doneEvents('flight', 15, 2563),
        ...doneEvents('pairing', 20, 2554),
        ...doneEvents('roster', 25, 3123, 4930),
        { type: 'stage', importId, material: 'rosterGround', stage: 'fetch', status: 'running', at: at(30) },
        { type: 'stage', importId, material: 'rosterGround', stage: 'fetch', status: 'done', recordsIn: 15935, at: at(31) },
        { type: 'stage', importId, material: 'rosterGround', stage: 'transform', status: 'running', at: at(31) },
        { type: 'stage', importId, material: 'rosterGround', stage: 'transform', status: 'done', recordsOut: 15935, at: at(32) },
        { type: 'stage', importId, material: 'rosterGround', stage: 'enqueue', status: 'running', at: at(32) },
        { type: 'stage', importId, material: 'rosterGround', stage: 'enqueue', status: 'done', at: at(33) },
        { type: 'stage', importId, material: 'rosterGround', stage: 'write', status: 'running', at: at(33) },
        {
          type: 'stage',
          importId,
          material: 'rosterGround',
          stage: 'write',
          status: 'fail',
          message: 'Failed query: DELETE FROM pairing WHERE id IN (...)',
          at: at(34),
        },
      ]
    })

    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === 6) return { rows: [periodRows[5]] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      headers: { authorization: 'Bearer live-admin-token' },
      payload: {
        rosterPeriodId: 6,
        scope: {
          crew: true,
          flight: true,
          pairing: true,
          roster: true,
          rosterGround: true,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    const importId = res.json().data.importId as string

    await vi.waitFor(() => {
      expect(progressBusMocks.publishImportProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          importId,
          result: expect.objectContaining({
            materialStats: [
              expect.objectContaining({ material: 'crew', status: 'success', failed: 0, success: 3176 }),
              expect.objectContaining({ material: 'flight', status: 'success', failed: 0, success: 2563 }),
              expect.objectContaining({ material: 'pairing', status: 'success', failed: 0, success: 2554 }),
              expect.objectContaining({ material: 'roster', status: 'success', failed: 0, success: 3123 }),
              expect.objectContaining({
                material: 'rosterGround',
                status: 'failed',
                failed: 1,
                errors: [expect.objectContaining({
                  id: 'rosterGround',
                  reason: 'Failed query: DELETE FROM pairing WHERE id IN (...)',
                })],
              }),
            ],
          }),
        }),
      )
    })
  })

  it('does not double-count database wait when connector material total is authoritative', async () => {
    connectorHandler = (req, res) => {
      const url = req.url ?? ''
      if (url.endsWith('/api/admin/connectors')) {
        sendConnectorJson(res, {
          code: 200,
          data: [{ id: 5, connectorCode: 'f8-crew', isEnabled: 1, isDeleted: 0 }],
          message: 'ok',
        })
        return
      }
      if (url.includes('/api/admin/connectors/5/trigger')) {
        sendConnectorJson(res, {
          code: 200,
          data: {
            syncId: 'sync-crew',
            filteredCount: 0,
            rejectionFile: null,
            status: 'success',
            timings: [{
              material: 'crew',
              fetchMs: 10_000,
              transformMs: 1_000,
              enqueueMs: 19_000,
              databaseMs: 19_000,
              totalMs: 30_000,
              recordsIn: 815,
              recordsOut: 815,
              rejected: 0,
            }],
            queueJobs: [{
              material: 'crew',
              queueName: 'connector.crew.inbound',
              jobId: 'job-crew',
            }],
          },
          message: 'ok',
        })
        return
      }
      throw new Error(`Unexpected fetch ${url}`)
    }
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === 6) return { rows: [periodRows[5]] }
      return { rows: [] }
    })
    const { app } = await build(query)

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario/import-pbs-material',
      headers: { authorization: 'Bearer live-admin-token' },
      payload: {
        rosterPeriodId: 6,
        scope: {
          roster: false,
          rosterGround: false,
          flight: false,
          pairing: false,
          crew: true,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    const importId = res.json().data.importId as string

    await vi.waitFor(() => {
      expect(progressBusMocks.publishImportProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          importId,
          result: expect.objectContaining({
            results: [
              expect.objectContaining({
                timings: [
                  expect.objectContaining({
                    material: 'crew',
                    databaseMs: 2_500,
                    totalMs: 30_000,
                  }),
                ],
              }),
            ],
            materialStats: [
              expect.objectContaining({
                material: 'crew',
                timings: expect.objectContaining({
                  databaseMs: 2_500,
                  totalMs: 30_000,
                }),
              }),
            ],
          }),
        }),
      )
    })
  })

  it('rejects invalid importId for SSE events', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'GET',
      url: '/api/scenario/import-pbs-material/not-a-uuid/events',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 400,
      message: 'Invalid importId',
    })
    expect(redisMocks.createClient).not.toHaveBeenCalled()
  })

  it('replays all cached progress events when SSE subscribes late', async () => {
    const importId = '11111111-1111-4111-8111-111111111111'
    progressBusMocks.readImportProgressSnapshot.mockResolvedValue([
      {
        type: 'started',
        importId,
        rosterPeriodId: 6,
        rosterPeriod: '2026-06',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        materials: ['crew'],
        at: '2026-07-16T00:00:00.000Z',
      },
      {
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'fetch',
        status: 'done',
        recordsIn: 216,
        at: '2026-07-16T00:00:01.000Z',
      },
      {
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'write',
        status: 'running',
        processed: 50,
        total: 216,
        at: '2026-07-16T00:00:02.000Z',
      },
      {
        type: 'complete',
        importId,
        result: { rosterPeriodId: 6, results: [] },
        at: '2026-07-16T00:00:03.000Z',
      },
    ])
    const query = vi.fn(async () => ({ rows: [] }))
    const { app } = await build(query)

    const res = await app.inject({
      method: 'GET',
      url: `/api/scenario/import-pbs-material/${importId}/events`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.headers['cache-control']).toContain('no-transform')
    expect(res.headers['x-accel-buffering']).toBe('no')
    const lines = res.body.split('\n\n').filter(Boolean)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('"type":"started"')
    expect(lines[1]).toContain('"stage":"fetch"')
    expect(lines[2]).toContain('"stage":"write"')
    expect(lines[3]).toContain('"type":"complete"')
    expect(redisMocks.connect).not.toHaveBeenCalled()
  })
})
