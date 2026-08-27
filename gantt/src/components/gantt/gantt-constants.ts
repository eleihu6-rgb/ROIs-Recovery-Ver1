// ─── CSS Variable Helpers (Theme-aware) ─────────────────────────────────────

/**
 * Read a CSS custom property from :root. Returns the trimmed value,
 * or `fallback` when the variable is not defined.
 */
export const getCssVar = (name: string, fallback = ''): string => {
  if (typeof document === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

/** Resolved color palette – call once per render frame (cheap reads). */
export interface GanttColors {
  bgColor: string
  bgColorAlt: string
  bgColorHeader: string
  bgColorToday: string
  bgColorWeekend: string
  /** Very light fill for the first/odd roster-period band. */
  bgColorRp: string
  /** Very light fill for the second/even roster-period band. */
  bgColorRpAlt: string
  /** Subtle vertical separator at RP boundaries. */
  rpBoundaryColor: string
  bgColorPanel: string
  bgColorPanelHeader: string
  textColor: string
  textColorSecondary: string
  textColorRed: string
  textColorWeekend: string
  gridColor: string
  gridColorMajor: string
  selectionBorder: string
  /** Soft fill under the selection focus ring. */
  selectionWash: string
  /** Optimizer-placed roster duty outline (green dashed when unselected). */
  optimizerBorder: string
  /** Unsaved/pending Scenario edit outline (amber dashed when unselected). */
  pendingBorder: string
  hoverBorder: string
  dropTargetColor: string
  dropTargetBorder: string
  nowLineColor: string
  scrollbarColor: string
  scrollbarHoverColor: string
  /** Row selection highlight */
  rowSelectedColor: string
  /** Frozen/pinned row tint */
  rowFrozenColor: string
}

export const getGanttColors = (): GanttColors => {
  // Perf: resolve the computed style ONCE per call. `getComputedStyle` forces a
  // style recalc and is the expensive part; reading individual properties off the
  // returned declaration is cheap. getGanttColors runs in the canvas render loop
  // (per-row/per-task across multiple panes), so collapsing many getComputedStyle
  // calls into 1 cuts the per-frame style-resolution cost.
  const style = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const v = (name: string, fallback: string): string => {
    if (!style) return fallback
    return style.getPropertyValue(name).trim() || fallback
  }
  return {
    bgColor: v('--gantt-bg', BG_COLOR),
    bgColorAlt: v('--gantt-bg-alt', BG_COLOR_ALT),
    bgColorHeader: v('--gantt-bg-header', BG_COLOR_HEADER),
    bgColorToday: v('--gantt-bg-today', BG_COLOR_TODAY),
    bgColorWeekend: v('--gantt-bg-weekend', BG_COLOR_WEEKEND),
    bgColorRp: v('--gantt-bg-rp', BG_COLOR_RP),
    bgColorRpAlt: v('--gantt-bg-rp-alt', BG_COLOR_RP_ALT),
    rpBoundaryColor: v('--gantt-rp-boundary', RP_BOUNDARY_COLOR),
    bgColorPanel: v('--gantt-bg-panel', BG_COLOR_PANEL),
    bgColorPanelHeader: v('--gantt-bg-panel-header', BG_COLOR_PANEL_HEADER),
    textColor: v('--gantt-text', TEXT_COLOR),
    textColorSecondary: v('--gantt-text-secondary', TEXT_COLOR_SECONDARY),
    textColorRed: v('--gantt-text-red', TEXT_COLOR_RED),
    textColorWeekend: v('--gantt-text-weekend', TEXT_COLOR_WEEKEND),
    gridColor: v('--gantt-grid', GRID_COLOR),
    gridColorMajor: v('--gantt-grid-major', GRID_COLOR_MAJOR),
    selectionBorder: v('--gantt-selection-border', SELECTION_BORDER_COLOR),
    selectionWash: v('--gantt-selection-wash', SELECTION_GLOW_COLOR),
    optimizerBorder: v('--gantt-optimizer-border', OPTIMIZER_BORDER_COLOR),
    pendingBorder: v('--gantt-pending-border', PENDING_BORDER_AMBER),
    hoverBorder: v('--gantt-hover-border', HOVER_BORDER_COLOR),
    dropTargetColor: v('--gantt-drop-target', DROP_TARGET_COLOR),
    dropTargetBorder: v('--gantt-drop-target-border', DROP_TARGET_BORDER),
    nowLineColor: v('--gantt-now-line', NOW_LINE_COLOR),
    scrollbarColor: v('--gantt-scrollbar', SCROLLBAR_COLOR),
    scrollbarHoverColor: v('--gantt-scrollbar-hover', SCROLLBAR_HOVER_COLOR),
    rowSelectedColor: v('--gantt-row-selected', ROW_SELECTED_COLOR),
    rowFrozenColor: v('--gantt-row-frozen', ROW_FROZEN_COLOR),
  }
}

// ─── Row & Header ───────────────────────────────────────────────────────────

/** Row height: supports dual-line text (Roster left panel) */
export const ROW_HEIGHT = 43

/** Header height (time axis area, shared by all panes) */
export const HEADER_HEIGHT = 30

/** Pairing pane header height — matches HEADER_HEIGHT so all panes align */
export const PAIRING_HEADER_HEIGHT = 30

/** Pairing pane row height (42px for two-line segment layout) */
export const PAIRING_ROW_HEIGHT = 42

/** Top row height within Pairing header (16px) */
export const PAIRING_TOP_ROW_HEIGHT = 16

/** Bottom row height within Pairing header (14px) */
export const PAIRING_BOTTOM_ROW_HEIGHT = 14

/** Left panel default total width */
export const LEFT_PANEL_WIDTH = 260

/**
 * Vertical splitter bar width between left panel and canvas.
 * The canvas "virtual line" sits at `leftPanelWidth + SPLITTER_WIDTH` — use this
 * constant wherever chrome must align to the canvas left edge.
 */
export const SPLITTER_WIDTH = 2

/** Left panel minimum width */
export const LEFT_PANEL_MIN_WIDTH = 120

/** Left panel maximum width */
export const LEFT_PANEL_MAX_WIDTH = 500

/** Padding around task blocks (top/bottom) — derived from row height and desired task height */
export const TASK_HEIGHT = 30

/** Padding around task blocks (top/bottom) */
export const TASK_PADDING = Math.floor((ROW_HEIGHT - TASK_HEIGHT) / 2)

/** Minimum task block width in pixels (for very short tasks) */
export const MIN_TASK_WIDTH = 8

// ─── Font ───────────────────────────────────────────────────────────────────

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
export const FONT_SIZE_HEADER = 12
export const FONT_SIZE_HEADER_DAY = 13
export const FONT_SIZE_HEADER_DOW = 10
export const FONT_SIZE_TASK = 11
export const FONT_SIZE_TOOLTIP = 12
export const FONT_SIZE_PANEL = 11
export const FONT_SIZE_PANEL_HEADER = 11

// ─── Grid ───────────────────────────────────────────────────────────────────

export const GRID_COLOR = '#e5e7eb'
export const GRID_COLOR_MAJOR = '#d1d5db'
export const GRID_COLOR_ROW = '#f0f0f0'

// ─── Background ─────────────────────────────────────────────────────────────

export const BG_COLOR = '#ffffff'
export const BG_COLOR_ALT = '#eaf4ff'
export const BG_COLOR_HEADER = '#f3f4f6'
export const BG_COLOR_TODAY = 'rgba(59, 130, 246, 0.08)'
export const BG_COLOR_WEEKEND = 'rgba(107, 114, 128, 0.04)'
/** Kept intentionally translucent so task text remains high contrast. */
export const BG_COLOR_RP = 'rgba(186, 230, 253, 0.24)'
export const BG_COLOR_RP_ALT = 'rgba(204, 251, 241, 0.24)'
export const RP_BOUNDARY_COLOR = 'rgba(14, 116, 144, 0.34)'
export const BG_COLOR_PANEL = '#f8fafc'
export const BG_COLOR_PANEL_HEADER = '#eef2f7'

// ─── Text ───────────────────────────────────────────────────────────────────

export const TEXT_COLOR = '#111827'
export const TEXT_COLOR_SECONDARY = '#6b7280'
export const TEXT_COLOR_RED = '#dc2626'
/** Weekend day-header text (indigo). Fallback for --gantt-text-weekend. */
export const TEXT_COLOR_WEEKEND = '#6366f1'

// ─── Row selection / Frozen ─────────────────────────────────────────────────

export const ROW_SELECTED_COLOR = '#dfe1e2'
export const ROW_FROZEN_COLOR = 'rgba(245, 158, 11, 0.08)'

export const getRowBackgroundColor = (
  rowIndex: number,
  colors: Pick<GanttColors, 'bgColor' | 'bgColorAlt'>,
): string => {
  return rowIndex % 2 === 1 ? colors.bgColorAlt : colors.bgColor
}

// ─── Pin icon ──────────────────────────────────────────────────────────────

/** Pin icon dimensions for frozen rows in left panel */
export const PIN_ICON_SIZE = 14
export const PIN_ICON_MARGIN_RIGHT = 4

// ─── Scrollbar ──────────────────────────────────────────────────────────────

export const SCROLLBAR_SIZE = 6
export const SCROLLBAR_COLOR = 'rgba(0, 0, 0, 0.18)'
export const SCROLLBAR_HOVER_COLOR = 'rgba(0, 0, 0, 0.35)'
export const SCROLLBAR_RADIUS = 3

// ─── Now line ───────────────────────────────────────────────────────────────

export const NOW_LINE_COLOR = '#ef4444'
export const NOW_LINE_DASH = [4, 3]
export const NOW_LINE_WIDTH = 1.5

// ─── Zoom ───────────────────────────────────────────────────────────────────
// Zoom is continuous — pxPerHour stored in gantt-view-store.
// No static PIXELS_PER_HOUR table needed.

// ─── Interaction ────────────────────────────────────────────────────────────

/** Snap threshold in pixels for drag operations */
export const SNAP_THRESHOLD = 5

/** Double-click timeout in ms */
export const DOUBLE_CLICK_TIMEOUT = 300

/** Tooltip delay in ms */
export const TOOLTIP_DELAY = 400

/** Drag start threshold in pixels */
export const DRAG_THRESHOLD = 3

// ─── Violation severity colors ──────────────────────────────────────────────

/** Map severity (1-5) to bell icon color */
export const VIOLATION_SEVERITY_COLORS: Record<number, string> = {
  1: '#eab308',  // yellow
  2: '#eab308',  // yellow
  3: '#f97316',  // orange
  4: '#ef4444',  // red
  5: '#ef4444',  // red
}

// ─── Pane splitter ──────────────────────────────────────────────────────────

/** Pane splitter bar height */
export const PANE_SPLITTER_HEIGHT = 6

// ─── Selection ──────────────────────────────────────────────────────────────

/** Dash pattern for CR optimizer / hover dashed outlines (selection is solid). */
export const SELECTION_DASH = [4, 3]
/** Magenta focus ring — distinct from blue flights and green CR / pairing coverage. */
export const SELECTION_BORDER_COLOR = '#c026d3'
/** CR optimizer-placed duty dashed outline. Fallback for --gantt-optimizer-border. */
export const OPTIMIZER_BORDER_GREEN = '#1b9d4b'
export const OPTIMIZER_BORDER_COLOR = OPTIMIZER_BORDER_GREEN
/** Hover outline (slate-400). Fallback for --gantt-hover-border. */
export const HOVER_BORDER_COLOR = '#94a3b8'
/** Selection focus ring (solid). CR identity ring stays thinner + dashed. */
export const SELECTION_BORDER_WIDTH = 3
export const OPTIMIZER_BORDER_WIDTH = 2
/** Unsaved/pending Scenario edit outline (amber dashed) — subtle, thinner than the CR ring. */
export const PENDING_BORDER_AMBER = '#f59e0b'
export const PENDING_BORDER_WIDTH = 1
export const SELECTION_GLOW_COLOR = 'rgba(192, 38, 211, 0.22)'
export const SELECTION_GLOW_BLUR = 6

// ─── Summary bar ────────────────────────────────────────────────────────────

export const SUMMARY_BAR_HEIGHT = 50

// ─── Ghost (drag preview) ───────────────────────────────────────────────────

export const GHOST_ALPHA = 0.5
export const GHOST_DASH = [5, 4]
export const GHOST_BORDER_COLOR = 'rgba(107, 114, 128, 0.5)'

// ─── Drop target highlight ─────────────────────────────────────────────────

export const DROP_TARGET_COLOR = 'rgba(59, 130, 246, 0.15)'
export const DROP_TARGET_BORDER = '#3b82f6'

// ─── Flight Pane composition colors ─────────────────────────────────────────

export const FLIGHT_COLOR_FULL = '#22c55e'         // green - fully crewed
export const FLIGHT_COLOR_PARTIAL = '#3b82f6'      // blue - partially crewed
export const FLIGHT_COLOR_CANCELLED_BG = '#581c87'  // dark purple - cancelled
export const FLIGHT_COLOR_CANCELLED_STRIPE = '#4b5563'

// ─── Flight puck three-column colors ────────────────────────────────────────

/** Deadhead (DH) flight gradient colors */
export const FLIGHT_COLOR_DH_TOP = '#2d1b69'
export const FLIGHT_COLOR_DH_BOTTOM = '#4c1d95'

/** Airport code color in puck left/right columns */
export const FLIGHT_PUCK_AIRPORT_COLOR = '#93c5fd'

/** Time color in puck left/right columns */
export const FLIGHT_PUCK_TIME_COLOR = '#7dd3fc'

// ─── Segment Mode colors (Pairing/Roster) ────────────────────────────────────

/** Brief bar color (amber) */
export const SEGMENT_BRIEF_COLOR = '#f59e0b'

/** Debrief bar color (slate) */
export const SEGMENT_DEBRIEF_COLOR = '#94a3b8'

/** Pickup/Dropoff bar color (grey, usually 0-width) */
export const SEGMENT_PICKUP_DROP_COLOR = '#475569'

/** Layover bar (thick line aligned with puck bottom) */
export const SEGMENT_LAYOVER_BG = 'rgba(34, 197, 94, 0.35)'
export const SEGMENT_LAYOVER_BORDER = 'rgba(34, 197, 94, 0.70)'
export const SEGMENT_LAYOVER_LABEL_COLOR = '#15803d'  // darker green for better readability

/** Rest bar (thick line aligned with puck bottom) */
export const SEGMENT_REST_BG = 'rgba(100, 116, 139, 0.30)'
export const SEGMENT_REST_BORDER = 'rgba(100, 116, 139, 0.60)'
export const SEGMENT_REST_LABEL_COLOR = '#475569'  // darker slate for better readability

/**
 * Flight-duty background band (light grey) — drawn behind each flight duty
 * (pickup → dropoff) to visually group flights belonging to the same duty.
 * Flight duties only; ground tasks (dutySeq === null) are skipped.
 */
export const SEGMENT_DUTY_BG = 'rgba(133, 147, 166, 0.12)'
export const SEGMENT_DUTY_BORDER = 'rgba(133, 147, 166, 0.30)'

// ─── Segment Mode dimensions (per docs/modules/gantt/pairing-pane.md) ───────────────

/** Flight puck height in segment mode */
export const SEGMENT_FLIGHT_HEIGHT = 20

/** Pickup/Brief/Debrief/Dropoff/Layover/Rest bar height (half of flight height) */
export const SEGMENT_BAR_HEIGHT = 10
