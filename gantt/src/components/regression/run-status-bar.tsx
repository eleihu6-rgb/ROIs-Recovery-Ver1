import { Loader2, XCircle, X } from 'lucide-react'
import type { ActiveRun } from './use-run-poll'

/** Bottom status bar shown while a run is active or after an error (spec §7). */
export const RunStatusBar = ({ run, onDismiss }: { run: ActiveRun; onDismiss: () => void }) => (
  <div
    data-testid="run-status-bar"
    className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2 text-xs"
  >
    {run.status === 'running' ? (
      <>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span data-testid="run-status-text" className="text-foreground">
          Running {run.total ?? 0} tests — passed {run.passed} · failed {run.failed}
        </span>
      </>
    ) : run.status === 'error' ? (
      <>
        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span data-testid="run-status-text" className="truncate text-destructive">
          Run failed: {run.error || 'unknown error'}
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </>
    ) : null}
  </div>
)
