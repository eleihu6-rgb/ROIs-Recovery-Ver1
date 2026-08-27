import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react'

interface Props {
  status: 'PENDING' | 'COMPUTING' | 'READY' | 'FAILED' | null
  computedAt: string | null
  errorText: string | null
  paramsStale: boolean
  /** True once the current run has been COMPUTING/PENDING longer than expected — the
   *  pane-toolbar Recheck button is clickable again at this point even though this
   *  indicator (status-only, no button of its own) can't trigger it directly. */
  stuck: boolean
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

/**
 * Informational status line for the shared ViolationListDialog when opened from a Scenario —
 * mirrors LegalityRecheckIndicator's visual language but reads THIS scenario's own persisted
 * legality status (scenario.legality_status), never the global Live group. The actual "Recheck"
 * action lives solely on the pane-toolbar button (gantt/CLAUDE.md §Pane-Toolbar-Home) — this is
 * status-only, no button, matching how LegalityRecheckIndicator is used in this same dialog today.
 */
export function ScenarioRecheckIndicator({ status, computedAt, errorText, paramsStale, stuck }: Props) {
  const computing = status === 'COMPUTING' || status === 'PENDING'
  const failed = status === 'FAILED'
  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground" data-testid="scenario-recheck-indicator">
      {computing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        : failed ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
      <span data-testid="scenario-recheck-label" title={failed ? (errorText ?? undefined) : undefined}>
        {computing ? (stuck ? 'Checking legality… (taking longer than usual)' : 'Checking legality…')
          : failed ? 'Recheck failed'
          : paramsStale ? `Last checked ${fmt(computedAt)} (outdated)`
          : `Last checked ${fmt(computedAt)}`}
      </span>
    </div>
  )
}
