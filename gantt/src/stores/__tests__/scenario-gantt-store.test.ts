import { describe, it, expect, afterEach, vi } from 'vitest'
import { getScenarioGanttStore, destroyScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { xToTime, yearMonthInTimeZone } from '@/components/gantt/gantt-utils'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import { notify } from '@/utils/notify'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

vi.mock('@/services/scenario-gantt-api', () => ({
  scenarioGanttApi: {
    getGanttData: vi.fn(),
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    getLockStatus: vi.fn(),
    keepaliveLock: vi.fn(),
    patchOutput: vi.fn(),
  },
}))

vi.mock('@/utils/notify', () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

describe('scenario-gantt-store zoomToMonth', () => {
  const scenarioId = 991_100

  afterEach(() => {
    destroyScenarioGanttStore(scenarioId)
    vi.clearAllMocks()
  })

  it('uses the measured Scenario TimeAxis viewport width like Live', () => {
    useTimezoneStore.setState({ timezone: 'UTC', timezoneAirport: 'UTC' })
    const store = getScenarioGanttStore(scenarioId)
    store.setState({ zoomMin: 0.1, zoomMax: 10_000, leftPanelWidth: 210 })

    const rangeStart = new Date('2026-03-01T00:00:00.000Z')
    store.getState().zoomToMonth(2026, 2, rangeStart, 1000)

    const marchHours = (Date.parse('2026-04-01T00:00:00.000Z') - Date.parse('2026-03-01T00:01:00.000Z')) / 3_600_000
    expect(store.getState().pxPerHour).toBeCloseTo(1000 / marchHours, 6)
    expect(store.getState().scrollX).toBeCloseTo((1 / 60) * store.getState().pxPerHour, 6)
  })

  it('anchors zoomed month inside the target month for header stats', () => {
    useTimezoneStore.setState({ timezone: 'UTC', timezoneAirport: 'UTC' })
    const store = getScenarioGanttStore(scenarioId)
    store.setState({
      data: {
        strDtLoc: '2026-07-01T00:00:00.000Z',
        endDtLoc: '2026-08-31T23:59:59.000Z',
      } as ScenarioGanttData,
      zoomMin: 0.1,
      zoomMax: 10_000,
      viewportWidth: 1000,
    })

    const rangeStart = new Date('2026-07-01T00:00:00.000Z')
    store.getState().zoomToMonth(2026, 7, rangeStart, 1000)
    const state = store.getState()

    expect(yearMonthInTimeZone(xToTime(state.scrollX, rangeStart, state.pxPerHour), 'UTC')).toBe('2026-08')
  })

  it('clamps horizontal scroll at the scenario content right edge', () => {
    const store = getScenarioGanttStore(scenarioId)
    store.setState({
      data: {
        strDtLoc: '2026-03-01T00:00:00.000Z',
        endDtLoc: '2026-03-03T00:00:00.000Z',
      } as ScenarioGanttData,
      pxPerHour: 10,
      viewportWidth: 100,
    })

    store.getState().setScrollX(9_999)

    expect(store.getState().scrollX).toBe(380)
  })

  it('zooms to the loaded intersection while keeping the complete loaded range scrollable', () => {
    const store = getScenarioGanttStore(scenarioId)
    store.setState({
      data: {
        strDtLoc: '2026-06-24T00:00:00.000Z',
        endDtLoc: '2026-08-07T23:59:59.999Z',
      } as ScenarioGanttData,
      zoomMin: 0.1,
      zoomMax: 10_000,
      viewportWidth: 1000,
      scrollWindowStartX: 0,
      scrollWindowEndX: null,
    })
    const rangeStart = new Date('2026-06-24T00:00:00.000Z')
    const rpStart = Date.parse('2026-07-01T00:00:00.000Z')
    const rpEnd = Date.parse('2026-07-31T23:59:59.999Z')

    store.getState().zoomToRp(rpStart, rpEnd, rangeStart, 1000)
    const state = store.getState()
    const rpStartScrollX = ((rpStart - rangeStart.getTime()) / 3_600_000) * state.pxPerHour
    const loadedEndX = ((Date.parse('2026-08-07T23:59:59.999Z') - rangeStart.getTime()) / 3_600_000) * state.pxPerHour
    expect(state.scrollX).toBeCloseTo(rpStartScrollX, 4)
    expect(state.scrollWindowStartX).toBe(0)
    expect(state.scrollWindowEndX).toBeCloseTo(loadedEndX, 4)

    store.getState().setScrollX(0)
    expect(store.getState().scrollX).toBe(0)
  })

  it('opens RP07 at its own left edge instead of the padded scenario range start', () => {
    const store = getScenarioGanttStore(scenarioId)
    store.setState({
      data: {
        strDtLoc: '2026-06-24T00:00:00.000Z',
        endDtLoc: '2026-08-07T23:59:59.999Z',
      } as ScenarioGanttData,
      zoomMin: 0.1,
      zoomMax: 10_000,
      viewportWidth: 1000,
      scrollWindowStartX: 0,
      scrollWindowEndX: null,
    })
    const rangeStart = new Date('2026-06-24T00:00:00.000Z')

    store.getState().zoomToRp(
      Date.parse('2026-07-01T00:00:00.000Z'),
      Date.parse('2026-07-31T23:59:59.999Z'),
      rangeStart,
      1000,
    )

    const state = store.getState()
    const visibleStartMs = rangeStart.getTime() + (state.scrollX / state.pxPerHour) * 3_600_000
    const visibleEndMs = visibleStartMs + (1000 / state.pxPerHour) * 3_600_000
    expect(new Date(visibleStartMs).toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(new Date(visibleEndMs).toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(state.scrollX).toBeGreaterThan(state.scrollWindowStartX)
  })

  it('allows manual timeline zoom to clear stale RP pixel bounds', () => {
    const store = getScenarioGanttStore(scenarioId)
    store.setState({
      data: {
        strDtLoc: '2026-06-24T00:00:00.000Z',
        endDtLoc: '2026-08-07T23:59:59.999Z',
      } as ScenarioGanttData,
      zoomMin: 0.1,
      zoomMax: 10_000,
      viewportWidth: 1000,
      scrollWindowStartX: 0,
      scrollWindowEndX: null,
    })
    const rangeStart = new Date('2026-06-24T00:00:00.000Z')
    store.getState().zoomToRp(
      Date.parse('2026-07-01T00:00:00.000Z'),
      Date.parse('2026-07-31T23:59:59.999Z'),
      rangeStart,
      1000,
    )

    const afterRp = store.getState()
    expect(afterRp.scrollWindowEndX).not.toBeNull()
    store.setState({
      pxPerHour: afterRp.pxPerHour * 2,
      scrollX: afterRp.scrollX * 2,
      scrollWindowStartX: 0,
      scrollWindowEndX: null,
    })

    const state = store.getState()
    expect(state.scrollWindowStartX).toBe(0)
    expect(state.scrollWindowEndX).toBeNull()
    expect(state.scrollX).toBeGreaterThan(0)
  })

  it('increments the data revision when loaded data is replaced', async () => {
    const store = getScenarioGanttStore(scenarioId)
    const before = store.getState().dataRevision
    const data = {
      strDtLoc: '2026-07-01T00:00:00.000Z',
      endDtLoc: '2026-07-31T23:59:59.000Z',
    } as ScenarioGanttData

    const { scenarioGanttApi } = await import('@/services/scenario-gantt-api')
    const getGanttData = vi.spyOn(scenarioGanttApi, 'getGanttData').mockResolvedValue(data)
    await store.getState().loadData()

    expect(store.getState().dataRevision).toBe(before + 1)
    getGanttData.mockRestore()
  })

  it('keeps current and historical versions in separate store instances', () => {
    const current = getScenarioGanttStore(scenarioId, undefined)
    const historical = getScenarioGanttStore(scenarioId, 'v0')
    current.setState({ scrollX: 11 })
    historical.setState({ scrollX: 22 })

    expect(current).not.toBe(historical)
    expect(current.getState().scrollX).toBe(11)
    expect(historical.getState().scrollX).toBe(22)

    destroyScenarioGanttStore(scenarioId, 'v0')
    expect(getScenarioGanttStore(scenarioId, 'v0')).not.toBe(historical)
  })

  it('acquires the edit lock without showing a success notification', async () => {
    vi.mocked(scenarioGanttApi.acquireLock).mockResolvedValue({ acquired: true })
    vi.mocked(scenarioGanttApi.getLockStatus).mockResolvedValue({
      locked: true,
      owner: 'tester',
      ttl: 600,
      isOwner: true,
    })

    const store = getScenarioGanttStore(scenarioId)
    await store.getState().acquireLock(scenarioId)

    expect(store.getState().lockStatus).toEqual({
      locked: true,
      owner: 'tester',
      ttl: 600,
      isOwner: true,
    })
    expect(store.getState().acquiringLock).toBe(false)
    expect(notify.success).not.toHaveBeenCalled()
  })

  it('releases the edit lock without showing a success notification', async () => {
    vi.mocked(scenarioGanttApi.releaseLock).mockResolvedValue()

    const store = getScenarioGanttStore(scenarioId)
    store.setState({
      lockStatus: {
        locked: true,
        owner: 'tester',
        ttl: 600,
        isOwner: true,
      },
      pendingChanges: [{ op: 'remove', crewId: 'C1', pairingId: 101 }],
      redoStack: [{ op: 'add', crewId: 'C2', pairingId: 102 }],
      isDirty: true,
    })

    await store.getState().releaseLock(scenarioId)

    expect(store.getState().lockStatus).toEqual({
      locked: false,
      owner: null,
      ttl: null,
      isOwner: false,
    })
    expect(store.getState().pendingChanges).toEqual([])
    expect(store.getState().redoStack).toEqual([])
    expect(store.getState().isDirty).toBe(false)
    expect(notify.success).not.toHaveBeenCalled()
  })
})
