/** Pane type identifiers for the multi-pane Gantt layout */
export type PaneType = 'roster-main' | 'roster-sub' | 'pairing' | 'flight' | 'scenario-roster' | 'scenario-pairing' | 'scenario-flight'

/** Display labels per pane type — single source (used by condition strip, floating pane) */
export const PANE_LABELS: Record<PaneType, string> = {
  'roster-main': 'Roster Main',
  'roster-sub': 'Roster Sub',
  'pairing': 'Pairing',
  'flight': 'Flight',
  'scenario-roster': 'Scenario Roster',
  'scenario-pairing': 'Scenario Pairing',
  'scenario-flight': 'Scenario Flight',
}

/** Floating window geometry */
export interface FloatGeometry {
  x: number
  y: number
  width: number
  height: number
}

/** Configuration for a single Pane in the layout */
export interface PaneConfig {
  type: PaneType
  visible: boolean
  height: number       // pixel height when docked (resizable by drag)
  minHeight: number
  /** Whether the pane is detached from the stack as a floating window */
  floating: boolean
  /** Geometry of the floating window (only meaningful when floating=true) */
  floatGeometry?: FloatGeometry
}
