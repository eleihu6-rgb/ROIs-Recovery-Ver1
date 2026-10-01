// gantt/src/components/ai-chat/viewport-diff.ts
//
// R'Bot "what changed since your last read". Each View Gantt read also keeps a small
// id-keyed state of what was in view (never sent to the server); the next read diffs
// against it. Objects are matched by id (pairing id, crew id, flight id), so an edit
// is reported as a change on that object, not as one row leaving and another arriving.
//
// If the visible window moved between reads, objects entering/leaving the view are a
// side effect of scrolling, so only state changes on objects seen in BOTH reads count.

import { classifyCoverage, type CoverageState } from '@/utils/pairing-coverage'
import type { PaneReadoutEntry } from './viewport-readout'

interface PaneState {
  kind: 'roster' | 'pairing' | 'flight'
  startMs: number
  endMs: number
  /** pairing id → { label, coverage } */
  pairings: Map<number, { label: string; coverage: CoverageState }>
  /** crew id → duty keys in view (P<pairingId> | G<rosterItemId>) */
  duties: Map<string, Set<string>>
  alerts: Set<string>
  /** flight id → { fltNum, cancelled, depMs } */
  flights: Map<number, { fltNum: string; cancelled: boolean; depMs: number }>
}

export interface ViewportState {
  capturedAt: string
  panes: Map<string, PaneState>
}

const inWindow = (s: string | null | undefined, e: string | null | undefined, startMs: number, endMs: number): boolean => {
  if (!s || !e) return false
  const a = Date.parse(s)
  const b = Date.parse(e)
  return !Number.isNaN(a) && !Number.isNaN(b) && a < endMs && b > startMs
}

const paneKey = (e: PaneReadoutEntry): string => `${e.contextId}|${e.paneId}`

export const buildViewportState = (entries: PaneReadoutEntry[], now: Date = new Date()): ViewportState => {
  const panes = new Map<string, PaneState>()
  for (const e of entries) {
    const { startMs, endMs } = e.window
    const st: PaneState = {
      kind: e.data.kind, startMs, endMs,
      pairings: new Map(), duties: new Map(), alerts: new Set(), flights: new Map(),
    }
    const d = e.data
    if (d.kind === 'pairing') {
      for (const it of d.items) {
        const p = it.pairing
        if (!inWindow(p.schStrDtUtc, p.schEndDtUtc, startMs, endMs)) continue
        st.pairings.set(p.id, { label: p.pairingLabel ?? String(p.id), coverage: classifyCoverage(p.composition ?? [], d.coverageRanks) })
      }
    } else if (d.kind === 'roster') {
      for (const r of d.rows) {
        st.duties.set(r.crewId, new Set())
        if (r.hasAlert) st.alerts.add(r.crewId)
      }
      for (const it of d.items) {
        const set = st.duties.get(it.crewId)
        if (!set || !inWindow(it.schStrDtUtc ?? it.actStrDtUtc, it.schEndDtUtc ?? it.actEndDtUtc, startMs, endMs)) continue
        set.add(it.pairingId != null ? `P${it.pairingId}` : `G${it.id}`)
      }
    } else {
      for (const row of d.rows) {
        for (const f of row.flights) {
          if (!inWindow(f.schDepDtUtc, f.schArvDtUtc, startMs, endMs)) continue
          st.flights.set(f.id, { fltNum: f.fltNum, cancelled: f.isCancelled, depMs: Date.parse(f.actDepDtUtc || f.estDepDtUtc || f.schDepDtUtc) })
        }
      }
    }
    panes.set(paneKey(e), st)
  }
  return { capturedAt: now.toISOString(), panes }
}

/** Names shown per change line in the bubble; the count always covers everything. */
const NAMES_PER_LINE = 5
const named = (ids: string[]): string =>
  ids.length <= NAMES_PER_LINE ? ids.join(', ') : `${ids.slice(0, NAMES_PER_LINE).join(', ')} +${ids.length - NAMES_PER_LINE} more`
const line = (count: number, what: string, ids: string[]): string => `${count} ${what}: ${named(ids)}`

const isCovered = (c: CoverageState): boolean => c === 'full' || c === 'over'

/** Window equality tolerant of sub-minute re-measurement jitter. */
const sameWindow = (a: PaneState, b: PaneState): boolean =>
  Math.abs(a.startMs - b.startMs) < 60_000 && Math.abs(a.endMs - b.endMs) < 60_000

