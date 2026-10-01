// gantt/src/components/ai-chat/viewport-readout.ts
//
// R'Bot "View Gantt" readout registry. Every gantt pane (Live + Scenario, roster /
// pairing / flight) draws through the shared PaneCanvas; a pane that passes a
// `readout` getter is registered here while its canvas is mounted. R'Bot reads the
// registry on demand (user presses View Gantt) — nothing is computed per frame and
// nothing is fetched, so first paint is untouched (§First-Paint).

import type { GanttContextId } from '@/types/gantt-context'
import type { RosterItem } from '@/types/roster'
import type { PairingItem } from '@/types/pairing'
import type { FlightItem } from '@/types/flight'

/** One left-panel roster row as the pane currently shows it (filtered + ordered). */
export interface RosterReadoutRow {
  crewId: string
  rank: string
  base: string
  /** crew has ≥1 legality alert (gutter bell) */
  hasAlert: boolean
}

/** What a pane hands to R'Bot: exactly the rows it renders, nothing re-queried. */
export type PaneReadoutData =
  | { kind: 'roster'; rows: RosterReadoutRow[]; items: RosterItem[] }
  /** coverageRanks: the pane's rank filter — coverage is rank-scoped when set (same as the pane). */
  | { kind: 'pairing'; items: PairingItem[]; coverageRanks: string[] }
  | { kind: 'flight'; rows: FlightItem[] }

export interface PaneReadout {
  contextId: GanttContextId
  read: () => PaneReadoutData
}

/** Visible time window of a pane canvas, in epoch ms. */
export interface PaneWindow {
  startMs: number
  endMs: number
  timezone: string
}

export interface PaneReadoutEntry {
  paneId: string
  contextId: GanttContextId
  window: PaneWindow
  data: PaneReadoutData
}

interface Registration {
  paneId: string
  getCanvas: () => HTMLCanvasElement | null
  getWindow: () => PaneWindow | null
  getReadout: () => PaneReadout | undefined
}

const registrations = new Map<symbol, Registration>()

export const registerPaneReadout = (reg: Registration): (() => void) => {
  const token = Symbol(reg.paneId)
  registrations.set(token, reg)
  return () => {
    registrations.delete(token)
  }
}

/** A canvas counts as "open" only when it is attached AND laid out (hidden tabs are display:none). */
const isOnScreen = (canvas: HTMLCanvasElement | null): boolean =>
  canvas !== null && canvas.isConnected && canvas.getClientRects().length > 0 && canvas.clientWidth > 0

/** Read every pane currently visible to the user. */
export const readOpenPanes = (): PaneReadoutEntry[] => {
  const out: PaneReadoutEntry[] = []
  for (const reg of registrations.values()) {
    const readout = reg.getReadout()
    if (!readout || !isOnScreen(reg.getCanvas())) continue
    const window = reg.getWindow()
    if (!window) continue
    out.push({ paneId: reg.paneId, contextId: readout.contextId, window, data: readout.read() })
  }
  return out
}
