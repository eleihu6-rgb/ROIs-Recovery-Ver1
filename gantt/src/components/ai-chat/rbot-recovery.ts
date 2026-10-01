// gantt/src/components/ai-chat/rbot-recovery.ts
//
// R'Bot → existing Live Recovery and Best-fit workflows. R'Bot only OPENS the same
// dialogs the context menu / Alert Center open (same window events, same store), scoped
// to what the user asked for. The planner picks an option and Applies (draft), then
// Saves — nothing here stages or saves by itself.

import { usePairingStore } from '@/stores/pairing-store'
import { useBestFitStore, BEST_FIT_BATCH_LIMIT } from '@/stores/best-fit-store'
import { buildBestFitPairingOptions } from '@/utils/best-fit-candidates'
import { classifyCoverage } from '@/utils/pairing-coverage'
import { readOpenPanes } from './viewport-readout'
import type { PairingItem } from '@/types/pairing'

/** Detail for the `recovery:shortcut` window event; the Live roster pane fills `matched`. */
export interface RecoveryShortcutScope {
  crewId?: string
  ruleCode?: string
  pairingId?: number
  /** set synchronously by the listener: number of recoverable alerts shown; -1 = nobody listening */
  matched: number
}

/** Does an Alert Center row fall inside R'Bot's recovery scope? (null scope = every row) */
export const matchesRecoveryScope = (
  row: { crewId: string; ruleCode: string; pairingId?: number | null; affectedCrewIds?: string[] },
  scope: Pick<RecoveryShortcutScope, 'crewId' | 'ruleCode' | 'pairingId'> | null,
): boolean =>
  !scope || (
    (!scope.crewId || row.crewId === scope.crewId || (row.affectedCrewIds ?? []).includes(scope.crewId))
    && (!scope.ruleCode || row.ruleCode === scope.ruleCode)
    && (scope.pairingId == null || row.pairingId === scope.pairingId)
  )

const hasOpenPosition = (it: PairingItem): boolean => {
  const c = classifyCoverage(it.pairing.composition ?? [])
  return c === 'open' || c === 'partial'
}

/** Resolve a pairing the user named (numeric id or label, optional YYYY-MM-DD) among loaded pairings. */
export const resolvePairing = (ref: string, date?: string): { item: PairingItem } | { error: string } => {
  const items = usePairingStore.getState().items
  const trimmed = ref.trim()
  const byId = /^\d+$/.test(trimmed) ? items.find((it) => it.pairing.id === Number(trimmed)) : undefined
  if (byId) return { item: byId }
  const upper = trimmed.toUpperCase()
  let matches = items.filter((it) => (it.pairing.pairingLabel ?? '').toUpperCase() === upper)
  if (date) matches = matches.filter((it) => (it.pairing.pairingDt ?? it.pairing.schStrDtUtc ?? '').slice(0, 10) === date)
  if (matches.length === 1) return { item: matches[0] }
  if (matches.length === 0) return { error: `Pairing ${trimmed}${date ? ` on ${date}` : ''} is not loaded in the pairing pane.` }
  const days = [...new Set(matches.map((m) => (m.pairing.pairingDt ?? m.pairing.schStrDtUtc).slice(0, 10)))].slice(0, 5)
  return { error: `Pairing ${trimmed} runs on several days (${days.join(', ')}…) — which date?` }
}

export const openRecoveryForAlerts = (scope: Omit<RecoveryShortcutScope, 'matched'>): string => {
  const detail: RecoveryShortcutScope = { ...scope, matched: -1 }
  window.dispatchEvent(new CustomEvent('recovery:shortcut', { detail }))
  const who = [scope.crewId ? `crew ${scope.crewId}` : null, scope.ruleCode ? `rule ${scope.ruleCode}` : null]
    .filter(Boolean).join(', ')
  if (detail.matched < 0) return 'Recovery needs the Live Gantt roster open.'
  if (detail.matched === 0) {
    return `No recoverable alert${who ? ` for ${who}` : ''} in the loaded Live data (Recovery handles rules 8004, 1001 and 3007).`
  }
  return `Opened Recovery for ${detail.matched} alert${detail.matched === 1 ? '' : 's'}${who ? ` (${who})` : ''} — pick an option and Apply`
}

export const openRecoveryForOpenPairing = (ref: string, date?: string): string => {
  const resolved = resolvePairing(ref, date)
  if ('error' in resolved) return resolved.error
  const { item } = resolved
  const label = item.pairing.pairingLabel ?? String(item.pairing.id)
  if (!hasOpenPosition(item)) return `Pairing ${label} has no open position.`
  window.dispatchEvent(new CustomEvent('recovery:open', { detail: { kind: 'open-pairing', pairingId: item.pairing.id } }))
  return `Opened Recovery — open seats for ${label} — pick an option and Apply`
}

/** Open pairings with an open position that overlap the pairing pane's visible window. */
const openPairingsInView = (): PairingItem[] => {
  const pane = readOpenPanes().find((e) => e.contextId === 'live' && e.data.kind === 'pairing')
  if (!pane || pane.data.kind !== 'pairing') return []
  const { startMs, endMs } = pane.window
  return pane.data.items.filter((it) => {
    const s = Date.parse(it.pairing.schStrDtUtc)
    const e = Date.parse(it.pairing.schEndDtUtc)
    return hasOpenPosition(it) && s < endMs && e > startMs
  })
}

export const openBestFit = (refs: string[], date?: string, ranks: string[] = []): string => {
  let items: PairingItem[]
  if (refs.length > 0) {
    items = []
    for (const ref of refs) {
      const resolved = resolvePairing(ref, date)
      if ('error' in resolved) return resolved.error
      items.push(resolved.item)
    }
  } else {
    items = openPairingsInView()
    if (items.length === 0) return 'No pairing with an open position is in view — name a pairing or open the Live pairing pane.'
  }
  const options = buildBestFitPairingOptions(items, ranks)
  if (options.length === 0) return refs.length === 1 ? `Pairing ${refs[0]} is already fully staffed.` : 'Those pairings are already fully staffed.'
  // The dialog checks at most BEST_FIT_BATCH_LIMIT pairings per run (earliest first).
  const preselected = refs.length > 0 ? options.slice(0, BEST_FIT_BATCH_LIMIT).map((o) => o.pairingId) : undefined
  useBestFitStore.getState().openWith(options, preselected)
  const n = preselected?.length ?? Math.min(options.length, BEST_FIT_BATCH_LIMIT)
  return `Opened Best-fit crew for ${n} pairing${n === 1 ? '' : 's'}${refs.length === 0 ? ' in view' : ''}${ranks.length ? ` (${ranks.join('/')})` : ''} — review the ranking, then Apply`
}
