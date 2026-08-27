import { describe, it, expect, beforeEach } from 'vitest'
import { useGanttViewStore } from '../gantt-view-store'

describe('gantt-view-store zoomToRp', () => {
  beforeEach(() => {
    useGanttViewStore.setState({
      pxPerHour: 10,
      scrollX: 0,
      zoomMin: 7,
      zoomMax: 50,
      contentHours: 24 * 365,
      viewportWidth: 1000,
      scrollWindowStartX: 0,
      scrollWindowEndX: null,
    })
  })

  it('anchors the RP at the left edge and fills width (clamped to zoomMin)', () => {
    const rangeStart = new Date(Date.UTC(2026, 0, 1))
    const rpStart = Date.UTC(2026, 2, 2)             // 2026-03-02
    const rpEnd = Date.UTC(2026, 2, 31, 23, 59, 59)  // 2026-03-31 end-of-day
    useGanttViewStore.getState().zoomToRp(rpStart, rpEnd, rangeStart, 1000)

    const { pxPerHour, scrollX } = useGanttViewStore.getState()
    const anchorMs = rpStart
    const hours = (rpEnd - anchorMs) / 3_600_000
    const expectedPx = Math.max(7, Math.min(50, 1000 / hours))
    expect(pxPerHour).toBeCloseTo(expectedPx, 6)

    const offsetHours = (anchorMs - rangeStart.getTime()) / 3_600_000
    // contentHours is large → no max-scroll clamp → scrollX = offsetHours * pxPerHour
    expect(scrollX).toBeCloseTo(offsetHours * expectedPx, 4)
  })

  it('clamps to zoomMax when the RP window is very short', () => {
    const rangeStart = new Date(Date.UTC(2026, 0, 1))
    const rpStart = Date.UTC(2026, 2, 2)
    const rpEnd = rpStart + 3 * 3_600_000 // 3h window
    useGanttViewStore.getState().zoomToRp(rpStart, rpEnd, rangeStart, 1000)
    expect(useGanttViewStore.getState().pxPerHour).toBe(50)
  })

  it('marks the view dirty and bumps dirtyEpoch', () => {
    const before = useGanttViewStore.getState().dirtyEpoch
    useGanttViewStore.getState().zoomToRp(Date.UTC(2026, 2, 2), Date.UTC(2026, 2, 31), new Date(Date.UTC(2026, 0, 1)), 1000)
    const after = useGanttViewStore.getState()
    expect(after.dirty).toBe(true)
    expect(after.dirtyEpoch).toBe(before + 1)
  })

  it('zooms to a fully loaded RP while keeping the complete loaded range scrollable', () => {
    const rangeStart = new Date(Date.UTC(2026, 5, 24))
    const rpStart = Date.UTC(2026, 6, 1)
    const rpEnd = Date.UTC(2026, 6, 31, 23, 59, 59)
    useGanttViewStore.setState({ contentHours: 45 * 24 })

    useGanttViewStore.getState().zoomToRp(rpStart, rpEnd, rangeStart, 1000)
    const state = useGanttViewStore.getState()
    const rpStartScrollX = ((rpStart - rangeStart.getTime()) / 3_600_000) * state.pxPerHour
    const loadedEndX = 45 * 24 * state.pxPerHour
    expect(state.scrollX).toBeCloseTo(rpStartScrollX, 4)
    expect(state.scrollWindowStartX).toBe(0)
    expect(state.scrollWindowEndX).toBeCloseTo(loadedEndX, 4)

    useGanttViewStore.getState().setScrollX(0)
    expect(useGanttViewStore.getState().scrollX).toBe(0)
  })

  it('zooms to the loaded intersection for an RP before the loaded range', () => {
    const rangeStart = new Date(Date.UTC(2026, 5, 24))
    const rpStart = Date.UTC(2026, 5, 1)
    const rpEnd = Date.UTC(2026, 5, 30, 23, 59, 59)
    useGanttViewStore.setState({ contentHours: 45 * 24 })

    useGanttViewStore.getState().zoomToRp(rpStart, rpEnd, rangeStart, 1000)
    const state = useGanttViewStore.getState()
    expect(state.scrollX).toBe(0)
    expect(state.scrollWindowStartX).toBe(0)
    expect(state.scrollWindowEndX).toBeCloseTo(45 * 24 * state.pxPerHour, 4)
  })

  it('zooms to the loaded intersection for an RP after the loaded range', () => {
    const rangeStart = new Date(Date.UTC(2026, 5, 24))
    const rpStart = Date.UTC(2026, 7, 1)
    const rpEnd = Date.UTC(2026, 7, 31, 23, 59, 59)
    useGanttViewStore.setState({ contentHours: 45 * 24 })

    useGanttViewStore.getState().zoomToRp(rpStart, rpEnd, rangeStart, 1000)
    const state = useGanttViewStore.getState()
    const loadedStartToRp8 = 38 * 24 * state.pxPerHour
    expect(state.scrollX).toBeCloseTo(loadedStartToRp8, 4)
    expect(state.scrollWindowStartX).toBe(0)
    expect(state.scrollWindowEndX).toBeCloseTo(45 * 24 * state.pxPerHour, 4)
  })

  it('allows manual zoom to clear the RP navigation window without losing range scrollability', () => {
    const rangeStart = new Date(Date.UTC(2026, 5, 24))
    useGanttViewStore.getState().zoomToRp(
      Date.UTC(2026, 6, 1),
      Date.UTC(2026, 6, 31, 23, 59, 59),
      rangeStart,
      1000,
    )

    useGanttViewStore.setState((state) => ({
      pxPerHour: state.pxPerHour * 2,
      scrollX: state.scrollX,
      scrollWindowStartX: 0,
      scrollWindowEndX: null,
    }))

    const state = useGanttViewStore.getState()
    expect(state.scrollWindowStartX).toBe(0)
    expect(state.scrollWindowEndX).toBeNull()
    expect(state.scrollX).toBeGreaterThan(0)
  })
})
