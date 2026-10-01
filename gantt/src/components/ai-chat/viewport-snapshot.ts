// gantt/src/components/ai-chat/viewport-snapshot.ts
//
// Pure builder: turns the open panes' readouts (viewport-readout.ts) into the compact
// ViewportSnapshot R'Bot summarizes and sends to the LLM. Counts are computed here —
// deterministic — so the LLM only explains numbers, never invents them.
//
// Scope of "on screen": the rows each pane currently shows (its filters + quick
// filter applied) whose duty / pairing / flight overlaps the pane's visible time window.

import { classifyCoverage, slotsForRanks, type CoverageState } from '@/utils/pairing-coverage'
import { pairingCreditedMinutes } from '@/utils/pairing-credit'
import { formatBlockMinutes } from '@/components/gantt/gantt-utils'
import type { GanttContextId } from '@/types/gantt-context'
import type { PaneReadoutEntry, PaneWindow } from './viewport-readout'

/** Max named objects per list sent to the LLM (keeps payload small, no bulk crew data). */
export const SNAPSHOT_LIST_CAP = 20

export interface SnapshotWindow {
  startUtc: string
  endUtc: string
  timezone: string
}

interface PaneBase {
  paneId: string
  context: string
  window: SnapshotWindow
}

export interface RosterPaneSnapshot extends PaneBase {
  kind: 'roster'
  crewInPane: number
  crewWithDutyInView: number
  crewWithoutDutyInView: number
  flyingDutiesInView: number
  groundTasksInView: number
  crewWithAlerts: number
  byRank: Record<string, number>
  byBase: Record<string, number>
  alertCrewIds: string[]
  idleCrewIds: string[]
}

export interface OpenPairingRef {
  id: number
  label: string
  base: string
  fleet: string
  startUtc: string
  coverage: CoverageState
  /** e.g. "CA 1, FO 2" — positions still to fill */
  openPositions: string
}

export interface PairingPaneSnapshot extends PaneBase {
  kind: 'pairing'
  pairingsInPane: number
  pairingsInView: number
  coverage: Record<CoverageState, number>
  /** open + partial: pairings with at least one open position */
  openPositionPairings: number
  openPositionCredit: string
  openPositionsByRank: Record<string, number>
  openPairings: OpenPairingRef[]
}

export interface FlightPaneSnapshot extends PaneBase {
  kind: 'flight'
  aircraftRows: number
  flightsInView: number
  cancelledInView: number
}

export type PaneSnapshot = RosterPaneSnapshot | PairingPaneSnapshot | FlightPaneSnapshot

/**
 * Scope R'Bot may reuse when the user says "for this view" (build pairings, auto-assign).
 * Live panes only — those features act on the Live board. A field is present only when the
 * screen pins it down unambiguously (one base, one fleet, ≤ SNAPSHOT_LIST_CAP crew).
 */
export interface ViewDefaults {
  /** visible window as civil dates in the view timezone, YYYY-MM-DD (inclusive) */
  start: string
  end: string
  base?: string
  fleets?: string[]
  crewIds?: string[]
}

export interface ViewportSnapshot {
  capturedAt: string
  panes: PaneSnapshot[]
  viewDefaults?: ViewDefaults
  /** "What changed since the last read" lines (set by the chat hook when a previous read exists). */
  changesSinceLastRead?: string[]
}

const contextLabel = (id: GanttContextId): string => (id === 'live' ? 'Live' : `Scenario ${id}`)

const overlaps = (startIso: string | null | undefined, endIso: string | null | undefined, w: PaneWindow): boolean => {
  if (!startIso || !endIso) return false
  const s = Date.parse(startIso)
  const e = Date.parse(endIso)
  if (Number.isNaN(s) || Number.isNaN(e)) return false
  return s < w.endMs && e > w.startMs
}

const toWindow = (w: PaneWindow): SnapshotWindow => ({
  startUtc: new Date(w.startMs).toISOString(),
  endUtc: new Date(w.endMs).toISOString(),
  timezone: w.timezone,
})

const bump = (m: Record<string, number>, k: string, by = 1): void => {
  const key = k || '—'
  m[key] = (m[key] ?? 0) + by
}

