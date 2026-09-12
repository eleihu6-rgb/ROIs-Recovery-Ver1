import { useEffect, useMemo } from 'react'
import { AppDialog } from '@rois/ui'
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, CircleSlash, Loader2 } from 'lucide-react'
import { useBestFitStore, selectionKey, BEST_FIT_BATCH_LIMIT } from '@/stores/best-fit-store'
import type { BestFitCandidate, BestFitLegalityVerdict, BestFitPairingResult } from '@/services/best-fit-api'

/**
 * Best-fit crew for open pairings — one screen: pick pairings, run once, review
 * per-pairing rankings, shortlist crew, then check the combined selection.
 *
 * Design: docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md
 * Mounted once on the shell so Live (and, later, Scenario) reach the same dialog.
 * Read-only: shortlisting never assigns and never accepts a warning.
 */

const formatMinutes = (minutes: number): string => {
  const value = Math.max(0, Math.round(minutes || 0))
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

/** Max pairing rows rendered in the worklist (a busy month can hold thousands). */
const BEST_FIT_RENDER_LIMIT = 200

const formatMoney = (amount: number | null, currency: string | null): string =>
  amount == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency ?? 'USD',
        maximumFractionDigits: 0,
      }).format(amount)

const VERDICT_META: Record<BestFitLegalityVerdict, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  pass: { label: 'No new violation', className: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
  soft: { label: 'Soft warning', className: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle },
  hard: { label: 'New hard violation', className: 'text-destructive', Icon: CircleSlash },
  unknown: { label: 'Not verified', className: 'text-muted-foreground', Icon: AlertTriangle },
}

