import { describe, it, expect } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { GanttSourceProvider, useGanttSource } from '../gantt-source-context'
import { READ_ONLY_CAPABILITIES, type GanttPaneSource } from '../gantt-pane-source'

const stubSource: GanttPaneSource = {
  mode: 'live',
  useScrollX: () => 0,
  useScrollY: () => 0,
  setScrollY: () => {},
  getScrollX: () => 0,
  getScrollY: () => 0,
  usePxPerHour: () => 10,
  useRange: () => ({ start: new Date(0), end: new Date(0) }),
  useTimezone: () => 'UTC',
  useRosterPeriods: () => [],
  useDirtySignal: () => 0,
  markClean: () => {},
  capabilities: READ_ONLY_CAPABILITIES,
}

/** Capture the value returned by useGanttSource() inside a render. */
function renderWithCapture(
  ui: React.ReactElement,
  container: HTMLElement,
): void {
  act(() => {
    createRoot(container).render(ui)
  })
}

describe('useGanttSource', () => {
  it('throws without a provider', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let caughtError: unknown = null

    const Thrower = () => {
      try {
        useGanttSource()
      } catch (e) {
        caughtError = e
      }
      return null
    }

    // React 19 swallows render errors via error boundaries; suppress console.error
    const origError = console.error
    console.error = () => {}
    try {
      renderWithCapture(React.createElement(Thrower), container)
    } finally {
      console.error = origError
      document.body.removeChild(container)
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toMatch(/GanttSourceProvider/)
  })

  it('returns the provided source', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let capturedMode: string | undefined
    let capturedPxPerHour: number | undefined

    const Consumer = () => {
      const src = useGanttSource()
      capturedMode = src.mode
      capturedPxPerHour = src.usePxPerHour()
      return null
    }

    act(() => {
      createRoot(container).render(
        React.createElement(GanttSourceProvider, {
          value: stubSource,
          children: React.createElement(Consumer),
        })
      )
    })

    expect(capturedMode).toBe('live')
    expect(capturedPxPerHour).toBe(10)

    document.body.removeChild(container)
  })
})
