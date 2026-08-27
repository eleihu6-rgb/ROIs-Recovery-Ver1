import { useCallback, useEffect, useRef, useState } from 'react'
import { regressionApi } from '@/services/regression-api'
import type { RunStatusResult } from '@/types/regression'

export interface ActiveRun extends RunStatusResult {
  runId: string
}

const POLL_MS = 2000

/**
 * Starts a run and polls GET /runs/{id} every 2s until done/error (spec §7).
 * onDone fires once with the final payload so the caller can refresh + toast.
 */
export const useRunPoll = (onDone: (run: ActiveRun) => void) => {
  const [run, setRun] = useState<ActiveRun | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const firedRef = useRef(false)
  const currentRunIdRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])

  const start = useCallback(
    (runId: string, total: number) => {
      stop()
      currentRunIdRef.current = runId
      firedRef.current = false
      setRun({ runId, status: 'running', total, passed: 0, failed: 0 })
      timer.current = setInterval(async () => {
        try {
          const status = await regressionApi.runStatus(runId)
          if (runId !== currentRunIdRef.current) return
          const next: ActiveRun = { runId, ...status }
          setRun(next)
          if (status.status !== 'running' && !firedRef.current) {
            firedRef.current = true
            stop()
            onDoneRef.current(next)
            // keep error visible; clear successful runs from the bar
            if (status.status === 'done') setRun(null)
          }
        } catch {
          // transient poll failure — keep polling; the 600s server timeout bounds the run
        }
      }, POLL_MS)
    },
    [stop],
  )

  useEffect(() => stop, [stop])

  const dismiss = useCallback(() => {
    stop()
    currentRunIdRef.current = null
    setRun(null)
  }, [stop])

  return { run, start, dismiss }
}