const buildPane = (entry: PaneReadoutEntry): PaneSnapshot => {
  const base: PaneBase = { paneId: entry.paneId, context: contextLabel(entry.contextId), window: toWindow(entry.window) }
  const w = entry.window
  const d = entry.data

  if (d.kind === 'roster') {
    const shown = new Set(d.rows.map((r) => r.crewId))
    const busy = new Set<string>()
    const flyingDuties = new Set<string>()
    let groundTasks = 0
    for (const it of d.items) {
      if (!shown.has(it.crewId)) continue
      if (!overlaps(it.schStrDtUtc ?? it.actStrDtUtc, it.schEndDtUtc ?? it.actEndDtUtc, w)) continue
      busy.add(it.crewId)
      // roster_flight is crew × segment: count one flying duty per crew × pairing.
      if (it.pairingId != null) flyingDuties.add(`${it.crewId}|${it.pairingId}`)
      else groundTasks++
    }
    const byRank: Record<string, number> = {}
    const byBase: Record<string, number> = {}
    for (const r of d.rows) {
      bump(byRank, r.rank)
      bump(byBase, r.base)
    }
    const alerts = d.rows.filter((r) => r.hasAlert).map((r) => r.crewId)
    const idle = d.rows.filter((r) => !busy.has(r.crewId)).map((r) => r.crewId)
    return {
      ...base,
      kind: 'roster',
      crewInPane: d.rows.length,
      crewWithDutyInView: busy.size,
      crewWithoutDutyInView: idle.length,
      flyingDutiesInView: flyingDuties.size,
      groundTasksInView: groundTasks,
      crewWithAlerts: alerts.length,
      byRank,
      byBase,
      alertCrewIds: alerts.slice(0, SNAPSHOT_LIST_CAP),
      idleCrewIds: idle.slice(0, SNAPSHOT_LIST_CAP),
    }
  }

  if (d.kind === 'pairing') {
    const coverage: Record<CoverageState, number> = { open: 0, partial: 0, full: 0, over: 0 }
    const openPositionsByRank: Record<string, number> = {}
    const openPairings: OpenPairingRef[] = []
    let inView = 0
    let openCount = 0
    let openCredit = 0
    for (const it of d.items) {
      const p = it.pairing
      if (!overlaps(p.schStrDtUtc, p.schEndDtUtc, w)) continue
      inView++
      const comp = p.composition ?? []
      const state = classifyCoverage(comp, d.coverageRanks)
      coverage[state]++
      if (state !== 'open' && state !== 'partial') continue
      openCount++
      openCredit += pairingCreditedMinutes(it)
      const short: string[] = []
      for (const s of slotsForRanks(comp, d.coverageRanks)) {
        const gap = (s.plan ?? 0) - (s.fill ?? 0)
        if (gap <= 0) continue
        bump(openPositionsByRank, s.rank ?? '', gap)
        short.push(`${s.rank ?? '—'} ${gap}`)
      }
      if (openPairings.length < SNAPSHOT_LIST_CAP) {
        openPairings.push({
          id: p.id,
          label: p.pairingLabel ?? String(p.id),
          base: p.base,
          fleet: p.fleet,
          startUtc: p.schStrDtUtc,
          coverage: state,
          openPositions: short.join(', '),
        })
      }
    }
    return {
      ...base,
      kind: 'pairing',
      pairingsInPane: d.items.length,
      pairingsInView: inView,
      coverage,
      openPositionPairings: openCount,
      openPositionCredit: formatBlockMinutes(openCredit),
      openPositionsByRank,
      openPairings,
    }
  }

  let flights = 0
  let cancelled = 0
  for (const row of d.rows) {
    for (const f of row.flights) {
      if (!overlaps(f.schDepDtUtc, f.schArvDtUtc, w)) continue
      flights++
      if (f.isCancelled) cancelled++
    }
  }
  return { ...base, kind: 'flight', aircraftRows: d.rows.length, flightsInView: flights, cancelledInView: cancelled }
}

