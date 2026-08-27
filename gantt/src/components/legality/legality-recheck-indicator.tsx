import { useEffect, useRef, useState, useCallback } from 'react'
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@rois/ui'
import { legalityApi } from '@/services/legality-api'
import { notify } from '@/utils/notify'
import type { LegalityRecheckStatus } from '@/types/legality'

interface Props {
  groupCode: string
  /** When set, render a "Recheck now" button that triggers a live recheck for [from,to]. */
  recheck?: { from: string; to: string } | null
  /** External signal (incremented by the parent on param-save) to start polling immediately. */
  pollSignal?: number
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

/** Live's full-roster recheck legitimately takes low minutes; 10 min is a generous
 *  "something's wrong" bar. */
const STUCK_MS = 10 * 60_000
/** Give up after 30 min of polling — matches the backend's own Redis dedupe TTL
 *  (live-server/src/routes/rule/legality.ts), so we never poll long past the point
 *  the server-side status key itself would have expired. */
const POLL_CAP = 1200

export function LegalityRecheckIndicator({ groupCode, recheck = null, pollSignal = 0 }: Props) {
  const [st, setSt] = useState<LegalityRecheckStatus>({ status: 'idle', lastCheckedAt: null, error: null })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const computingSinceRef = useRef<number | null>(null)
  const [, forceTick] = useState(0)
  const stop = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  // Tick every 2s while computing so `stuck` re-evaluates without waiting for a poll response.
  useEffect(() => {
    if (st.status !== 'computing') { computingSinceRef.current = null; return }
    const id = setInterval(() => forceTick((n) => n + 1), 2000)
    return () => clearInterval(id)
  }, [st.status])

  const startPolling = useCallback(() => {
    stop()
    let polls = 0
    pollRef.current = setInterval(async () => {
      polls += 1
      try {
        const s = await legalityApi.getRecheckStatus(groupCode)
        setSt(s)
        if (s.status === 'done') {
          stop()
          notify.success('Legality recheck done')
          // Ensure Alert Center / bells refetch even if Redis PUBLISH was missed.
          window.dispatchEvent(new CustomEvent('violations:updated', {
            detail: { groupCode },
          }))
          return
        }
        if (s.status === 'failed') { stop(); notify.error(s.error || 'Legality recheck failed'); return }
      } catch { /* transient — keep polling */ }
      if (polls >= POLL_CAP) { stop(); notify.error('Still checking — click Recheck to retry') }
    }, 1500)
  }, [groupCode])

  // Initial fetch (show last-checked on mount); re-fetch when groupCode changes.
  useEffect(() => {
    let alive = true
    legalityApi.getRecheckStatus(groupCode).then((s) => { if (alive) { setSt(s); if (s.status === 'computing') startPolling() } }).catch(() => {})
    return () => { alive = false; stop() }
  }, [groupCode, startPolling])

  // Parent bumps pollSignal after a param save → reflect "computing" and start polling.
  useEffect(() => {
    if (pollSignal > 0) {
      computingSinceRef.current = Date.now()
      setSt((p) => ({ ...p, status: 'computing' }))
      startPolling()
    }
  }, [pollSignal, startPolling])

  const onRecheck = async () => {
    if (!recheck) return
    // Force-reset regardless of prior (possibly stuck) state — a fresh compute starts now.
    computingSinceRef.current = Date.now()
    setSt((p) => ({ ...p, status: 'computing' }))
    try { await legalityApi.triggerRecheck(groupCode, recheck.from, recheck.to); startPolling() }
    catch (e) {
      computingSinceRef.current = null
      setSt((p) => ({ ...p, status: 'failed' }))
      notify.error(e instanceof Error ? e.message : 'Failed to start recheck')
    }
  }

  const computing = st.status === 'computing'
  if (computing && computingSinceRef.current == null) computingSinceRef.current = Date.now()
  const stuck = computing && computingSinceRef.current != null && Date.now() - computingSinceRef.current > STUCK_MS

  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground" data-testid="legality-recheck-indicator">
      {computing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        : st.status === 'failed' ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
      <span data-testid="legality-recheck-label">
        {computing ? (stuck ? 'Checking legality… (taking longer than usual)' : 'Checking legality…')
          : st.status === 'failed' ? 'Recheck failed'
          : `Last checked ${fmt(st.lastCheckedAt)}`}
      </span>
      {recheck && (
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2" disabled={computing && !stuck}
          onClick={onRecheck} data-testid="legality-recheck-now">
          <RefreshCw className="h-3.5 w-3.5" />
          Recheck now
        </Button>
      )}
    </div>
  )
}
