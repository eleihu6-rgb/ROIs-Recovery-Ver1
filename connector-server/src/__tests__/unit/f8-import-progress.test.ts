import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withBullmqPrefix } from '../../utils/redis-key-prefix.js'

process.env.DATABASE_URL ??= 'postgresql://f8:test@localhost:5432/rois?options=-c%20search_path%3Df8'
process.env.REDIS_URL ??= 'redis://localhost:6379/1'

const publishImportProgress = vi.fn().mockResolvedValue(undefined)
const getAccessToken = vi.fn().mockResolvedValue('test-token')
const getConfig = vi.fn().mockResolvedValue(null)
const saveRawJson = vi.fn().mockResolvedValue('/tmp/raw.json')
const saveRejectedRecords = vi.fn().mockResolvedValue('/tmp/rejected.json')
const loadCrewSet = vi.fn().mockResolvedValue(new Set<string>())
const flowAdd = vi.fn()
const queueEventsClose = vi.fn().mockResolvedValue(undefined)
const waitUntilReady = vi.fn().mockResolvedValue(undefined)
const waitUntilFinished = vi.fn().mockResolvedValue(undefined)

const mockJob = (id: string) => ({
  id,
  waitUntilFinished: (...args: unknown[]) => waitUntilFinished(...args),
})

vi.mock('bullmq', () => ({
  FlowProducer: class {
    async add(node: {
      queueName: string
      data?: unknown
      children?: unknown[]
    }) {
      await flowAdd(node)
      const toResult = (item: {
        queueName: string
        children?: unknown[]
      }): unknown => {
        const idByQueue: Record<string, string> = {
          'connector.crew.inbound': 'crew-job-1',
          'connector.flight.inbound': 'flight-job-1',
          'connector.pairing.inbound': 'pairing-job-1',
          'connector.roster.inbound': 'roster-job-1',
          'connector.roster_ground.inbound': 'rg-job-1',
        }
        return {
          job: {
            id: idByQueue[item.queueName] ?? 'flow-job-1',
            queueName: item.queueName,
          },
          children: item.children?.map((child) => toResult(child as {
            queueName: string
            children?: unknown[]
          })),
        }
      }
      return toResult(node)
    }
    async close() {
      return undefined
    }
  },
  QueueEvents: class {
    async waitUntilReady() {
      return waitUntilReady()
    }
    async close() {
      return queueEventsClose()
    }
  },
  Queue: class {},
}))

vi.mock('../../utils/import-progress-bus.js', () => ({
  publishImportProgress: (...args: unknown[]) => publishImportProgress(...args),
}))

vi.mock('../../services/auth/index.js', () => ({
  f8TokenAuth: {
    getAccessToken: (...args: unknown[]) => getAccessToken(...args),
  },
}))

vi.mock('../../services/connector/index.js', () => ({
  connectorConfigService: {
    getConfig: (...args: unknown[]) => getConfig(...args),
  },
}))

vi.mock('../../utils/json-store.js', () => ({
  saveRawJson: (...args: unknown[]) => saveRawJson(...args),
  getNextBatchDir: vi.fn().mockResolvedValue('/tmp/raw-batch'),
}))

vi.mock('../../utils/rejection-store.js', () => ({
  saveRejectedRecords: (...args: unknown[]) => saveRejectedRecords(...args),
}))

