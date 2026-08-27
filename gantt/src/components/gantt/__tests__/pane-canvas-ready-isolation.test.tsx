import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

/**
 * Regression: PaneCanvas must NOT destroy/re-attach when only the ready/destroy
 * callback identities change. That churn unregisters cross-pane drop targets and
 * kills document-level pending drag (Scenario pairing→roster assign).
 *
 * We test the ref-isolation contract via a minimal double of the PaneCanvas effect
 * (same deps / ref pattern as pane-canvas.tsx) — full PaneCanvas needs GanttSource
 * and canvas resize plumbing.
 */
describe('PaneCanvas ready/destroy ref isolation', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('does not re-fire destroy+ready when callback identities change at stable size', async () => {
    const ready = vi.fn()
    const destroy = vi.fn()
    let setReady!: (fn: typeof ready) => void
    let setDestroy!: (fn: typeof destroy) => void

    const Probe = ({ width }: { width: number }) => {
      const [onReady, _setReady] = useState(() => ready)
      const [onDestroy, _setDestroy] = useState(() => destroy)
      setReady = (fn) => _setReady(() => fn)
      setDestroy = (fn) => _setDestroy(() => fn)

      const canvasReadyRef = React.useRef<HTMLDivElement | null>(null)
      const onReadyRef = React.useRef(onReady)
      const onDestroyRef = React.useRef(onDestroy)
      onReadyRef.current = onReady
      onDestroyRef.current = onDestroy
      const elRef = React.useRef<HTMLDivElement | null>(null)

      React.useEffect(() => {
        const el = elRef.current
        if (el && width > 0 && canvasReadyRef.current !== el) {
          if (canvasReadyRef.current && onDestroyRef.current) onDestroyRef.current()
          canvasReadyRef.current = el
          onReadyRef.current?.(el as unknown as HTMLCanvasElement)
        }
        return () => {
          if (onDestroyRef.current && canvasReadyRef.current) {
            onDestroyRef.current()
            canvasReadyRef.current = null
          }
        }
      }, [width])

      return <div ref={elRef} data-width={width} />
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Probe width={100} />)
    })
    expect(ready).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(0)

    const ready2 = vi.fn()
    const destroy2 = vi.fn()
    await act(async () => {
      setReady(ready2)
      setDestroy(destroy2)
    })

    // Identity churn must not tear down the attach (destroy stays 0; ready stays 1).
    expect(destroy).toHaveBeenCalledTimes(0)
    expect(destroy2).toHaveBeenCalledTimes(0)
    expect(ready).toHaveBeenCalledTimes(1)
    expect(ready2).toHaveBeenCalledTimes(0)

    await act(async () => {
      root.unmount()
    })
    // Unmount uses the latest destroy ref.
    expect(destroy2).toHaveBeenCalledTimes(1)
  })
})
