import { useEffect, useState } from 'react'
import { LIVE_API_BASE } from '@/config/api-paths'

interface ServiceEntry {
  name: string
  port: number
  mandatory: boolean
  state: 'up' | 'down' | 'warn' | 'off'
  detail: string
}

interface SystemStatus {
  ok: boolean
  services: ServiceEntry[]
  rustBins: { state: string; detail: string; missing: string[] }
  infrastructure: Record<string, string>
}

const POLL_MS = 30_000

/** Problems worth surfacing to a planner: a mandatory service down, degraded
 *  infra, or the rule-engine binaries missing. Optional services that are off
 *  are noise and never counted. */
function problemsOf(status: SystemStatus | null, unreachable: boolean): string[] {
  if (unreachable || !status) return ['live-server:3000 unreachable (status API did not answer)']
  return [
    ...status.services
      .filter((s) => s.state !== 'up' && (s.mandatory || s.state === 'down'))
      .map((s) => `${s.name}:${s.port} ${s.state} — ${s.detail}`),
    ...(status.rustBins.state !== 'up' ? [`rust release bins: ${status.rustBins.detail}`] : []),
    ...Object.entries(status.infrastructure ?? {})
      .filter(([, value]) => value !== 'ok')
      .map(([key, value]) => `${key}: ${value}`),
  ]
}

/**
 * Stack-health pill in the top nav. Polls live-server's aggregated status
 * endpoint (the browser cannot reach :3001/:3002 directly behind the tunnel);
 * green = all mandatory services up, amber = degraded, red = status unavailable.
 */
export function ServiceStatusPill() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`${LIVE_API_BASE}/api/system/services`, {
          headers: { Accept: 'application/json' },
        })
        const body = await response.json().catch(() => null)
        if (cancelled) return
        if (body?.data) {
          setStatus(body.data as SystemStatus)
          setUnreachable(false)
        } else {
          setStatus(null)
          setUnreachable(true)
        }
      } catch {
        if (!cancelled) {
          setStatus(null)
          setUnreachable(true)
        }
      }
    }
    void load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const problems = problemsOf(status, unreachable)
  const tone = unreachable || !status ? 'red' : status.ok ? 'green' : 'amber'
  const dotClass =
    tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-destructive'
  const label = tone === 'green' ? 'Services OK' : tone === 'amber' ? `${problems.length} degraded` : 'Status unknown'
  const title = tone === 'green' ? 'All mandatory services are up' : problems.join('\n')

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid="service-status-pill"
        title={title}
        onClick={() => setOpen((value) => !value)}
        className="flex h-[28px] items-center gap-1.5 rounded-sm px-2 text-xs text-muted-foreground transition-all duration-100 hover:bg-muted hover:text-foreground"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-80 rounded-md border border-border bg-card p-2 text-xs shadow-md">
          <div className="mb-1 font-semibold text-foreground">
            {tone === 'green' ? 'All mandatory services are up' : 'Stack problems'}
          </div>
          {problems.length === 0 ? (
            <div className="text-muted-foreground" data-testid="service-status-ok">
              {status?.services.map((s) => `${s.name}:${s.livePort ?? s.port}`).join(' · ')}
            </div>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-auto" data-testid="service-status-problems">
              {problems.map((problem) => (
                <li key={problem} className="text-destructive">
                  {problem}
                </li>
              ))}
            </ul>
          )}
          {status?.checkedAt && (
            <div className="mt-1 text-2xs text-muted-foreground/70">checked {new Date(status.checkedAt).toLocaleTimeString()}</div>
          )}
        </div>
      )}
    </div>
  )
}
