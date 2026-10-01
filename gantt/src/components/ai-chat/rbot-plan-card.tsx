// gantt/src/components/ai-chat/rbot-plan-card.tsx
//
// R'Bot L2 plan card (spec §16): shows EVERY pending change Save would commit (R'Bot's
// marked), the legality pre-check result and the autonomy policy, then:
//   Yes, save     → saveDraft({ via: 'rbot' }) — the normal Save path, so legality
//                   confirm, locks and permissions all still apply; audit-tagged
//   Keep as draft → nothing saved; the user reviews on the Gantt
//   Cancel        → removes only R'Bot's staged changes
// Approval covers what is on the card at click time: if the draft changed since the card
// was drawn, Yes re-asks instead of saving.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { useDraftStore } from '@/stores/draft-store'
import { useRosterStore } from '@/stores/roster-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { saveDraft } from '@/utils/save-draft'
import { buildPlanLines, canRbotSave, type PlanLine } from './rbot-plan'
import { loadRbotPolicy, FAIL_CLOSED_POLICY, type RbotPolicy } from './rbot-policy'

type CardStatus = 'checking' | 'ready' | 'saving' | 'saved' | 'kept' | 'cancelled'

interface Legality {
  newViolations: number
  blocking: boolean
  error?: boolean
}

interface RbotPlanCardProps {
  /** draft op ids R'Bot added for this instruction (empty for "save my changes") */
  rbotOpIds: string[]
  instruction: string
  /** only the newest card is actionable */
  active: boolean
  onSaved: (savedCount: number) => void
}

const linesKey = (lines: PlanLine[]): string => lines.map((l) => l.opId).join(',')