/** Plain-English change lines (empty = nothing changed). */
export const diffViewportStates = (prev: ViewportState, cur: ViewportState): string[] => {
  const out: string[] = []
  let moved = false
  for (const [key, now] of cur.panes) {
    const was = prev.panes.get(key)
    if (!was || was.kind !== now.kind) continue
    const fixed = sameWindow(was, now)
    if (!fixed) moved = true

    if (now.kind === 'pairing') {
      const covered: string[] = []
      const uncovered: string[] = []
      const shifted: string[] = []
      for (const [id, n] of now.pairings) {
        const o = was.pairings.get(id)
        if (!o || o.coverage === n.coverage) continue
        if (!isCovered(o.coverage) && isCovered(n.coverage)) covered.push(n.label)
        else if (isCovered(o.coverage) && !isCovered(n.coverage)) uncovered.push(n.label)
        else shifted.push(`${n.label} ${o.coverage}→${n.coverage}`)
      }
      if (covered.length) out.push(line(covered.length, 'pairing(s) now fully covered', covered))
      if (uncovered.length) out.push(line(uncovered.length, 'pairing(s) now have open positions', uncovered))
      if (shifted.length) out.push(line(shifted.length, 'pairing(s) changed coverage', shifted))
      if (fixed) {
        const added = [...now.pairings.keys()].filter((id) => !was.pairings.has(id)).map((id) => now.pairings.get(id)!.label)
        const gone = [...was.pairings.keys()].filter((id) => !now.pairings.has(id)).map((id) => was.pairings.get(id)!.label)
        if (added.length) out.push(line(added.length, 'pairing(s) appeared in the pairing pane', added))
        if (gone.length) out.push(line(gone.length, 'pairing(s) left the pairing pane', gone))
      }
    } else if (now.kind === 'roster') {
      const gained: string[] = []
      const lost: string[] = []
      // Duty sets are window-scoped: when the view moved, duties scroll in/out — skip.
      for (const [crewId, n] of fixed ? now.duties : new Map<string, Set<string>>()) {
        const o = was.duties.get(crewId)
        if (!o) continue
        const plus = [...n].filter((k) => !o.has(k)).length
        const minus = [...o].filter((k) => !n.has(k)).length
        if (plus) gained.push(`${crewId} +${plus}`)
        if (minus) lost.push(`${crewId} −${minus}`)
      }
      if (gained.length) out.push(line(gained.length, 'crew gained duties', gained))
      if (lost.length) out.push(line(lost.length, 'crew lost duties', lost))
      const newAlerts = [...now.alerts].filter((c) => was.duties.has(c) && !was.alerts.has(c))
      const cleared = [...was.alerts].filter((c) => now.duties.has(c) && !now.alerts.has(c))
      if (newAlerts.length) out.push(line(newAlerts.length, 'crew have new alerts', newAlerts))
      if (cleared.length) out.push(line(cleared.length, 'crew alerts cleared', cleared))
    } else {
      const cancelled: string[] = []
      const restored: string[] = []
      const retimed: string[] = []
      for (const [id, n] of now.flights) {
        const o = was.flights.get(id)
        if (!o) continue
        if (!o.cancelled && n.cancelled) cancelled.push(n.fltNum)
        else if (o.cancelled && !n.cancelled) restored.push(n.fltNum)
        if (o.depMs !== n.depMs && !Number.isNaN(o.depMs) && !Number.isNaN(n.depMs)) {
          const mins = Math.round((n.depMs - o.depMs) / 60_000)
          retimed.push(`${n.fltNum} ${mins > 0 ? '+' : ''}${mins}m`)
        }
      }
      if (cancelled.length) out.push(line(cancelled.length, 'flight(s) cancelled', cancelled))
      if (restored.length) out.push(line(restored.length, 'flight(s) reinstated', restored))
      if (retimed.length) out.push(line(retimed.length, 'flight(s) retimed', retimed))
    }
  }
  if (moved) out.unshift('Your view moved since the last read — comparing only objects visible in both reads.')
  return out
}

const hhmm = (iso: string): string => iso.slice(11, 16)

/** Bubble text for the diff; `null` when there is no previous read to compare with. */
export const formatViewportDiff = (prev: ViewportState | null, lines: string[]): string | null => {
  if (!prev) return null
  const head = `Since your last read (${hhmm(prev.capturedAt)} UTC):`
  const real = lines.filter((l) => !l.startsWith('Your view moved'))
  if (real.length === 0) return `${head} no changes on screen.${lines.length ? `\n${lines[0]}` : ''}`
  return [head, ...lines.map((l) => `• ${l}`)].join('\n')
}