const LegalityChip = ({ candidate }: { candidate: BestFitCandidate }) => {
  const meta = VERDICT_META[candidate.legality.verdict]
  const count = candidate.legality.newViolations.length + candidate.legality.changedViolations.length
  const { Icon } = meta
  return (
    <span className={`inline-flex items-center gap-1 text-2xs ${meta.className}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
      {count > 0 ? ` (${count})` : ''}
    </span>
  )
}

const CostCell = ({ candidate }: { candidate: BestFitCandidate }) => {
  const { cost } = candidate
  if (cost.status === 'priced' || cost.status === 'partial') {
    return (
      <span className="tabular-nums">
        {formatMoney(cost.amount, cost.currencyCode)}
        {cost.status === 'partial' ? <span className="ml-1 text-2xs text-amber-600">partial</span> : null}
      </span>
    )
  }
  if (cost.status === 'unpriced') return <span className="text-2xs text-muted-foreground">Unpriced</span>
  return <span className="text-2xs text-muted-foreground">Not priced</span>
}

const SlotCandidateTable = ({ pairingId, result, rank }: { pairingId: number; result: BestFitPairingResult; rank: string }) => {
  const slot = result.slots.find((s) => s.rank === rank)
  const choices = useBestFitStore((s) => s.choices)
  const selectCandidate = useBestFitStore((s) => s.selectCandidate)
  if (!slot) return null

  if (slot.basicMatchCount === 0) {
    return (
      <div className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
        No crew match this pairing's base, fleet, division and {rank} slot.
      </div>
    )
  }

  const chosen = choices[selectionKey(pairingId, rank)]

  return (
    <div className="overflow-auto rounded border border-border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/60 text-2xs text-muted-foreground">
            <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
            <th className="px-2 py-1.5 text-left font-medium">Crew</th>
            <th className="px-2 py-1.5 text-left font-medium">MBH</th>
            <th className="px-2 py-1.5 text-left font-medium">MCred</th>
            <th className="px-2 py-1.5 text-left font-medium">Incremental cost</th>
            <th className="px-2 py-1.5 text-left font-medium">Legality</th>
          </tr>
        </thead>
        <tbody>
          {slot.candidates.map((candidate, index) => {
            const blocked = candidate.legality.verdict === 'hard' || candidate.legality.verdict === 'unknown'
            return (
              <tr
                key={candidate.crewId}
                className={`border-t border-border ${chosen === candidate.crewId ? 'bg-primary/5' : ''}`}
                data-testid="best-fit-candidate-row"
                data-crew-id={candidate.crewId}
                data-verdict={candidate.legality.verdict}
              >
                <td className="px-2 py-1.5">
                  <input
                    type="radio"
                    name={`best-fit-${pairingId}-${rank}`}
                    checked={chosen === candidate.crewId}
                    disabled={blocked}
                    aria-label={`Shortlist ${candidate.crewId}`}
                    data-testid={`best-fit-pick-${candidate.crewId}`}
                    onChange={() => selectCandidate(pairingId, rank, candidate.crewId)}
                  />
                  {index === 0 && !blocked ? <span className="ml-1 text-2xs text-primary">best</span> : null}
                </td>
                <td className="px-2 py-1.5">
                  <div className="font-medium text-foreground">
                    {candidate.crewId} <span className="font-normal text-muted-foreground">{candidate.name}</span>
                  </div>
                  <div className="text-2xs text-muted-foreground">{candidate.why}</div>
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {candidate.statsAvailable ? formatMinutes(candidate.mbhMinutes) : <span className="text-2xs text-muted-foreground">no data</span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{formatMinutes(candidate.mcredMinutes)}</td>
                <td className="px-2 py-1.5">
                  <CostCell candidate={candidate} />
                </td>
                <td className="px-2 py-1.5">
                  <LegalityChip candidate={candidate} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {slot.truncated ? (
        <div className="border-t border-border bg-muted/40 px-2 py-1 text-2xs text-muted-foreground">
          Best {slot.checkedCount} of {slot.basicMatchCount} eligible crew were simulated.
        </div>
      ) : null}
    </div>
  )
}

const CandidateDetail = ({ candidate }: { candidate: BestFitCandidate }) => {
  const findings = [...candidate.legality.newViolations, ...candidate.legality.changedViolations]
  return (
    <div className="space-y-2 rounded border border-border p-2" data-testid="best-fit-candidate-detail">
      <div className="flex items-center gap-2 text-xs font-semibold">
        {candidate.crewId} · {candidate.name}
        <LegalityChip candidate={candidate} />
      </div>
      {candidate.legality.message ? (
        <div className="text-2xs text-destructive">{candidate.legality.message}</div>
      ) : null}
      <div>
        <div className="text-2xs font-medium text-muted-foreground">Rust legality delta</div>
        {findings.length === 0 ? (
          <div className="text-2xs text-muted-foreground">
            No new or changed findings versus this crew's current roster.
          </div>
        ) : (
          <ul className="mt-1 space-y-1">
            {findings.map((violation, index) => (
              <li key={`${violation.ruleCode}-${index}`} className="border-l-2 border-destructive/60 pl-2 text-2xs">
                <span className="font-medium">
                  Rule {violation.ruleCode}/{violation.ruleInstance} · severity {violation.severity}
                </span>
                <div className="text-muted-foreground">{violation.message}</div>
              </li>
            ))}
          </ul>
        )}
        {candidate.legality.existingViolations.length > 0 ? (
          <div className="mt-1 text-2xs text-muted-foreground">
            {candidate.legality.existingViolations.length} pre-existing finding(s) unchanged by this assignment.
          </div>
        ) : null}
      </div>
      <div>
        <div className="text-2xs font-medium text-muted-foreground">
          Cost of this assignment{candidate.cost.setLabel ? ` · ${candidate.cost.setLabel}${candidate.cost.setVersion ? ` v${candidate.cost.setVersion}` : ''}` : ''}
        </div>
        <div className="text-2xs">
          <CostCell candidate={candidate} /> · baseline credit {candidate.monthCreditHours.toFixed(1)} h
        </div>
        {candidate.cost.members.filter((m) => m.status === 'priced').map((member) => (
          <div key={member.revisionId} className="flex justify-between gap-2 text-2xs">
            <span className="text-muted-foreground">{member.name}</span>
            <span className="tabular-nums">{formatMoney(member.amount, member.currencyCode)}</span>
          </div>
        ))}
        {candidate.cost.note ? <div className="text-2xs text-amber-600">{candidate.cost.note}</div> : null}
      </div>
      <div className="text-2xs text-muted-foreground">
        Simulation only — nothing is assigned. Hard findings are eligibility gates and cost can never override them.
      </div>
    </div>
  )
}

export const BestFitDialog = ({ onBasisChange }: { onBasisChange?: () => void } = {}) => {
  const open = useBestFitStore((s) => s.open)
  const candidates = useBestFitStore((s) => s.candidates)
  const selected = useBestFitStore((s) => s.selected)
  const activePairingId = useBestFitStore((s) => s.activePairingId)
  const jobs = useBestFitStore((s) => s.jobs)
  const basis = useBestFitStore((s) => s.basis)
  const choices = useBestFitStore((s) => s.choices)
  const combined = useBestFitStore((s) => s.combined)
  const combinedStale = useBestFitStore((s) => s.combinedStale)
  const combinedChecking = useBestFitStore((s) => s.combinedChecking)
  const applying = useBestFitStore((s) => s.applying)
  const applyResult = useBestFitStore((s) => s.applyResult)
  const error = useBestFitStore((s) => s.error)
  const close = useBestFitStore((s) => s.close)
  const reset = useBestFitStore((s) => s.reset)
  const togglePairing = useBestFitStore((s) => s.togglePairing)
  const setActivePairing = useBestFitStore((s) => s.setActivePairing)
  const setBasis = useBestFitStore((s) => s.setBasis)
  const runSelected = useBestFitStore((s) => s.runSelected)
  const checkCombined = useBestFitStore((s) => s.checkCombined)
  const applyShortlist = useBestFitStore((s) => s.applyShortlist)

  const selectedList = useMemo(
    () => candidates.filter((candidate) => selected.has(candidate.pairingId)),
    [candidates, selected],
  )
  // A busy month can hold thousands of open pairings; render a bounded window and
  // say so, instead of mounting thousands of rows.
  const visibleCandidates = useMemo(() => candidates.slice(0, BEST_FIT_RENDER_LIMIT), [candidates])
  const activeJob = activePairingId == null ? null : jobs[activePairingId] ?? null
  const activeResult = activeJob?.status === 'done' ? activeJob.result : null

  const requiredSlots = useMemo(
    () =>
      selectedList.flatMap((candidate) => {
        const result = jobs[candidate.pairingId]?.result
        if (!result) return []
        return result.slots.map((slot) => ({ pairingId: candidate.pairingId, rank: slot.rank }))
      }),
    [selectedList, jobs],
  )
  const chosenCount = requiredSlots.filter((slot) => choices[selectionKey(slot.pairingId, slot.rank)]).length
  const allDone = selectedList.length > 0 && selectedList.every((c) => jobs[c.pairingId]?.status === 'done')
  // A subset shortlist is a legitimate check (a planner may only be able to fill
  // part of the work today). Coverage completeness is reported WITH the verdict so
  // "passed" is never mistaken for "everything is covered".
  const canCheck = allDone && chosenCount > 0 && !combinedChecking
  const canApply = canCheck && combined != null && combined.ok && !combinedStale && !applying
  const remainingUnchecked = selectedList.filter((c) => jobs[c.pairingId]?.status !== 'done').length

  useEffect(() => {
    if (open) return
    reset()
  }, [open, reset])

  const activeCandidateId = activePairingId == null ? null : choices[selectionKey(activePairingId, activeResult?.slots[0]?.rank ?? '')]
  const activeCandidate = activeResult
    ? activeResult.slots.flatMap((slot) => slot.candidates).find((candidate) => candidate.crewId === activeCandidateId) ?? null
    : null

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) close() }}
      title="Best-fit crew"
      icon={<Sparkles className="h-4 w-4" />}
      className="sm:max-w-[1100px]"
      bodyClassName="p-0"
      footerClassName="justify-between"
      data-testid="best-fit-dialog"
      footer={
        <>
          <span className="text-2xs text-muted-foreground" data-testid="best-fit-progress">
            {selectedList.filter((c) => jobs[c.pairingId]?.status === 'done').length}/{selectedList.length} pairings checked ·{' '}
            {chosenCount}/{requiredSlots.length} seats shortlisted · simulation only
            {remainingUnchecked > BEST_FIT_BATCH_LIMIT
              ? ` · ${remainingUnchecked - BEST_FIT_BATCH_LIMIT} queued for the next run`
              : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-7 rounded-md border border-border px-2 text-xs"
              onClick={close}
              data-testid="best-fit-close"
            >
              Close
            </button>
            <button
              type="button"
              className="h-7 rounded-md border border-border px-2 text-xs disabled:opacity-50"
              disabled={!canCheck || combinedChecking}
              onClick={() => void checkCombined()}
              data-testid="best-fit-check-combined"
            >
              {combinedChecking ? 'Checking…' : 'Check combined selection'}
            </button>
            <button
              type="button"
              className="h-7 rounded-md bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50"
              disabled={!canApply}
              onClick={() => void applyShortlist()}
              title="Queue these assignments in the draft. Nothing is published until you Save."
              data-testid="best-fit-assign"
            >
              {applying ? 'Assigning…' : `Assign ${chosenCount} to draft`}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">Rank candidates by</span>
          <div className="flex overflow-hidden rounded-md border border-border" data-testid="best-fit-basis">
            {(['fairness', 'cost'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={basis === value}
                className={`h-6 px-2 text-2xs ${basis === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                data-testid={`best-fit-basis-${value}`}
                onClick={() => {
                  setBasis(value)
                  onBasisChange?.()
                }}
              >
                {value === 'fairness' ? 'Fairness · lowest MBH' : 'Cost · cost library'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
            disabled={selectedList.length === 0 || selectedList.some((c) => jobs[c.pairingId]?.status === 'checking')}
            onClick={() => void runSelected()}
            data-testid="best-fit-run"
          >
            {selectedList.some((c) => jobs[c.pairingId]?.status === 'checking') ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> Checking…
              </span>
            ) : (
              `Find best-fit crew (${Math.min(remainingUnchecked, BEST_FIT_BATCH_LIMIT)})`
            )}
          </button>
        </div>

        {error ? (
          <div className="border-b border-border bg-destructive/10 px-3 py-2 text-2xs text-destructive">{error}</div>
        ) : null}

        <div className="grid min-h-[420px] grid-cols-[300px_1fr]">
          <div className="border-r border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">Open pairings</span>
              <label className="flex items-center gap-1 text-2xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={selectedList.length === candidates.length && candidates.length > 0}
                  onChange={(event) => {
                    for (const candidate of candidates) {
                      togglePairing(candidate.pairingId, event.target.checked)
                    }
                  }}
                  data-testid="best-fit-select-all"
                />
                Select all
              </label>
            </div>
            <div className="max-h-[420px] overflow-auto">
              {visibleCandidates.map((candidate) => {
                const job = jobs[candidate.pairingId]
                return (
                  <div
                    key={candidate.pairingId}
                    className={`flex gap-2 border-b border-border px-3 py-2 ${activePairingId === candidate.pairingId ? 'bg-primary/5' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(candidate.pairingId)}
                      onChange={(event) => togglePairing(candidate.pairingId, event.target.checked)}
                      aria-label={`Include ${candidate.label}`}
                      data-testid={`best-fit-include-${candidate.pairingId}`}
                    />
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => setActivePairing(candidate.pairingId)}
                      data-testid={`best-fit-open-${candidate.pairingId}`}
                    >
                      <div className="text-xs font-semibold">{candidate.label}</div>
                      <div className="text-2xs text-muted-foreground">
                        {candidate.base} · {candidate.fleet} · {candidate.departsLocal}
                      </div>
                      <div className="text-2xs text-muted-foreground">Open: {candidate.openSlots}</div>
                      <div className="text-2xs" data-testid={`best-fit-status-${candidate.pairingId}`}>
                        {job?.status === 'checking'
                          ? 'Checking candidates…'
                          : job?.status === 'done'
                            ? `Ready · ${job.result?.slots.map((slot) => `${slot.rank} best ${slot.bestCrewId ?? '—'}`).join(' · ')}`
                            : job?.status === 'error'
                              ? 'Failed'
                              : 'Not checked yet'}
                      </div>
                    </button>
                  </div>
                )
              })}
              {candidates.length > visibleCandidates.length ? (
                <div className="px-3 py-2 text-2xs text-muted-foreground">
                  Showing the first {visibleCandidates.length} of {candidates.length} open pairings in scope. Narrow the
                  Pairing pane filters to work on a specific base, fleet or date range.
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 p-3">
            {activeJob?.status === 'error' ? (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {activeJob.error}
              </div>
            ) : null}
            {!activeResult ? (
              <div className="flex h-[380px] items-center justify-center px-6 text-center text-xs text-muted-foreground">
                {activeJob?.status === 'checking'
                  ? 'Simulating each candidate against this crew\'s roster, then ranking.'
                  : 'Select one or more open pairings, then run Find best-fit crew.'}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold">
                    {activeResult.pairing.label ?? `Pairing ${activeResult.pairing.id}`}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {activeResult.pairing.base} · {activeResult.pairing.fleet} · block{' '}
                    {formatMinutes(activeResult.pairing.blockMinutes)} · credit {formatMinutes(activeResult.pairing.creditMinutes)} ·{' '}
                    {activeResult.coverage}
                  </span>
                  <span className="ml-auto text-2xs text-muted-foreground">
                    {activeResult.funnel.basic} matched · {activeResult.funnel.pass} pass · {activeResult.funnel.soft} soft ·{' '}
                    {activeResult.funnel.hard} blocked
                  </span>
                </div>
                {activeResult.slots.map((slot) => (
                  <div key={slot.rank} className="space-y-1">
                    <div className="text-xs font-semibold">
                      {slot.rank} · {slot.open} open seat{slot.open === 1 ? '' : 's'}
                      <span className="ml-2 font-normal text-2xs text-muted-foreground">
                        {slot.basicMatchCount} eligible crew
                      </span>
                    </div>
                    <SlotCandidateTable pairingId={activeResult.pairing.id} result={activeResult} rank={slot.rank} />
                  </div>
                ))}
                {activeCandidate ? <CandidateDetail candidate={activeCandidate} /> : null}
              </>
            )}
          </div>
        </div>

        <div className="border-t border-border px-3 py-2 text-2xs" data-testid="best-fit-combined">
          {applyResult ? (
            applyResult.failed === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {applyResult.assigned} assignment{applyResult.assigned === 1 ? '' : 's'} queued in the draft. Nothing is
                published yet — press <b>Save</b> in the toolbar to commit.
              </span>
            ) : (
              <span className="text-amber-600">
                {applyResult.assigned} queued, {applyResult.failed} refused by the live legality check (rolled back). Press{' '}
                <b>Save</b> in the toolbar to commit what remains.
              </span>
            )
          ) : applying ? (
            <span className="text-muted-foreground">Re-checking the combined selection, then assigning to the draft…</span>
          ) : combinedChecking ? (
            <span className="text-muted-foreground">Checking the combined selection…</span>
          ) : combinedStale ? (
            <span className="text-amber-600">Selection changed — run the combined check again.</span>
          ) : combined ? (
            combined.ok ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                Combined check passed · no hard findings or overlaps across the shortlist ·{' '}
                {formatMoney(combined.totalCost.amount, combined.totalCost.currencyCode)} combined
                {combined.softViolations.length > 0 ? ` · ${combined.softViolations.length} soft warning(s) to review` : ''}
                {` · ${chosenCount}/${requiredSlots.length} seats covered`}
              </span>
            ) : (
              <span className="text-destructive">
                Combined check blocked ·{' '}
                {[
                  ...combined.conflicts.map((c) => c.message),
                  ...combined.hardViolations.map((v) => `${v.crewId} rule ${v.ruleCode}: ${v.message}`),
                  ...(combined.message ? [combined.message] : []),
                ].join(' · ')}
                {` · ${chosenCount}/${requiredSlots.length} seats covered`}
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <RefreshCw className="h-3 w-3 shrink-0" />
              Simulated 1 pairing at a time. Use Check combined selection to validate the shortlist together.
            </span>
          )}
        </div>
      </div>
    </AppDialog>
  )
}