export const RbotPlanCard = ({ rbotOpIds, instruction, active, onSaved }: RbotPlanCardProps) => {
  const operations = useDraftStore((s) => s.operations)
  const baseItems = useRosterStore((s) => s.main.baseItems)
  const rbotSet = useMemo(() => new Set(rbotOpIds), [rbotOpIds])
  const lines = useMemo(() => buildPlanLines(operations, rbotSet, baseItems), [operations, rbotSet, baseItems])
  const key = linesKey(lines)

  const [status, setStatus] = useState<CardStatus>('checking')
  const [policy, setPolicy] = useState<RbotPolicy>(FAIL_CLOSED_POLICY)
  const [legality, setLegality] = useState<Legality | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // The exact change list the user is looking at (what "Yes" approves).
  const shownKeyRef = useRef<string>('')
  const done = status === 'saved' || status === 'kept' || status === 'cancelled'

  // Re-check policy + legality whenever the pending change list changes.
  useEffect(() => {
    if (done || !active) return
    let stale = false
    setStatus('checking')
    const run = async (): Promise<void> => {
      const nextPolicy = await loadRbotPolicy()
      let nextLegality: Legality = { newViolations: 0, blocking: false }
      const draft = useDraftStore.getState()
      if (draft.operations.length > 0) {
        try {
          const base = useRosterStore.getState().main.baseItems
          const res = await useRuleCheckStore.getState().preCheck(draft.getDirtyCrewIds(), draft.applyDraftOps(base), base)
          const fresh = res.violations.filter((v) => v.isNew)
          nextLegality = { newViolations: fresh.length, blocking: res.hasBlocking }
        } catch {
          nextLegality = { newViolations: 0, blocking: false, error: true }
        }
      }
      if (stale) return
      setPolicy(nextPolicy)
      setLegality(nextLegality)
      shownKeyRef.current = key
      setStatus('ready')
    }
    void run()
    return () => { stale = true }
  }, [key, active, done])

  const verdict = canRbotSave(lines, policy)

  const save = useCallback(async (): Promise<void> => {
    // Approval covers only the list on screen: re-read policy and the draft first.
    const current = linesKey(buildPlanLines(useDraftStore.getState().operations, rbotSet, useRosterStore.getState().main.baseItems))
    if (current !== shownKeyRef.current) {
      setNote('The changes were edited since this card was shown — review the updated list, then approve again.')
      return
    }
    const fresh = await loadRbotPolicy()
    setPolicy(fresh)
    const check = canRbotSave(lines, fresh)
    if (!check.ok) { setNote(check.reason); return }
    setStatus('saving')
    setNote(null)
    const ok = await saveDraft({ via: 'rbot', instruction })
    if (ok && useDraftStore.getState().operations.length === 0) {
      setStatus('saved')
      onSaved(lines.length)
    } else {
      setStatus('ready')
      setNote('Not saved — the legality check was declined or the save failed. Nothing was committed by R\'Bot.')
    }
  }, [rbotSet, lines, instruction, onSaved])

  const cancel = useCallback((): void => {
    const draft = useDraftStore.getState()
    for (const id of [...rbotOpIds].reverse()) draft.removeOp(id)
    setStatus('cancelled')
  }, [rbotOpIds])

  const rbotCount = lines.filter((l) => l.byRbot).length
  const otherCount = lines.length - rbotCount

  return (
    <div className="mt-1 rounded-md border border-border bg-background p-2 text-left text-xs" data-testid="rbot-plan-card" data-status={status}>
      <div className="mb-1 font-semibold">
        {status === 'saved' ? 'R\'Bot plan — saved' : 'R\'Bot plan — unsaved changes'}
      </div>

      {status === 'saved' && <p data-testid="rbot-plan-result">Saved. See the report below.</p>}
      {status === 'kept' && <p data-testid="rbot-plan-result">Kept as draft — review on the Gantt and press Save when ready.</p>}
      {status === 'cancelled' && <p data-testid="rbot-plan-result">Cancelled — R&apos;Bot&apos;s changes were removed from the draft.</p>}
      {!active && !done && <p className="text-muted-foreground" data-testid="rbot-plan-result">Superseded by a newer plan.</p>}

      {active && !done && (
        <>
          {lines.length === 0 ? (
            <p className="text-muted-foreground" data-testid="rbot-plan-empty">No unsaved changes.</p>
          ) : (
            <ul className="mb-1 space-y-0.5" data-testid="rbot-plan-lines">
              {lines.map((l) => (
                <li key={l.opId} className="flex items-center gap-1.5" data-testid="rbot-plan-line">
                  <span className={`shrink-0 rounded-sm px-1 text-3xs ${l.byRbot ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {l.byRbot ? 'R\'Bot' : 'You'}
                  </span>
                  <span className={l.manualOnly ? 'text-destructive' : ''}>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
          {otherCount > 0 && rbotCount > 0 && (
            <p className="mb-1 text-muted-foreground">Save commits all {lines.length} pending changes, including {otherCount} of yours.</p>
          )}

          <div className="mb-1 flex items-center gap-1.5" data-testid="rbot-plan-legality">
            {status === 'checking' || !legality ? (
              <span className="text-muted-foreground">Checking legality…</span>
            ) : legality.error ? (
              <><TriangleAlert className="h-3 w-3 shrink-0 text-warning" /><span>Legality check unavailable — Save will re-check.</span></>
            ) : legality.newViolations === 0 ? (
              <><ShieldCheck className="h-3 w-3 shrink-0 text-success" /><span>No new legality violations.</span></>
            ) : (
              <><TriangleAlert className="h-3 w-3 shrink-0 text-destructive" /><span>{legality.newViolations} new violation(s){legality.blocking ? ', including blocking' : ''} — Save will ask you to confirm.</span></>
            )}
          </div>

          {status === 'ready' && !verdict.ok && <p className="mb-1 text-muted-foreground" data-testid="rbot-plan-blocked">{verdict.reason}</p>}
          {note && <p className="mb-1 text-destructive" data-testid="rbot-plan-note">{note}</p>}

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {rbotCount > 0 && (
              <button
                type="button"
                onClick={cancel}
                disabled={status === 'saving'}
                className="rounded-full border border-border px-2.5 py-0.5 text-2xs hover:bg-accent disabled:opacity-50"
                data-testid="rbot-plan-cancel"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatus('kept')}
              disabled={status === 'saving'}
              className="rounded-full border border-border px-2.5 py-0.5 text-2xs hover:bg-accent disabled:opacity-50"
              data-testid="rbot-plan-keep"
            >
              Keep as draft
            </button>
            {verdict.ok && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={status !== 'ready'}
                className="rounded-full bg-primary px-2.5 py-0.5 text-2xs text-primary-foreground disabled:opacity-50"
                data-testid="rbot-plan-save"
              >
                {status === 'saving' ? 'Saving…' : `Yes, save ${lines.length} change${lines.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
