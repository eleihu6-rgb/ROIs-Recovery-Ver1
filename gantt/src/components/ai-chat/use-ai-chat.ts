import { useState, useCallback, useRef } from 'react'
import { aiApi } from '@/services/ai-api'
import { applyGanttFilters } from '@/utils/apply-filters'
import { useDraftStore } from '@/stores/draft-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useRosterStore } from '@/stores/roster-store'
import { dispatchAiAction } from './dispatch-ai-action'
import { readOpenPanes } from './viewport-readout'
import { buildViewportSnapshot, formatViewportSummary, type ViewportSnapshot } from './viewport-snapshot'
import { buildViewportState, diffViewportStates, formatViewportDiff, type ViewportState } from './viewport-diff'
import type { AiAction, ChatMessage } from './types'

export interface ThreadEntry extends ChatMessage {
  /** confirmation chips for applied actions */
  applied?: string[]
  /** suggested follow-up questions (clickable chips) */
  followUps?: string[]
  /** L2 plan card: draft changes this instruction staged (spec §16) */
  plan?: { rbotOpIds: string[]; instruction: string }
}

/** Actions that stage draft changes (or ask to save them) → show a plan card. */
const PLAN_ACTIONS = new Set<AiAction['type']>(['move_task', 'swap_tasks', 'unassign_task', 'add_ground_task', 'save_changes'])

/** Let post-Save reloads settle before reading the screen for the report (max ~5s). */
const waitForPanesIdle = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) {
    if (!usePairingStore.getState().loading && !useRosterStore.getState().main.loading) break
    await new Promise((r) => setTimeout(r, 100))
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)))
}

/** Follow-up chips that only appear when the view actually has something to ask about. */
const followUpsFor = (snap: ViewportSnapshot): string[] => {
  const out: string[] = []
  if (snap.panes.some((p) => p.kind === 'pairing' && p.openPositionPairings > 0)) {
    out.push('List the pairings with open positions')
    if (snap.panes.some((p) => p.kind === 'pairing' && p.context === 'Live')) out.push('Find best-fit crew for the open pairings in view')
  }
  if (snap.panes.some((p) => p.kind === 'roster' && p.crewWithAlerts > 0)) out.push('Which crew have alerts?')
  if (snap.panes.some((p) => p.kind === 'roster' && p.crewWithoutDutyInView > 0)) out.push('Which crew have no duty in view?')
  return out
}

/** Action types whose effect requires a data reload (same reload the Filter dialog Apply triggers). */
const RELOAD_ACTIONS = new Set<AiAction['type']>([
  'filter_crew',
  'filter_pairing',
  'filter_flight',
  'reset_filters',
  'set_date_range',
  // Opens the Pairing Build Automation dialog; the Gantt range was just moved onto
  // the requested build window, so the panes reload with the new window.
  'build_pairings',
  // Opens the Auto-assign dialog, which plans against the (just moved) viewport month.
  'auto_assign_pairings',
])

export function useAiChat() {
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const [busy, setBusy] = useState(false)
  // Last View Gantt read — attached to every later question so answers stay grounded
  // in what the user saw. Only replaced when the user presses View Gantt again.
  const [viewport, setViewport] = useState<ViewportSnapshot | null>(null)
  // Id-keyed state of the previous read, for "what changed since your last read".
  const lastStateRef = useRef<ViewportState | null>(null)

  /** Read the screen: summary (+ diff vs the previous read). `prefix` turns it into a report. */
  const readView = useCallback((prefix?: string) => {
    const now = new Date()
    const entries = readOpenPanes()
    const snap = buildViewportSnapshot(entries, now)
    let diffText: string | null = null
    if (entries.length > 0) {
      const state = buildViewportState(entries, now)
      const prev = lastStateRef.current
      if (prev) {
        const lines = diffViewportStates(prev, state)
        snap.changesSinceLastRead = lines
        diffText = formatViewportDiff(prev, lines)
      }
      lastStateRef.current = state
    }
    setViewport(snap.panes.length > 0 ? snap : null)
    const summary = formatViewportSummary(snap)
    const body = diffText ? `${summary}\n\n${diffText}` : summary
    const reply: ThreadEntry = { role: 'assistant', content: prefix ? `${prefix}\n\n${body}` : body, followUps: followUpsFor(snap) }
    setThread((t) => (prefix ? [...t, reply] : [...t, { role: 'user', content: 'View Gantt' }, reply]))
  }, [])

  const viewGantt = useCallback(() => {
    if (!busy) readView()
  }, [busy, readView])

  // Post-commit report (spec §16.4): re-read the real screen after Save, not just "done".
  const onPlanSaved = useCallback((count: number) => {
    void waitForPanesIdle().then(() => readView(`Saved ${count} change${count === 1 ? '' : 's'}. Here is the screen after the save:`))
  }, [readView])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      const userMsg: ThreadEntry = { role: 'user', content: trimmed }
      const history: ChatMessage[] = [
        ...thread.map((m) => ({ role: m.role, content: m.content })),
        userMsg,
      ]
      setThread((t) => [...t, userMsg])
      setBusy(true)
      try {
        const resp = await aiApi.chat(history, viewport ?? undefined)
        // Sequential, not Promise.all: mutating actions await their own legality confirm
        // dialog (showConfirmDialog) before the next action runs, so two dependent edits
        // in one instruction never race each other's lock/legality checks.
        const applied: string[] = []
        const opsBefore = new Set(useDraftStore.getState().operations.map((o) => o.id))
        for (const action of resp.actions) {
          const s = await dispatchAiAction(action)
          if (s !== null) applied.push(s)
        }
        // Centralized reload: trigger exactly once if any action needs fresh data.
        // Reuses the Filter dialog's Apply path (applyGanttFilters): selective refetch
        // by diffing appliedFilters — crew filters refetch the crew list (refreshAllPanes
        // only reloaded the OLD selectedCrewIds, so AI crew filters never took effect),
        // date changes reload every pane, and markApplied keeps pane badges truthful.
        if (resp.actions.some((a) => RELOAD_ACTIONS.has(a.type))) {
          void applyGanttFilters()
        }
        const rbotOpIds = useDraftStore.getState().operations.map((o) => o.id).filter((id) => !opsBefore.has(id))
        const wantsPlan = resp.actions.some((a) => PLAN_ACTIONS.has(a.type))
        const plan = wantsPlan && (rbotOpIds.length > 0 || resp.actions.some((a) => a.type === 'save_changes'))
          ? { rbotOpIds, instruction: trimmed }
          : undefined
        setThread((t) => [...t, { role: 'assistant', content: resp.content, applied, plan }])
      } catch (err) {
        console.error('[ai-chat]', err)
        setThread((t) => [
          ...t,
          { role: 'assistant', content: 'AI request failed. Please try again.' },
        ])
      } finally {
        setBusy(false)
      }
    },
    [thread, busy, viewport],
  )

  return { thread, busy, send, viewGantt, onPlanSaved }
}