vi.mock('../../utils/db-lookup.js', () => ({
  loadCrewSet: (...args: unknown[]) => loadCrewSet(...args),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

const crewAdd = vi.fn().mockResolvedValue(mockJob('crew-job-1'))
const flightAdd = vi.fn().mockResolvedValue(mockJob('flight-job-1'))
const pairingAdd = vi.fn().mockResolvedValue(mockJob('pairing-job-1'))
const rosterAdd = vi.fn().mockResolvedValue(mockJob('roster-job-1'))
const rosterGroundAdd = vi.fn().mockResolvedValue(mockJob('rg-job-1'))
const mandayAdd = vi.fn().mockResolvedValue(mockJob('manday-job-1'))
const getJob = vi.fn(async (id: string) => mockJob(id))

const mockFastify = {
  db: {},
  queues: {
    crewInbound: { add: crewAdd },
    flightInbound: { add: flightAdd, getJob },
    pairingInbound: { add: pairingAdd, getJob },
    rosterInbound: { add: rosterAdd, getJob },
    rosterGroundInbound: { add: rosterGroundAdd, getJob },
    mandayInbound: { add: mandayAdd },
  },
}

const crewConfig = {
  id: 1,
  connectorCode: 'f8-crew',
  connectorName: 'F8 Crew',
  direction: 'inbound',
  protocol: 'f8_import',
  dataDomain: 'crew',
  authType: 'f8_token',
  authConfig: {},
  endpointConfig: {
    url: 'https://api.example.com/crew',
    chunkDays: 30,
  },
  scheduleCron: null,
  transformPlugin: null,
  isEnabled: 1,
  isDeleted: 0,
  createdBy: 'test',
  createdAt: new Date(),
  updatedBy: 'test',
  updatedAt: new Date(),
}

describe('runF8ImportSync import progress stages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publishImportProgress.mockResolvedValue(undefined)
    getAccessToken.mockResolvedValue('test-token')
    getConfig.mockResolvedValue(null)
    flowAdd.mockReset()
    queueEventsClose.mockClear()
    waitUntilReady.mockClear()
    waitUntilFinished.mockClear()
    getJob.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })
    crewAdd.mockResolvedValue(mockJob('crew-job-1'))
    flightAdd.mockResolvedValue(mockJob('flight-job-1'))
  })

  it('emits ordered crew stages and returns queueJobs when importId is set', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')

    const result = await runF8ImportSync(
      mockFastify as never,
      crewConfig as never,
      '2026-03-01',
      '2026-03-05',
      { crew: true },
      'import-abc',
    )

    expect(result.queueJobs).toEqual([
      {
        material: 'crew',
        queueName: withBullmqPrefix('connector.crew.inbound'),
        jobId: 'crew-job-1',
      },
    ])
    expect(result.timings).toHaveLength(1)
    expect(result.timings[0]).toMatchObject({
      material: 'crew',
      recordsIn: 0,
      recordsOut: 0,
      rejected: 0,
    })
    expect(result.timings[0]?.fetchMs).toBeGreaterThanOrEqual(0)
    expect(result.timings[0]?.transformMs).toBeGreaterThanOrEqual(0)
    expect(result.timings[0]?.enqueueMs).toBeGreaterThanOrEqual(0)

    expect(flowAdd).not.toHaveBeenCalled()
    expect(crewAdd).toHaveBeenCalledOnce()
    const jobPayload = (crewAdd.mock.calls[0][1] as {
      importId?: string
      syncId: string
      records: unknown[]
    })
    expect(jobPayload.importId).toBe('import-abc')
    expect(jobPayload.records).toEqual([])

    const stageEvents = publishImportProgress.mock.calls.map(
      (call) => call[0] as {
        type: string
        material: string
        stage: string
        status: string
        recordsIn?: number
        recordsOut?: number
      },
    )

    expect(stageEvents.every((e) => e.type === 'stage')).toBe(true)
    expect(stageEvents.map((e) => `${e.material}:${e.stage}:${e.status}`)).toEqual([
      'crew:fetch:running',
      'crew:fetch:done',
      'crew:transform:running',
      'crew:transform:done',
      'crew:enqueue:running',
      'crew:enqueue:done',
    ])
    expect(stageEvents[1]?.recordsIn).toBe(0)
    expect(stageEvents[3]?.recordsOut).toBe(0)
  })

  it('does not publish stage events when importId is omitted', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')

    const result = await runF8ImportSync(
      mockFastify as never,
      crewConfig as never,
      '2026-03-01',
      '2026-03-05',
      { crew: true },
    )

    expect(publishImportProgress).not.toHaveBeenCalled()
    expect(result.queueJobs).toEqual([
      {
        material: 'crew',
        queueName: withBullmqPrefix('connector.crew.inbound'),
        jobId: 'crew-job-1',
      },
    ])
    expect(result.timings).toHaveLength(1)

    expect(crewAdd).toHaveBeenCalledOnce()
    const jobPayload = crewAdd.mock.calls[0][1] as { importId?: string }
    expect(jobPayload.importId).toBeUndefined()
  })

  it('fetches date chunks concurrently while preserving import flow order', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')
    let activeFetches = 0
    let maxActiveFetches = 0
    mockFetch.mockImplementation(async () => {
      activeFetches += 1
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
      await new Promise((resolve) => setTimeout(resolve, 20))
      activeFetches -= 1
      return {
        ok: true,
        status: 200,
        json: async () => [],
      }
    })

    await runF8ImportSync(
      mockFastify as never,
      {
        ...crewConfig,
        endpointConfig: { ...crewConfig.endpointConfig, chunkDays: 6 },
      } as never,
      '2026-03-01',
      '2026-03-30',
      { crew: true },
      'import-concurrent',
    )

    expect(mockFetch).toHaveBeenCalledTimes(5)
    expect(maxActiveFetches).toBeGreaterThan(1)
    expect(publishImportProgress.mock.calls.map((call) => {
      const event = call[0] as { material: string; stage: string; status: string }
      return `${event.material}:${event.stage}:${event.status}`
    })).toEqual([
      'crew:fetch:running',
      'crew:fetch:done',
      'crew:transform:running',
      'crew:transform:done',
      'crew:enqueue:running',
      'crew:enqueue:done',
    ])
  })

  it('uses an exclusive upstream end date for pairing chunks', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')

    await runF8ImportSync(
      mockFastify as never,
      {
        ...crewConfig,
        connectorCode: 'f8-pairing',
        dataDomain: 'roster',
        endpointConfig: {
          url: 'https://api.example.com/pairing',
          chunkDays: 10,
        },
      } as never,
      '2026-09-01',
      '2026-09-30',
      { pairing: true },
      'import-pairing-boundary',
    )

    const bodies = mockFetch.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as {
      startDt: string
      endDt: string
    })
    expect(bodies).toEqual([
      { startDt: '2026-09-01', endDt: '2026-09-11' },
      { startDt: '2026-09-11', endDt: '2026-09-21' },
      { startDt: '2026-09-21', endDt: '2026-10-01' },
    ])
  })

  it('fetches rosterGround through the day after period end with bounded concurrency', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')
    loadCrewSet.mockResolvedValueOnce(new Set(['1']))
    let activeFetches = 0
    let maxActiveFetches = 0
    mockFetch.mockImplementation(async (_url, init) => {
      activeFetches += 1
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
      await new Promise((resolve) => setTimeout(resolve, 10))
      activeFetches -= 1
      const body = JSON.parse(String(init?.body)) as {
        startDt: string
        endDt: string
        assignment: string
      }
      const data = body.assignment === 'DayOff' && body.startDt === '2026-08-31'
        ? [
          {
            crewId: '1',
            owner: 'F8',
            division: 'P',
            label: 'GDO',
            assignmentGroup: 'GRD',
            assignment: 'DayOff',
            startTimeUtc: '2026-08-31 04:00:00',
            endTimeUtc: '2026-09-01 04:00:00',
            location: 'YYZ',
            startLocation: 'YYZ',
            endLocation: 'YYZ',
            credit: 0,
          },
          {
            crewId: '1',
            owner: 'F8',
            division: 'P',
            label: 'GDO',
            assignmentGroup: 'GRD',
            assignment: 'DayOff',
            startTimeUtc: '2026-09-01 04:00:00',
            endTimeUtc: '2026-09-02 04:00:00',
            location: 'YYZ',
            startLocation: 'YYZ',
            endLocation: 'YYZ',
            credit: 0,
          },
        ]
        : body.assignment === 'Transport' && body.startDt === '2026-08-31'
          ? [{
            crewId: '1',
            owner: 'F8',
            division: 'P',
            label: 'AC415',
            assignmentGroup: 'GRD',
            assignment: 'Transport',
            pairingId: 112019,
            fltId: 2733285,
            startTimeUtc: '2026-08-31 18:10:00',
            endTimeUtc: '2026-08-31 19:38:00',
            location: 'YUL',
            startLocation: 'YUL',
            endLocation: 'YYZ',
            credit: 240,
          }]
        : []
      return {
        ok: true,
        status: 200,
        json: async () => data,
      }
    })

    await runF8ImportSync(
      mockFastify as never,
      {
        ...crewConfig,
        dataDomain: 'roster',
        endpointConfig: {
          url: 'https://api.example.com/roster',
          rosterGroundUrl: 'https://api.example.com/roster-ground',
          rosterGroundConcurrency: 3,
        },
      } as never,
      '2026-08-01',
      '2026-08-31',
      { rosterGround: true },
      'import-rg',
    )

    const bodies = mockFetch.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as {
      startDt: string
      endDt: string
      assignment: string
    })
    expect(bodies).toHaveLength(72)
    expect(bodies).toContainEqual({
      startDt: '2026-08-31',
      endDt: '2026-09-01',
      assignment: 'DayOff',
    })
    expect(bodies).toContainEqual({
      startDt: '2026-08-31',
      endDt: '2026-09-01',
      assignment: 'Reserve',
    })
    expect(maxActiveFetches).toBeGreaterThan(1)
    expect(maxActiveFetches).toBeLessThanOrEqual(3)
    expect(flowAdd).not.toHaveBeenCalled()
    expect(rosterGroundAdd).toHaveBeenCalledOnce()
    const jobPayload = rosterGroundAdd.mock.calls[0][1] as {
      groundRecords: Array<{ crewId: string; strDtUtc: string }>
      filteredCount: number
    }
    expect(jobPayload.groundRecords).toHaveLength(1)
    expect(jobPayload.groundRecords[0]).toMatchObject({
      crewId: '1',
      strDtUtc: '2026-08-31T04:00:00.000Z',
    })
    expect(jobPayload.filteredCount).toBe(1)
  })

  it('starts flight write before enqueueing dependent pairing then roster writes', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')
    loadCrewSet.mockResolvedValueOnce(new Set<string>())

    await runF8ImportSync(
      mockFastify as never,
      {
        ...crewConfig,
        dataDomain: 'roster',
        endpointConfig: {
          url: 'https://api.example.com/roster',
          chunkDays: 30,
        },
      } as never,
      '2026-08-01',
      '2026-08-31',
      { flight: true, pairing: true, roster: true },
      'import-ordered',
    )

    expect(flowAdd).toHaveBeenCalledOnce()
    expect(flightAdd).toHaveBeenCalledOnce()
    expect(rosterAdd).toHaveBeenCalledOnce()
    const flowNode = flowAdd.mock.calls[0][0] as {
      queueName: string
      children?: Array<{
        queueName: string
        children?: Array<{
          queueName: string
        }>
      }>
    }
    expect(flowNode.queueName).toBe(withBullmqPrefix('connector.pairing.inbound'))
    expect(flowNode.children).toBeUndefined()
  })

  it('marks roster recompute deferred when rosterGround is in the same batch', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')
    loadCrewSet.mockResolvedValueOnce(new Set(['1']))
    mockFetch.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { startDt: string; endDt: string; assignment?: string }
      if (body.assignment) return { ok: true, status: 200, json: async () => [] }
      return { ok: true, status: 200, json: async () => [] }
    })

    await runF8ImportSync(
      mockFastify as never,
      {
        ...crewConfig,
        dataDomain: 'roster',
        endpointConfig: {
          url: 'https://api.example.com/roster',
          rosterGroundUrl: 'https://api.example.com/roster-ground',
        },
      } as never,
      '2026-08-01',
      '2026-08-31',
      { roster: true, rosterGround: true },
      'import-roster-ground',
    )

    expect(rosterAdd).toHaveBeenCalledOnce()
    const rosterPayload = rosterAdd.mock.calls[0][1] as { deferMandayRecompute?: boolean }
    expect(rosterPayload.deferMandayRecompute).toBe(true)
  })

  it('emits fail stage and rethrows when crew enqueue fails', async () => {
    const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')
    crewAdd.mockRejectedValueOnce(new Error('queue unavailable'))

    await expect(
      runF8ImportSync(
        mockFastify as never,
        crewConfig as never,
        '2026-03-01',
        '2026-03-05',
        { crew: true },
        'import-fail',
      ),
    ).rejects.toThrow(/queue unavailable/)

    const failEvents = publishImportProgress.mock.calls
      .map((call) => call[0] as { status: string; message?: string; material: string })
      .filter((e) => e.status === 'fail')

    expect(failEvents).toHaveLength(1)
    expect(failEvents[0]?.material).toBe('crew')
    expect(failEvents[0]?.message).toMatch(/queue unavailable/)
  })
})
