import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IMPORT_PBS_MATERIAL_TIMEOUT_MS,
  importPbsMaterial,
  startImportPbsMaterial,
  subscribeImportPbsMaterialProgress,
} from '../import-pbs-material-api'
import { api } from '../api'
import type { ImportProgressEvent } from '../import-pbs-progress'

vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: {
      baseURL: 'http://live.test',
      headers: {
        common: {
          Authorization: 'Bearer test-token',
        },
      },
    },
  },
}))

const completeResult = {
  rosterPeriodId: 6,
  rosterPeriod: '2026-06',
  startDt: '2026-06-01',
  endDt: '2026-06-30',
  results: [{
    connectorCode: 'f8-crew',
    syncId: 'sync-crew-1',
    filteredCount: 0,
    rejectionFile: null,
    status: 'success' as const,
  }],
  materialStats: [{
    material: 'crew' as const,
    status: 'success' as const,
    added: 1,
    updated: 2,
    deleted: 0,
    success: 3,
    failed: 0,
    skipped: 0,
    rejected: 0,
    recordsIn: 3,
    recordsOut: 3,
    warnings: [],
    errors: [],
    timings: {
      fetchMs: 100,
      transformMs: 50,
      enqueueMs: 10,
      databaseMs: 200,
      totalMs: 360,
    },
  }],
}

const startResult = {
  importId: 'import-uuid-1',
  rosterPeriodId: 6,
  rosterPeriod: '2026-06',
  startDt: '2026-06-01',
  endDt: '2026-06-30',
  materials: ['crew'] as const,
}

const ssePayload = (events: ImportProgressEvent[]): string =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')

const mockSseFetch = (body: string): void => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    }),
  )
}

describe('importPbsMaterial API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('startImportPbsMaterial posts with a long timeout so crew-only import is not aborted at 30s', async () => {
    vi.mocked(api.post).mockResolvedValue(startResult)

    const input = {
      rosterPeriodId: 6,
      scope: {
        flight: false,
        pairing: false,
        roster: false,
        rosterGround: false,
        crew: true,
      },
    }

    const result = await startImportPbsMaterial(input)

    expect(api.post).toHaveBeenCalledWith(
      '/api/scenario/import-pbs-material',
      input,
      { timeout: IMPORT_PBS_MATERIAL_TIMEOUT_MS },
    )
    expect(IMPORT_PBS_MATERIAL_TIMEOUT_MS).toBe(30 * 60 * 1000)
    expect(IMPORT_PBS_MATERIAL_TIMEOUT_MS).toBeGreaterThan(30_000)
    expect(result.importId).toBe('import-uuid-1')
    expect(result.materials).toEqual(['crew'])
  })

  it('subscribeImportPbsMaterialProgress streams SSE events with Bearer auth', async () => {
    const stage: ImportProgressEvent = {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'fetch',
      status: 'running',
      processed: 12,
      at: '2026-07-15T00:00:00.000Z',
    }
    const complete: ImportProgressEvent = {
      type: 'complete',
      importId: 'import-uuid-1',
      result: completeResult,
      at: '2026-07-15T00:00:01.000Z',
    }
    mockSseFetch(ssePayload([stage, complete]))

    const onEvent = vi.fn()
    await subscribeImportPbsMaterialProgress('import-uuid-1', onEvent)

    expect(fetch).toHaveBeenCalledWith(
      'http://live.test/api/scenario/import-pbs-material/import-uuid-1/events',
      expect.objectContaining({
        headers: {
          Accept: 'text/event-stream',
          Authorization: 'Bearer test-token',
        },
      }),
    )
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent.mock.calls[0]?.[0]).toEqual(stage)
    expect(onEvent.mock.calls[1]?.[0]).toEqual(complete)
  })

  it('importPbsMaterial resolves with complete result and reports progress', async () => {
    vi.mocked(api.post).mockResolvedValue(startResult)

    const stage: ImportProgressEvent = {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'fetch',
      status: 'running',
      processed: 12,
      at: '2026-07-15T00:00:00.000Z',
    }
    const complete: ImportProgressEvent = {
      type: 'complete',
      importId: 'import-uuid-1',
      result: completeResult,
      at: '2026-07-15T00:00:01.000Z',
    }
    mockSseFetch(ssePayload([stage, complete]))

    const onProgress = vi.fn()
    const input = {
      rosterPeriodId: 6,
      scope: {
        flight: false,
        pairing: false,
        roster: false,
        rosterGround: false,
        crew: true,
      },
    }

    const result = await importPbsMaterial(input, onProgress)

    expect(api.post).toHaveBeenCalledWith(
      '/api/scenario/import-pbs-material',
      input,
      { timeout: IMPORT_PBS_MATERIAL_TIMEOUT_MS },
    )
    expect(result).toEqual(completeResult)
    expect(result.rosterPeriodId).toBe(6)
    expect(result.results[0]?.connectorCode).toBe('f8-crew')
    expect(onProgress).toHaveBeenCalled()
    expect(onProgress.mock.calls[0]?.[0]).toMatchObject({
      materials: ['crew'],
      status: 'running',
      percent: 0,
    })
    expect(onProgress.mock.calls[1]?.[0]).toMatchObject({
      status: 'running',
      current: {
        crew: {
          fetch: {
            status: 'running',
            processed: 12,
          },
        },
      },
    })
    const lastState = onProgress.mock.calls.at(-1)?.[0]
    expect(lastState).toMatchObject({
      status: 'complete',
      percent: 100,
      result: completeResult,
    })
  })

  it('importPbsMaterial rejects on error event', async () => {
    vi.mocked(api.post).mockResolvedValue(startResult)
    mockSseFetch(ssePayload([{
      type: 'error',
      importId: 'import-uuid-1',
      message: 'connector failed',
      at: '2026-07-15T00:00:02.000Z',
    }]))

    await expect(
      importPbsMaterial({
        rosterPeriodId: 6,
        scope: {
          flight: false,
          pairing: false,
          roster: false,
          rosterGround: false,
          crew: true,
        },
      }),
    ).rejects.toThrow('connector failed')
  })
})
