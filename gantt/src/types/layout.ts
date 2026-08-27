// gantt/src/types/layout.ts

/** Maximum number of panes allowed */
export const MAX_PANES = 4

/** Maximum number of rows */
export const MAX_ROWS = 4

/** Maximum number of columns per row */
export const MAX_COLS_PER_ROW = 2

/** Pane type identifiers (new simplified names) */
export type PaneType = 'roster' | 'pairing' | 'flight'

/** Maximum number of panes allowed per type (at most 2 roster + 2 pairing + 1 flight) */
export const MAX_PANES_PER_TYPE: Record<PaneType, number> = {
  roster: 2,
  pairing: 2,
  flight: 1
}

/** Per-pane viewport state (fully independent) */
export interface PaneViewport {
  scrollX: number       // Horizontal scroll position (0-100%)
  scrollY: number       // Vertical scroll position (pixels)
  zoom: number          // Pixels per hour (20-100)
}

/** Per-pane selection state */
export interface PaneSelection {
  selectedRowIds: string[]   // IDs of selected rows (format: '{entityType}-{entityId}')
  frozenRowIds: string[]     // IDs of frozen/pinned rows (stays visible during scroll)
  sortColumn: string | null  // Column key for sorting (null = no sort)
  sortDirection: 'asc' | 'desc'
}

/** Pane instance configuration */
export interface PaneInstance {
  id: string              // Unique instance ID (format: '{type}-{number}', e.g., 'roster-1')
  type: PaneType
  title: string           // Display title (e.g., 'Roster #1')
  viewport: PaneViewport
  selection: PaneSelection
  selectedTaskIds: string[]  // Array for JSON serialization (Zustand persist, DevTools)
}

/** Grid position (dynamic rows) */
export interface GridPosition {
  row: number             // Row index (0 to rowCount-1, max 3)
  col: number             // Column index (0 or 1)
}

/** Layout grid state (dynamic array: 1-4 rows, each with max 2 cols) */
export type LayoutGrid = [string | null, string | null][]

/** Full layout state */
export interface LayoutState {
  grid: LayoutGrid
  panes: Map<string, PaneInstance>
  readonly maxPanes: typeof MAX_PANES
}

/** Drag state during drag operation */
export interface DragState {
  paneId: string
  fromPosition: GridPosition
  dropPosition: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

/** Shared timeline state per row */
export interface SharedTimelineState {
  row: number
  scrollX: number
}

/** Pane type color mapping */
export const PANE_COLORS: Record<PaneType, string> = {
  roster: '#3b82f6',
  pairing: '#22c55e',
  flight: '#a855f7'
}

/** Pane type display names */
export const PANE_NAMES: Record<PaneType, string> = {
  roster: 'Roster',
  pairing: 'Pairing',
  flight: 'Flight'
}