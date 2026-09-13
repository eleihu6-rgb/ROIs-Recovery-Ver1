import { useEffect, useRef, useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { Wand2, Check, SkipForward, Filter, CalendarDays, Plus, Trash2, AlertTriangle, Sun } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { resolveViewportMonthBounds } from '@/utils/resolve-viewport-month'
import {
  autoAssignApi,
  type AutoAssignDutyGroup,
  type AutoAssignDutyType,
  type AutoAssignPlan,
} from '@/services/auto-assign-api'
import { fetchRosterPeriods } from '@/services/roster-period-api'
import { runAutoAssignReplay, type ReplayStep } from '@/utils/auto-assign-driver'
import { notify } from '@/utils/notify'

type Phase = 'configure' | 'planning' | 'planned' | 'applying' | 'done' | 'error'

/** MM-DD from a UTC ISO string, or '—' when the pairing has no scheduled time. */
const mmdd = (iso: string | null): string => (iso ? iso.slice(5, 10) : '—')

/** Dialog row: a duty type with its (optional) limits. Empty string = no limit. */
interface DutyRow {
  group: string
  periodMax: string
  every7Min: string
  every7Max: string
}

/** Ryan's default table: FLY / RES / DO. */
const DEFAULT_ROWS: DutyRow[] = [
  { group: 'FLY', periodMax: '', every7Min: '1', every7Max: '4' },
  { group: 'RES', periodMax: '2', every7Min: '1', every7Max: '' },
  { group: 'DO', periodMax: '8', every7Min: '1', every7Max: '2' },
]

const toLimit = (v: string): number | null => {
  const n = Number(v)
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.floor(n)
}

const rowsToDutyTypes = (rows: DutyRow[]): AutoAssignDutyType[] =>
  rows.map((r) => ({
    group: r.group,
    periodMax: toLimit(r.periodMax),
    every7Min: toLimit(r.every7Min),
    every7Max: toLimit(r.every7Max),
  }))

const countDays = (from: string, to: string): number =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

const isYmd = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * Auto-assign Duties — the visible "brain + hands" flow.
 *
 * Configure (date range defaulting to the roster period + duty-type table) →
 * Analyse (no-commit planner `/api/roster/auto-assign/plan`, per-crew outcome vs
 * limits + decision trace) → Apply to gantt (replays the plan as real assign /
 * add-ground-task draft ops the user watches) → Save persists.
 */
export const AutoAssignDialog = () => {
  const open = useUiStore((s) => s.autoAssignOpen)
  const crewIds = useUiStore((s) => s.autoAssignCrewIds)
  const pane = useUiStore((s) => s.autoAssignPane)
  const close = useUiStore((s) => s.closeAutoAssignDialog)

  const [phase, setPhase] = useState<Phase>('configure')
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rpLabel, setRpLabel] = useState<string | null>(null)
  const [rows, setRows] = useState<DutyRow[]>(DEFAULT_ROWS)
  const [groups, setGroups] = useState<AutoAssignDutyGroup[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [addGroup, setAddGroup] = useState('')
  const [plan, setPlan] = useState<AutoAssignPlan | null>(null)
  const [replayLog, setReplayLog] = useState<ReplayStep[]>([])
  const abortRef = useRef(false)

  // On open: reset, default the range to the roster period covering the viewport month.
  useEffect(() => {
    if (!open || crewIds.length === 0) return
    let cancelled = false
    abortRef.current = false
    const bounds = resolveViewportMonthBounds()
    setPhase('configure')
    setError(null)
    setPlan(null)
    setReplayLog([])
    setRows(DEFAULT_ROWS)
    setAddGroup('')
    setFrom(bounds.start)
    setTo(bounds.end)
    setRpLabel(null)
    void fetchRosterPeriods()
      .then((res) => {
        if (cancelled) return
        const rp = res.items.find((p) => p.rpStart <= bounds.start && p.rpEnd >= bounds.start)
        if (rp) {
          setFrom(rp.rpStart)
          setTo(rp.rpEnd)
          setRpLabel(rp.name)
        }
      })
      .catch(() => {
        /* keep the calendar-month default */
      })
    return () => {
      cancelled = true
    }
  }, [open, crewIds])

  // Pool sizes follow the crew set + date range.
  useEffect(() => {
    if (!open || crewIds.length === 0 || !isYmd(from) || !isYmd(to) || from > to) return
    let cancelled = false
    setPoolLoading(true)
    void autoAssignApi
      .dutyGroups({ crewIds, startDate: from, endDate: to })
      .then((res) => {
        if (!cancelled) setGroups(res)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
      .finally(() => {
        if (!cancelled) setPoolLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, crewIds, from, to])

  const groupInfo = (g: string): AutoAssignDutyGroup | undefined => groups.find((x) => x.group === g)
  const addable = groups.filter((g) => !rows.some((r) => r.group === g.group) && (g.pairingBacked || g.groundAssignment))

  const updateRow = (group: string, key: keyof Omit<DutyRow, 'group'>, value: string) =>
    setRows((prev) => prev.map((r) => (r.group === group ? { ...r, [key]: value.replace(/[^\d]/g, '') } : r)))

  const handleAnalyse = () => {
    if (!isYmd(from) || !isYmd(to) || from > to) {
      setError('Date range must be From ≤ To (YYYY-MM-DD)')
      setPhase('error')
      return
    }
    abortRef.current = false
    setPhase('planning')
    setError(null)
    setPlan(null)
    setReplayLog([])
    void autoAssignApi
      .plan({ crewIds, startDate: from, endDate: to, rpFrom: from, rpTo: to, dutyTypes: rowsToDutyTypes(rows) })
      .then((res) => {
        setPlan(res)
        setPhase('planned')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to compute plan')
        setPhase('error')
      })
  }

  const handleApply = async () => {
    if (!plan) return
    abortRef.current = false
    setReplayLog([])
    setPhase('applying')
    try {
      const result = await runAutoAssignReplay(plan, {
        paneId: pane === 'roster-sub' ? 'sub' : 'main',
        isAborted: () => abortRef.current,
        onStep: (step) => setReplayLog((prev) => [...prev, step]),
      })
      setPhase('done')
      if (result.failed > 0) {
        notify.warning(`Applied ${result.assigned}, ${result.failed} skipped on replay. Review and Save.`)
      } else {
        notify.success(`Applied ${result.assigned} duty assignment(s). Press Save to persist.`)
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
  const unmetTotal = plan?.crews.reduce((n, c) => n + c.steps.filter((s) => s.kind === 'unmet').length, 0) ?? 0
  const appliedCount = replayLog.filter((s) => s.ok).length
  const nDays = isYmd(from) && isYmd(to) && from <= to ? countDays(from, to) : 0
  const nWindows = nDays <= 7 ? (nDays > 0 ? 1 : 0) : nDays - 6

  const footer =
    phase === 'configure' ? (
      <>
        <Button variant="ghost" onClick={handleClose} data-testid="auto-assign-cancel">
          Cancel
        </Button>
        <Button onClick={handleAnalyse} disabled={rows.length === 0} data-testid="auto-assign-analyse">
          Analyse
        </Button>
      </>
    ) : phase === 'planned' ? (
      <>
        <Button variant="ghost" onClick={() => setPhase('configure')} data-testid="auto-assign-back">
          Back
        </Button>
        <Button variant="ghost" onClick={handleClose} data-testid="auto-assign-cancel">
          Cancel
        </Button>
        <Button onClick={handleApply} disabled={totalAssign === 0} data-testid="auto-assign-apply">
          Apply to gantt ({totalAssign})
        </Button>
      </>
    ) : phase === 'applying' ? (
      <Button variant="ghost" onClick={() => { abortRef.current = true }} data-testid="auto-assign-stop">
        Stop
      </Button>
    ) : phase === 'error' ? (
      <>
        <Button variant="ghost" onClick={() => setPhase('configure')} data-testid="auto-assign-back">
          Back
        </Button>
        <Button variant="ghost" onClick={handleClose} data-testid="auto-assign-close">
          Close
        </Button>
      </>
    ) : (
      <Button variant="ghost" onClick={handleClose} data-testid="auto-assign-close">
        Close
      </Button>
    )

  const rangeLabel = isYmd(from) && isYmd(to) ? `${from} → ${to}` : ''

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) handleClose() }}
      data-testid="auto-assign-dialog"
      className="sm:max-w-[720px] max-h-[82vh]"
      resizable
      icon={<Wand2 className="h-4 w-4" />}
      title={`Auto-assign duties${rangeLabel ? ` — ${rangeLabel}` : ''}`}
      description={`${crewIds.length} crew · ${crewIds.slice(0, 6).join(', ')}${crewIds.length > 6 ? '…' : ''} · warning-clean, legality-checked`}
      bodyClassName="flex min-h-0 flex-col"
      footer={footer}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 py-1" data-testid="auto-assign-body">
        {phase === 'configure' && (
          <>
            {/* Date range */}
            <section className="flex flex-col gap-1.5" data-testid="auto-assign-config">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Date range
                <span className="ml-auto font-normal text-muted-foreground">
                  {rpLabel ? `defaults to roster period ${rpLabel}` : 'defaults to the viewport month'}
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
                  From
                  <input
                    id="auto-assign-from"
                    data-testid="auto-assign-from"
                    className="h-7 w-32 rounded-sm border border-border bg-background px-1.5 font-mono text-xs tabular-nums text-foreground"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
                  To
                  <input
                    id="auto-assign-to"
                    data-testid="auto-assign-to"
                    className="h-7 w-32 rounded-sm border border-border bg-background px-1.5 font-mono text-xs tabular-nums text-foreground"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <span className="mb-1 rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-2xs text-muted-foreground" data-testid="auto-assign-range-chip">
                  {nDays} days · {nWindows} rolling 7-day windows
                </span>
              </div>
            </section>

            {/* Duty types */}
            <section className="flex min-h-0 flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Duty types
                <span className="ml-auto font-normal text-muted-foreground">blank = no limit · window = any 7 consecutive days</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs" data-testid="auto-assign-duty-table">
                  <thead>
                    <tr className="bg-muted/60 text-3xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1 text-left font-medium">Duty</th>
                      <th className="px-2 py-1 text-center font-medium">Period Max</th>
                      <th className="px-2 py-1 text-center font-medium">Every 7 Days Min</th>
                      <th className="px-2 py-1 text-center font-medium">Every 7 Days Max</th>
                      <th className="px-2 py-1 text-left font-medium">Pool in range</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((r) => {
                      const info = groupInfo(r.group)
                      const pool = info?.pairingBacked
                        ? `${info.poolSize} open pairing(s)`
                        : info
                          ? `— ground task · full day, crew-base local`
                          : poolLoading
                            ? 'loading…'
                            : '—'
                      return (
                        <tr key={r.group} data-testid={`auto-assign-duty-row-${r.group}`}>
                          <td className="px-2 py-1 font-mono font-semibold tabular-nums">{r.group}</td>
                          {(['periodMax', 'every7Min', 'every7Max'] as const).map((k) => (
                            <td key={k} className="px-2 py-1 text-center">
                              <input
                                id={`auto-assign-${r.group}-${k}`}
                                data-testid={`auto-assign-${r.group}-${k}`}
                                inputMode="numeric"
                                placeholder="—"
                                className="h-6 w-12 rounded-sm border border-border bg-background text-center font-mono text-xs tabular-nums text-foreground"
                                value={r[k]}
                                onChange={(e) => updateRow(r.group, k, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-muted-foreground" data-testid={`auto-assign-pool-${r.group}`}>
                            {pool}
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button
                              type="button"
                              aria-label={`Remove ${r.group}`}
                              data-testid={`auto-assign-remove-${r.group}`}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                              onClick={() => setRows((prev) => prev.filter((x) => x.group !== r.group))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <select
                  id="auto-assign-add-type"
                  data-testid="auto-assign-add-type"
                  className="h-7 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground"
                  value={addGroup}
                  onChange={(e) => setAddGroup(e.target.value)}
                >
                  <option value="">Add duty type…</option>
                  {addable.map((g) => (
                    <option key={g.group} value={g.group}>
                      {g.group}{g.name ? ` · ${g.name}` : ''}{g.pairingBacked ? ` (${g.poolSize} open)` : ' (ground)'}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!addGroup}
                  data-testid="auto-assign-add-type-btn"
                  onClick={() => {
                    if (!addGroup) return
                    setRows((prev) => [...prev, { group: addGroup, periodMax: '', every7Min: '', every7Max: '' }])
                    setAddGroup('')
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <p className="border-l-2 border-primary bg-muted/40 px-2 py-1 text-2xs text-muted-foreground">
                <span className="font-medium text-foreground">Fill order:</span> rows top to bottom (FLY first, then RES, then DO into leftover free days).
                Existing roster duties in range count toward every limit. Every pick still passes the legality engine.
              </p>
            </section>
          </>
        )}

        {phase === 'planning' && (
          <p className="text-xs text-muted-foreground" data-testid="auto-assign-planning">
            Computing plan… filtering open duties, packing under the limits, checking legality.
          </p>
        )}
        {phase === 'error' && (
          <p className="text-xs text-destructive" data-testid="auto-assign-error">{error}</p>
        )}

        {plan && phase !== 'error' && phase !== 'configure' && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-2 py-1.5 text-2xs">
            <span className="font-medium text-muted-foreground" data-testid="auto-assign-summary">
              {plan.summary.crewCount} crew · {plan.summary.assignedTotal} to assign · {plan.summary.skippedTotal} skipped
              {unmetTotal > 0 ? ` · ${unmetTotal} window(s) below min` : ''}
              {phase === 'planned' ? ' · nothing written yet' : ''}
            </span>
            {(phase === 'applying' || phase === 'done') && (
              <span className="font-mono tabular-nums text-muted-foreground" data-testid="auto-assign-progress">
                applied {appliedCount}/{totalAssign}
              </span>
            )}
          </div>
        )}

        {replayLog.some((s) => !s.ok) && (
          <div className="flex flex-col gap-0.5 rounded-md border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-2xs" data-testid="auto-assign-replay-failed">
            <span className="font-medium text-amber-700">Skipped on replay ({replayLog.filter((s) => !s.ok).length})</span>
            {replayLog.filter((s) => !s.ok).map((s) => (
              <span key={`${s.crewId}-${s.index}`} className="text-amber-700" data-testid="auto-assign-replay-failed-step">
                <span className="font-mono tabular-nums">{s.crewId} · {s.label}</span> — {s.reason ?? 'declined'}
              </span>
            ))}
          </div>
        )}

        {plan && phase !== 'error' && phase !== 'configure' && (
          <div className="min-h-0 flex-1 space-y-2 overflow-auto" data-testid="auto-assign-trace">
            {plan.crews.map((crew) => {
              const unmet = crew.steps.filter((s) => s.kind === 'unmet')
              return (
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

                  {/* Outcome vs limits */}
                  {crew.outcome.length > 0 && (
                    <table className="w-full text-2xs" data-testid={`auto-assign-outcome-${crew.crewId}`}>
                      <thead>
                        <tr className="text-3xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-0.5 text-left font-medium">Duty</th>
                          <th className="px-2 py-0.5 text-center font-medium">Existing</th>
                          <th className="px-2 py-0.5 text-center font-medium">+ New</th>
                          <th className="px-2 py-0.5 text-center font-medium">Period</th>
                          <th className="px-2 py-0.5 text-left font-medium">Windows</th>
                          <th className="px-2 py-0.5 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {crew.outcome.map((o) => {
                          const below = o.windows.filter((w) => w.minUnmet).length
                          const hit = o.windows.filter((w) => w.maxHit).length
                          const periodFull = o.periodMax != null && o.existing + o.assigned >= o.periodMax
                          const ok = below === 0
                          return (
                            <tr key={o.group} data-testid={`auto-assign-outcome-${crew.crewId}-${o.group}`}>
                              <td className="px-2 py-0.5 font-mono font-semibold tabular-nums">{o.group}</td>
                              <td className="px-2 py-0.5 text-center font-mono tabular-nums">{o.existing}</td>
                              <td className="px-2 py-0.5 text-center font-mono tabular-nums" data-testid={`auto-assign-outcome-${crew.crewId}-${o.group}-new`}>+{o.assigned}</td>
                              <td className="px-2 py-0.5 text-center font-mono tabular-nums">
                                {o.existing + o.assigned} / {o.periodMax ?? '—'}
                              </td>
                              <td className="px-2 py-0.5">
                                <div className="flex h-3 items-center gap-px" title={`${o.windows.length} rolling 7-day windows`}>
                                  {o.windows.map((w) => (
                                    <i
                                      key={w.start}
                                      title={`${w.start}..${w.end}: ${w.count}`}
                                      className={`h-2 flex-1 rounded-sm ${w.minUnmet ? 'bg-amber-500' : 'bg-primary/70'}`}
                                    />
                                  ))}
                                </div>
                              </td>
                              <td className="px-2 py-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-px font-medium ${ok ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}
                                  data-testid={`auto-assign-outcome-${crew.crewId}-${o.group}-status`}
                                >
                                  {ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                  {ok
                                    ? `min ${o.every7Min ?? '—'} · max ${o.every7Max ?? '—'} met`
                                    : `${below} window(s) below min ${o.every7Min}`}
                                  {periodFull ? ' · period max reached' : hit > 0 ? ` · max hit in ${hit}` : ''}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {unmet.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-2 pb-1.5 pt-1" data-testid={`auto-assign-unmet-${crew.crewId}`}>
                      {unmet.map((s, i) => s.kind === 'unmet' && (
                        <span key={`${s.group}-${s.start}-${i}`} className="rounded-sm border border-amber-500/60 bg-amber-500/10 px-1.5 py-px font-mono text-3xs tabular-nums text-amber-700" title={s.message}>
                          {s.group} · {s.start.slice(5)}–{s.end.slice(5)}: {s.count}
                        </span>
                      ))}
                    </div>
                  )}

                  {(crew.warnings?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-0.5 px-2 pb-1.5 pt-1" data-testid={`auto-assign-warnings-${crew.crewId}`}>
                      <span className="text-3xs font-medium uppercase tracking-wide text-amber-700">Legality warnings kept (accepted at Apply)</span>
                      {crew.warnings.map((w, i) => (
                        <span key={`${w.ruleCode}-${i}`} className="text-2xs text-amber-700">
                          <span className="font-mono tabular-nums">{w.ruleCode}</span> · {w.message}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Decision trace */}
                  <ul className="divide-y divide-border/40 border-t border-border">
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
                            {step.group ? `${step.group} · ` : ''}consider {step.label} · {mmdd(step.startDt)}
                          </span>
                        )}
                        {step.kind === 'assign' && (
                          <>
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                            <span>
                              {step.group ? <span className="font-mono font-semibold tabular-nums">{step.group} · </span> : null}
                              <span className="font-mono tabular-nums">{step.label}</span>{' '}
                              <span className="text-muted-foreground">{mmdd(step.startDt)}→{mmdd(step.endDt)} · {step.rank}</span>
                            </span>
                          </>
                        )}
                        {step.kind === 'ground' && (
                          <>
                            <Sun className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                            <span>
                              <span className="font-mono font-semibold tabular-nums">{step.group} · </span>
                              <span className="font-mono tabular-nums">{step.day}</span>{' '}
                              <span className="text-muted-foreground">{step.message}</span>
                            </span>
                          </>
                        )}
                        {step.kind === 'unmet' && (
                          <>
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                            <span className="text-amber-700">{step.message}</span>
                          </>
                        )}
                        {step.kind === 'skip' && (
                          <>
                            <SkipForward className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                            <span>
                              {step.group ? <span className="font-mono font-semibold tabular-nums">{step.group} · </span> : null}
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
                      <li className="px-2 py-1 text-2xs text-muted-foreground">No open duties matched.</li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppDialog>
  )
}