/** Civil date (YYYY-MM-DD) of an instant in a timezone. */
export const civilDate = (ms: number, timezone: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

const buildViewDefaults = (entries: PaneReadoutEntry[]): ViewDefaults | undefined => {
  const live = entries.filter((e) => e.contextId === 'live')
  if (live.length === 0) return undefined
  const w = live[0].window
  const out: ViewDefaults = { start: civilDate(w.startMs, w.timezone), end: civilDate(w.endMs - 1, w.timezone) }

  const pairingBases = new Set<string>()
  const fleets = new Set<string>()
  const rosterBases = new Set<string>()
  const crewIds: string[] = []
  for (const e of live) {
    const d = e.data
    if (d.kind === 'pairing') {
      for (const it of d.items) {
        if (!overlaps(it.pairing.schStrDtUtc, it.pairing.schEndDtUtc, e.window)) continue
        if (it.pairing.base) pairingBases.add(it.pairing.base)
        if (it.pairing.fleet) fleets.add(it.pairing.fleet)
      }
    } else if (d.kind === 'roster') {
      for (const r of d.rows) {
        if (r.base) rosterBases.add(r.base)
        crewIds.push(r.crewId)
      }
    }
  }
  const bases = pairingBases.size > 0 ? pairingBases : rosterBases
  if (bases.size === 1) out.base = [...bases][0]
  if (fleets.size === 1) out.fleets = [...fleets]
  const uniqueCrew = [...new Set(crewIds)]
  if (uniqueCrew.length > 0 && uniqueCrew.length <= SNAPSHOT_LIST_CAP) out.crewIds = uniqueCrew
  return out
}

export const buildViewportSnapshot = (entries: PaneReadoutEntry[], now: Date = new Date()): ViewportSnapshot => ({
  capturedAt: now.toISOString(),
  panes: entries.map(buildPane),
  viewDefaults: buildViewDefaults(entries),
})

const fmtWindowEdge = (iso: string, timezone: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso))
    const get = (t: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('day')} ${get('month')} ${get('hour')}:${get('minute')}`
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

/** Largest buckets first; long tails are cut so the bubble stays readable (full map goes to the LLM). */
const SUMMARY_TOP_BUCKETS = 6
const fmtCounts = (m: Record<string, number>): string => {
  const sorted = Object.entries(m).sort((x, y) => y[1] - x[1])
  const head = sorted.slice(0, SUMMARY_TOP_BUCKETS).map(([k, v]) => `${k} ${v}`).join(', ')
  return sorted.length > SUMMARY_TOP_BUCKETS ? `${head}, …` : head
}

const paneTitle = (p: PaneSnapshot): string => {
  const kind = p.kind === 'roster' ? 'Roster' : p.kind === 'pairing' ? 'Pairings' : 'Flights'
  return `${kind} (${p.context}, ${fmtWindowEdge(p.window.startUtc, p.window.timezone)} – ${fmtWindowEdge(p.window.endUtc, p.window.timezone)})`
}

/** Plain-English summary bubble shown right after View Gantt (no LLM involved). */
export const formatViewportSummary = (snap: ViewportSnapshot): string => {
  if (snap.panes.length === 0) {
    return 'No Gantt pane is open on screen. Open the Live or a Scenario Gantt, then press View Gantt again.'
  }
  const lines: string[] = ["Here's what is on your screen:"]
  for (const p of snap.panes) {
    if (p.kind === 'roster') {
      lines.push(
        `• ${paneTitle(p)}: ${p.crewInPane} crew — ${p.crewWithDutyInView} with duties in view, ` +
          `${p.crewWithoutDutyInView} without; ${p.flyingDutiesInView} flying duties, ${p.groundTasksInView} ground tasks; ` +
          `${p.crewWithAlerts} crew with alerts.` +
          (p.crewInPane > 0 ? ` By rank: ${fmtCounts(p.byRank)}.` : ''),
      )
    } else if (p.kind === 'pairing') {
      const c = p.coverage
      lines.push(
        `• ${paneTitle(p)}: ${p.pairingsInView} pairings in view — ${p.openPositionPairings} with open positions ` +
          `(${c.open} open, ${c.partial} partial), ${c.full + c.over} covered; open credit ${p.openPositionCredit}.` +
          (p.openPositionPairings > 0 ? ` Open positions: ${fmtCounts(p.openPositionsByRank)}.` : ''),
      )
    } else {
      lines.push(
        `• ${paneTitle(p)}: ${p.flightsInView} flights on ${p.aircraftRows} aircraft rows` +
          (p.cancelledInView > 0 ? `, ${p.cancelledInView} cancelled.` : '.'),
      )
    }
  }
  const vd = snap.viewDefaults
  if (vd) {
    const scope = [
      vd.base ? `base ${vd.base}` : null,
      vd.fleets ? `fleet ${vd.fleets.join('/')}` : null,
      `${vd.start} – ${vd.end}`,
      vd.crewIds ? `${vd.crewIds.length} crew` : null,
    ].filter((x): x is string => x !== null)
    lines.push(`"This view" scope for build / auto-assign: ${scope.join(', ')}.`)
  }
  lines.push('Ask me about anything in this view.')
  return lines.join('\n')
}
