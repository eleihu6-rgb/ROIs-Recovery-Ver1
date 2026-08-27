import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useLiveGanttSource } from '../live-gantt-source'
import { useGanttViewStore } from '@/stores/gantt-view-store'

describe('useLiveGanttSource', () => {
  beforeEach(() => {
    // Reset the real gantt-view-store fields used by the assertions.
    useGanttViewStore.setState({ scrollX: 0, dirty: true, dirtyEpoch: 0 })
  })

  it('useScrollX() reflects the live gantt-view-store scrollX', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let captured: number | null = null
    const Probe = () => {
      const src = useLiveGanttSource()
      captured = src.useScrollX()
      return null
    }

    act(() => {
      useGanttViewStore.setState({ scrollX: 123 })
      createRoot(container).render(React.createElement(Probe))
    })

    expect(captured).toBe(123)

    document.body.removeChild(container)
  })

  it('reports live read-only shape: mode, no reassign, no edit controller', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let capturedMode: string | undefined
    let capturedCanReassign: boolean | undefined
    let capturedEdit: unknown
    const Probe = () => {
      const src = useLiveGanttSource()
      capturedMode = src.mode
      capturedCanReassign = src.capabilities.roster.canReassign
      capturedEdit = src.edit
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(capturedMode).toBe('live')
    expect(capturedCanReassign).toBe(false)
    expect(capturedEdit).toBeUndefined()

    document.body.removeChild(container)
  })

  it('useDirtySignal() is monotonic: markDirty raises it, markClean leaves it unchanged', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let captured = -1
    const Probe = () => {
      const src = useLiveGanttSource()
      captured = src.useDirtySignal()
      return null
    }

    const root = createRoot(container)

    // Initial render captures the starting epoch (0, per beforeEach).
    act(() => {
      root.render(React.createElement(Probe))
    })
    const initial = captured
    expect(initial).toBe(0)

    // markDirty → epoch increments → re-render observes a STRICTLY GREATER signal.
    act(() => {
      useGanttViewStore.getState().markDirty()
      root.render(React.createElement(Probe))
    })
    const afterDirty = captured
    expect(afterDirty).toBeGreaterThan(initial)

    // markClean clears the boolean `dirty` but MUST NOT touch the epoch — the
    // signal stays exactly the same (no spurious 1→0 edge, no extra redraw).
    act(() => {
      useGanttViewStore.getState().markClean()
      root.render(React.createElement(Probe))
    })
    const afterClean = captured
    expect(afterClean).toBe(afterDirty)
    expect(useGanttViewStore.getState().dirty).toBe(false)

    document.body.removeChild(container)
  })
})
