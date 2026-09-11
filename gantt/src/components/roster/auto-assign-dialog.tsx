import { useEffect, useRef, useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { Wand2, Check, SkipForward, Filter } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { resolveViewportMonthBounds } from '@/utils/resolve-viewport-month'
import { autoAssignApi, type AutoAssignPlan } from '@/services/auto-assign-api'
import { runAutoAssignReplay, type ReplayStep } from '@/utils/auto-assign-driver'
import { notify } from '@/utils/notify'

type Phase = 'planning' | 'planned' | 'applying' | 'done' | 'error'

/** MM-DD from a UTC ISO string, or '—' when the pairing has no scheduled time. */
const mmdd = (iso: string | null): string => (iso ? iso.slice(5, 10) : '—')

/**
 * Auto-assign open pairings — the visible "brain + hands" flow.
 *
 * On open, calls the no-commit planner (`/api/roster/auto-assign/plan`) to compute
 * a warning-clean greedy assignment of open base+fleet-matched pairings across the
 * viewport month for the selected crew, and shows the full decision trace (filter
 * → consider → skip-on-rule → assign). "Apply to gantt" then replays the plan as
 * real assign operations the user watches happen; they press Save to persist.
 */
export const AutoAssignDialog = () => {
  const open = useUiStore((s) => s.autoAssignOpen)
  const crewIds = useUiStore((s) => s.autoAssignCrewIds)
  const close = useUiStore((s) => s.closeAutoAssignDialog)

  const [phase, setPhase] = useState<Phase>('planning')
  const [error, setError] = useState<string | null>(null)
  const [yearMonth, setYearMonth] = useState('')
  const [plan, setPlan] = useState<AutoAssignPlan | null>(null)
  const [replayLog, setReplayLog] = useState<ReplayStep[]>([])
  const abortRef = useRef(false)

  // Fetch the plan (brain) whenever the dialog opens for a crew set.
  useEffect(() => {
    if (!open || crewIds.length === 0) return
    let cancelled = false
    abortRef.current = false
    const bounds = resolveViewportMonthBounds()
    setYearMonth(bounds.yearMonth)
    setPhase('planning')
    setError(null)
    setPlan(null)
    setReplayLog([])
    void autoAssignApi
      .plan({ crewIds, startDate: bounds.start, endDate: bounds.end })
      .then((res) => {
        if (cancelled) return
        setPlan(res)
        setPhase('planned')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to compute plan')
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [open, crewIds])

  const handleApply = async () => {
    if (!plan) return
    abortRef.current = false
    setReplayLog([])
    setPhase('applying')
    try {
      const result = await runAutoAssignReplay(plan, {
        isAborted: () => abortRef.current,
        onStep: (step) => setReplayLog((prev) => [...prev, step]),
      })
      setPhase('done')
      if (result.failed > 0) {
        notify.warning(`Applied ${result.assigned}, ${result.failed} skipped on replay. Review and Save.`)
      } else {
        notify.success(`Applied ${result.assigned} assignment(s). Press Save to persist.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replay failed')
      setPhase('error')
    }
  }

  const handleClose = () => {
    abortRef.current = true
    close()
  }

  const totalAssign = plan?.summary.assignedTotal ?? 0

  const footer =
    phase === 'planned' ? (
      <>
        <Button variant="ghost" onClick={handleClose} data-testid="auto-assign-cancel">
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          disabled={totalAssign === 0}
          data-testid="auto-assign-apply"
        >
          Apply to gantt ({totalAssign})
        </Button>
      </>
    ) : phase === 'applying' ? (
      <Button variant="ghost" onClick={() => { abortRef.current = true }} data-testid="auto-assign-stop">
        Stop
      </Button>
    ) : (
      <Button variant="ghost" onClick={handleClose} data-testid="auto-assign-close">
        Close
      </Button>
    )

  const appliedCount = replayLog.filter((s) => s.ok).length

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) handleClose() }}
      data-testid="auto-assign-dialog"
      className="sm:max-w-[620px] max-h-[78vh]"
      resizable
      icon={<Wand2 className="h-4 w-4" />}
      title={`Auto-assign open pairings${yearMonth ? ` — ${yearMonth}` : ''}`}
      description={`${crewIds.length} crew · warning-clean, open base+fleet pairings`}
      bodyClassName="flex min-h-0 flex-col"
      footer={footer}
    >
      <div className="flex h-full min-h-0 flex-col gap-2 py-1" data-testid="auto-assign-body">
        {phase === 'planning' && (
          <p className="text-xs text-muted-foreground" data-testid="auto-assign-planning">
            Computing plan… filtering open pairings, spreading flying hours evenly across the month, checking legality.
          </p>
        )}
        {phase === 'error' && (
          <p className="text-xs text-destructive" data-testid="auto-assign-error">{error}</p>
        )}

        {plan && phase !== 'error' && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-2 py-1.5 text-2xs">
            <span className="font-medium text-muted-foreground">
              {plan.summary.crewCount} crew · {plan.summary.assignedTotal} to assign · {plan.summary.skippedTotal} skipped
            </span>
            {(phase === 'applying' || phase === 'done') && (
              <span className="font-mono tabular-nums text-muted-foreground" data-testid="auto-assign-progress">
                applied {appliedCount}/{totalAssign}
              </span>
            )}
          </div>
        )}

        {plan && phase !== 'error' && (
          <div className="min-h-0 flex-1 space-y-2 overflow-auto" data-testid="auto-assign-trace">
            {plan.crews.map((crew) => (
              <div key={crew.crewId} className="rounded-md border border-border" data-testid="auto-assign-crew">
                <div className="flex items-center justify-between border-b border-border bg-muted/60 px-2 py-1">
                  <span className="text-xs font-medium">
                    <span className="font-mono tabular-nums">{crew.crewId}</span>{' '}
                    <span className="text-muted-foreground">{crew.crewName}</span>
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {crew.base} · {crew.fleets.join('/')} · {crew.summary.assignedCount} assign / {crew.summary.skippedCount} skip
                  </span>
                </div>
                <ul className="divide-y divide-border/40">
                  {crew.steps.map((step, idx) => (
                    <li
                      key={`${crew.crewId}-${idx}`}
                      className="flex items-start gap-1.5 px-2 py-1 text-2xs"
                      data-testid={`auto-assign-step-${step.kind}`}
                    >
                      {step.kind === 'filter' && (
                        <>
                          <Filter className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">{step.message}</span>
                        </>
                      )}
                      {step.kind === 'consider' && (
                        <span className="pl-4.5 font-mono tabular-nums text-muted-foreground">
                          consider {step.label} · {mmdd(step.startDt)}
                        </span>
                      )}
                      {step.kind === 'assign' && (
                        <>
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                          <span>
                            <span className="font-mono tabular-nums">{step.label}</span>{' '}
                            <span className="text-muted-foreground">{mmdd(step.startDt)}→{mmdd(step.endDt)} · {step.rank}</span>
                          </span>
                        </>
                      )}
                      {step.kind === 'skip' && (
                        <>
                          <SkipForward className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                          <span>
                            <span className="font-mono tabular-nums">{step.label}</span>{' '}
                            <span className="text-amber-700">
                              skip ({step.reason}
                              {step.ruleCode ? ` ${step.ruleCode}` : ''}
                              {step.ruleName ? ` ${step.ruleName}` : ''})
                            </span>
                            {step.message ? <span className="text-muted-foreground"> — {step.message}</span> : null}
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                  {crew.steps.length === 0 && (
                    <li className="px-2 py-1 text-2xs text-muted-foreground">No open pairings matched.</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppDialog>
  )
}
