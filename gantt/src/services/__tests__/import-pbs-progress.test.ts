import { describe, expect, it } from 'vitest'
import {
  applyImportProgressEvent,
  createInitialProgress,
  type ImportMaterial,
  type ImportProgressEvent,
  type ImportStage,
} from '../import-pbs-progress'

const materials: ImportMaterial[] = ['crew', 'flight']

const stageEvent = (
  material: ImportMaterial,
  stage: ImportStage,
  status: 'running' | 'done' | 'fail' = 'done',
  message?: string,
): ImportProgressEvent => ({
  type: 'stage',
  importId: 'imp-1',
  material,
  stage,
  status,
  message,
  at: '2026-07-15T00:00:00.000Z',
})

describe('import-pbs-progress reducer', () => {
  it('stays on fetch until all materials finish fetch', () => {
    let state = createInitialProgress(materials)
    expect(state.headline).toBe('fetch')
    expect(state.percent).toBe(0)
    expect(state.status).toBe('running')

    state = applyImportProgressEvent(state, stageEvent('crew', 'fetch'))
    expect(state.headline).toBe('fetch')
    expect(state.done.crew?.fetch).toBe(true)
    expect(state.done.flight?.fetch).toBeUndefined()
  })

  it('moves to transform when all fetches done', () => {
    let state = createInitialProgress(materials)
    state = applyImportProgressEvent(state, stageEvent('crew', 'fetch'))
    state = applyImportProgressEvent(state, stageEvent('flight', 'fetch'))

    expect(state.headline).toBe('transform')
    expect(state.percent).toBe(Math.floor((100 * 2) / 8))
  })

  it('maps enqueue/write incomplete to write headline', () => {
    let state = createInitialProgress(['crew'])
    state = applyImportProgressEvent(state, stageEvent('crew', 'fetch'))
    state = applyImportProgressEvent(state, stageEvent('crew', 'transform'))

    expect(state.headline).toBe('write')

    state = applyImportProgressEvent(state, stageEvent('crew', 'enqueue'))
    expect(state.headline).toBe('write')
    expect(state.done.crew?.enqueue).toBe(true)
    expect(state.done.crew?.write).toBeUndefined()
  })

  it('caps at 99 until complete then 100', () => {
    let state = createInitialProgress(['crew'])
    for (const stage of ['fetch', 'transform', 'enqueue', 'write'] as const) {
      state = applyImportProgressEvent(state, stageEvent('crew', stage))
    }
    expect(state.percent).toBe(99)
    expect(state.status).toBe('running')

    state = applyImportProgressEvent(state, {
      type: 'complete',
      importId: 'imp-1',
      result: { rosterPeriodId: 6, results: [] },
      at: '2026-07-15T00:00:01.000Z',
    })
    expect(state.percent).toBe(100)
    expect(state.status).toBe('complete')
    expect(state.headline).toBe('write')
    expect(state.result).toEqual({ rosterPeriodId: 6, results: [] })
  })

  it('handles error event', () => {
    let state = createInitialProgress(['crew'])
    state = applyImportProgressEvent(state, stageEvent('crew', 'fetch'))
    state = applyImportProgressEvent(state, {
      type: 'error',
      importId: 'imp-1',
      message: 'connector down',
      at: '2026-07-15T00:00:02.000Z',
    })

    expect(state.status).toBe('error')
    expect(state.errorMessage).toBe('connector down')
  })

  it('marks stage fail as error', () => {
    let state = createInitialProgress(['crew'])
    state = applyImportProgressEvent(
      state,
      stageEvent('crew', 'fetch', 'fail', 'NOC timeout'),
    )
    expect(state.status).toBe('error')
    expect(state.errorMessage).toBe('NOC timeout')
  })

  it('started resets materials and status to running', () => {
    let state = createInitialProgress(['crew'])
    state = applyImportProgressEvent(state, stageEvent('crew', 'fetch'))
    state = applyImportProgressEvent(state, {
      type: 'started',
      importId: 'imp-2',
      rosterPeriodId: 7,
      rosterPeriod: '2026-07',
      startDt: '2026-07-01',
      endDt: '2026-07-31',
      materials: ['flight', 'pairing'],
      at: '2026-07-15T00:00:03.000Z',
    })

    expect(state.status).toBe('running')
    expect(state.materials).toEqual(['flight', 'pairing'])
    expect(state.done.crew).toBeUndefined()
    expect(state.done.flight).toEqual({})
    expect(state.headline).toBe('fetch')
    expect(state.percent).toBe(0)
  })

  it('reconstructs write progress from replayed SSE history', () => {
    let state = createInitialProgress(['crew'])
    const history: ImportProgressEvent[] = [
      {
        type: 'started',
        importId: 'imp-1',
        rosterPeriodId: 6,
        rosterPeriod: '2026-06',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        materials: ['crew'],
        at: '2026-07-15T00:00:00.000Z',
      },
      stageEvent('crew', 'fetch'),
      stageEvent('crew', 'transform'),
      stageEvent('crew', 'enqueue'),
      {
        type: 'stage',
        importId: 'imp-1',
        material: 'crew',
        stage: 'write',
        status: 'running',
        processed: 50,
        total: 100,
        at: '2026-07-15T00:00:04.000Z',
      },
    ]

    for (const event of history) {
      state = applyImportProgressEvent(state, event)
    }

    expect(state.headline).toBe('write')
    expect(state.percent).toBe(Math.floor((100 * 3.5) / 4))
    expect(state.current.crew?.write?.processed).toBe(50)
    expect(state.current.crew?.write?.total).toBe(100)
  })

  it('infers non-zero duration for terminal stage events without prior running events', () => {
    let state = createInitialProgress(['crew'])
    state = applyImportProgressEvent(state, {
      type: 'started',
      importId: 'imp-1',
      rosterPeriodId: 6,
      rosterPeriod: '2026-06',
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      materials: ['crew'],
      at: '2026-07-15T00:00:00.000Z',
    })
    state = applyImportProgressEvent(state, {
      type: 'stage',
      importId: 'imp-1',
      material: 'crew',
      stage: 'fetch',
      status: 'done',
      at: '2026-07-15T00:00:02.000Z',
    })
    state = applyImportProgressEvent(state, {
      type: 'stage',
      importId: 'imp-1',
      material: 'crew',
      stage: 'transform',
      status: 'done',
      at: '2026-07-15T00:00:05.000Z',
    })
    state = applyImportProgressEvent(state, {
      type: 'stage',
      importId: 'imp-1',
      material: 'crew',
      stage: 'enqueue',
      status: 'done',
      at: '2026-07-15T00:00:06.000Z',
    })

    expect(state.current.crew?.fetch?.startedAt).toBe('2026-07-15T00:00:00.000Z')
    expect(state.current.crew?.fetch?.finishedAt).toBe('2026-07-15T00:00:02.000Z')
    expect(state.current.crew?.transform?.startedAt).toBe('2026-07-15T00:00:02.000Z')
    expect(state.current.crew?.transform?.finishedAt).toBe('2026-07-15T00:00:05.000Z')
    expect(state.current.crew?.enqueue?.startedAt).toBe('2026-07-15T00:00:05.000Z')
    expect(state.current.crew?.enqueue?.finishedAt).toBe('2026-07-15T00:00:06.000Z')
  })
})
