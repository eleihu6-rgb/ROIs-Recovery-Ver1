import {
  ROW_HEIGHT,
  HEADER_HEIGHT,
  TASK_PADDING,
  TASK_HEIGHT,
  MIN_TASK_WIDTH,
  FONT_FAMILY,
  FONT_SIZE_TASK,
  FLIGHT_COLOR_FULL,
  FLIGHT_COLOR_PARTIAL,
  FLIGHT_COLOR_CANCELLED_BG,
  FLIGHT_COLOR_CANCELLED_STRIPE,
  FLIGHT_COLOR_DH_TOP,
  FLIGHT_COLOR_DH_BOTTOM,
  FLIGHT_PUCK_AIRPORT_COLOR,
  FLIGHT_PUCK_TIME_COLOR,
  DELAY_GHOST_THRESHOLD_MIN,
  DELAY_GHOST_DASH,
  DELAY_GHOST_BORDER_COLOR,
  DELAY_GHOST_FILL_COLOR,
  DELAY_GHOST_HATCH_COLOR,
  DELAY_GHOST_HATCH_ALPHA,
  DELAY_GHOST_LABEL_COLOR,
  DELAY_GHOST_ACTUAL_TIME_COLOR,
  getGanttColors,
} from '../gantt-constants'
import { msToX, parseIsoMs, getVisibleRowRange, roundedRect, gradientFill, lightenColor, darkenColor } from '../gantt-utils'
import { drawSelectionOutline } from '../selection-outline'
import { rowY } from './base-renderer'
import type { BaseRenderContext } from './base-renderer'
import type { Flight, FlightItem, FlightCompositionStatus } from '@/types/flight'
import { formatTime, isCrossDayLocal } from '@/stores/timezone-store'
import { deltaMinutes } from '@/components/flight/derive-flight-ops-status'

/** Hover overlay */
const HOVER_OVERLAY = 'rgba(255, 255, 255, 0.18)'

/** Width thresholds for responsive puck layout */
const PUCK_WIDTH_FULL = 80      // ≥80px: three-column layout (dep_arp + time | flt_num | arv_arp + time)
const PUCK_WIDTH_PARTIAL = 30   // 30-79px: dep_arp + flt_num (omit times and arv_arp)
const PUCK_WIDTH_MINIMAL = 16   // 16-29px: flt_num last 4 digits
const PUCK_DOT_RADIUS = 3       // <16px: color dot only

export interface FlightRenderContext extends BaseRenderContext {
  /** Rows, each containing a registration group with its flights */
  flightRows: FlightItem[]
  selectedFlightIds: Set<number>
  hoveredFlightId: number | null
  /** Map of flightId -> composition status */
  compositionStatusMap: Map<number, FlightCompositionStatus>
  /** IANA timezone ID for time display (e.g. "Asia/Shanghai") */
  timezone: string
}

/**
 * Render all visible flight blocks, grouped by registration (one row per registration).
 */
export const renderFlightTasks = (rc: FlightRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollY, flightRows, frozenRowCount, rangeStart } = rc
  // V4-P03: hoist rangeStartMs once per frame (avoids repeated .getTime() in inner loop)
  const rangeStartMs = rangeStart.getTime()

  for (let i = 0; i < frozenRowCount && i < flightRows.length; i++) {
    for (const flight of flightRows[i].flights) {
      drawFlightBlock(rc, flight, i, rangeStartMs)
    }
  }

  const scrollableCount = flightRows.length - frozenRowCount
  const { first, last } = getVisibleRowRange(scrollY, canvasHeight, scrollableCount)
  if (frozenRowCount > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, HEADER_HEIGHT + frozenRowCount * ROW_HEIGHT, canvasWidth, canvasHeight)
    ctx.clip()
  }
  for (let idx = first; idx <= last; idx++) {
    const rowIdx = idx + frozenRowCount
    const row = flightRows[rowIdx]
    if (!row) continue
    for (const flight of row.flights) {
      drawFlightBlock(rc, flight, rowIdx, rangeStartMs)
    }
  }
  if (frozenRowCount > 0) ctx.restore()
}

/**
 * Draw a single flight block with three-column puck layout.
 * - Full: gradient fill with dep_arp + time | flt_num | arv_arp + time
 * - Partial: gradient fill with dep_arp + flt_num
 * - Minimal: flt_num last 4 digits
 * - Dot: color dot only
 * - Cancelled: dark purple + diagonal stripes
 * - Deadhead (DH): purple gradient
 */
const drawFlightBlock = (
  rc: FlightRenderContext,
  flight: Flight,
  rowIndex: number,
  rangeStartMs: number,
): void => {
  const { ctx, scrollX, scrollY, pxPerHour, canvasWidth, selectedFlightIds, hoveredFlightId, compositionStatusMap, frozenRowCount, timezone } = rc
  const colors = getGanttColors()

  // V4-P03: epoch-ms pure arithmetic (pixel-identical to timeToX's UTC branch —
  // msToX replicates date-fns differenceInMinutes truncation, see gantt-utils.ts).
  const schX = msToX(parseIsoMs(flight.schDepDtUtc), rangeStartMs, pxPerHour) - scrollX
  const schEndX = msToX(parseIsoMs(flight.schArvDtUtc), rangeStartMs, pxPerHour) - scrollX

  // Once a flight has a significant recorded delay, the solid puck moves to its ACTUAL
  // (real-time) position and the scheduled slot is drawn as a translucent ghost BEFORE it —
  // Ryan: "if a flight delay, it [the ghost] should stay before the regular flight puck."
  let hasDelayGhost = false
  let x = schX
  let endX = schEndX
  if (!flight.isCancelled) {
    const depDelta = deltaMinutes(flight.actDepDtUtc, flight.schDepDtUtc)
    const arvDelta = deltaMinutes(flight.actArvDtUtc, flight.schArvDtUtc)
    const maxDelta = Math.max(Math.abs(depDelta ?? 0), Math.abs(arvDelta ?? 0))
    if (maxDelta >= DELAY_GHOST_THRESHOLD_MIN) {
      hasDelayGhost = true
      x = msToX(parseIsoMs(flight.actDepDtUtc), rangeStartMs, pxPerHour) - scrollX
      endX = msToX(parseIsoMs(flight.actArvDtUtc), rangeStartMs, pxPerHour) - scrollX
    }
  }
  const width = Math.max(endX - x, MIN_TASK_WIDTH)
  const y = rowY(rowIndex, scrollY, frozenRowCount) + TASK_PADDING

  if (y + TASK_HEIGHT < HEADER_HEIGHT) return
  if (Math.min(x, schX) > canvasWidth || Math.max(endX, schEndX) < 0) return

  // Delay ghost bar — hatched (diagonal-stripe) outline at the ORIGINAL SCHEDULED
  // position, drawn behind the solid actual-time puck, labeled "{depTime} sched".
  if (hasDelayGhost) {
    // Ghost width = delay duration (schX -> actual x), not scheduled flight duration — so
    // the ghost's right edge always touches the solid puck's left edge, even when the delay
    // exceeds the flight's own scheduled duration.
    const schWidth = Math.max(x - schX, MIN_TASK_WIDTH)
    if (x >= 0 && schX <= canvasWidth) {
      drawDelayGhost(ctx, flight.schDepDtUtc, schX, y, schWidth, TASK_HEIGHT, timezone)
    }
  }

  const status = compositionStatusMap.get(flight.id) ?? (flight.isCancelled ? 'cancelled' : 'partial')
  const isSelected = selectedFlightIds.has(flight.id)
  const isHovered = hoveredFlightId === flight.id
  const isDeadhead = flight.fltType === 'DH'

  // Background gradient
  if (status === 'cancelled') {
    ctx.fillStyle = FLIGHT_COLOR_CANCELLED_BG
    ctx.beginPath()
    roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
    ctx.fill()
    drawCancelledStripes(ctx, x, y, width, TASK_HEIGHT)
  } else if (isDeadhead) {
    // Deadhead uses purple gradient
    gradientFill(ctx, x, y, width, TASK_HEIGHT, FLIGHT_COLOR_DH_TOP, FLIGHT_COLOR_DH_BOTTOM, 3)
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
    ctx.stroke()
  } else {
    const baseColor = status === 'full' ? FLIGHT_COLOR_FULL : FLIGHT_COLOR_PARTIAL
    const colorTop = lightenColor(baseColor, 0.15)
    gradientFill(ctx, x, y, width, TASK_HEIGHT, colorTop, baseColor, 3)

    const borderColor = darkenColor(baseColor, 0.15)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1
    ctx.beginPath()
    roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
    ctx.stroke()
  }

  // Hover overlay
  if (isHovered && !isSelected) {
    ctx.fillStyle = HOVER_OVERLAY
    ctx.beginPath()
    roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
    ctx.fill()
  }

  // Selection border (solid focus ring + wash — distinct from CR dashed identity)
  if (isSelected) {
    drawSelectionOutline(ctx, x, y, width, TASK_HEIGHT, colors.selectionBorder, colors.selectionWash)
  } else if (status === 'cancelled') {
    ctx.strokeStyle = FLIGHT_COLOR_CANCELLED_STRIPE
    ctx.lineWidth = 1
    ctx.beginPath()
    roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
    ctx.stroke()
  }

  // Three-column puck layout based on width
  if (width >= PUCK_WIDTH_FULL) {
    drawFullPuck(ctx, flight, x, y, width, TASK_HEIGHT, timezone, isDeadhead, hasDelayGhost)
  } else if (width >= PUCK_WIDTH_PARTIAL) {
    drawPartialPuck(ctx, flight, x, y, width, TASK_HEIGHT, isDeadhead)
  } else if (width >= PUCK_WIDTH_MINIMAL) {
    drawMinimalPuck(ctx, flight, x, y, width, TASK_HEIGHT, isDeadhead)
  } else {
    drawDotPuck(ctx, x, y, TASK_HEIGHT, isDeadhead)
  }
}

/**
 * Draw diagonal stripes clipped to a box — shared by the cancelled-flight overlay
 * and the delay ghost hatch pattern.
 */
const drawDiagonalStripes = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha: number,
  step = 6,
): void => {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.globalAlpha = alpha

  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath()
    ctx.moveTo(x + i, y)
    ctx.lineTo(x + i + h, y + h)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
  ctx.restore()
}

/**
 * Draw diagonal stripes on a cancelled flight block.
 */
const drawCancelledStripes = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void => {
  drawDiagonalStripes(ctx, x, y, w, h, FLIGHT_COLOR_CANCELLED_STRIPE, 0.4)
}

/**
 * Draw the delay ghost bar at a flight's original scheduled (STD/STA) position — a
 * hatched (diagonal-stripe) gray box with a "{depTime} sched" label, drawn behind the
 * solid puck once that puck has moved to its actual (ATD/ATA) position. Same styling is
 * reused for the flight's occurrences in the Pairing and Roster panes (Ryan's reference
 * screenshot, 2026-08-28: "same style" across Flight/Pairing/Roster).
 */
export const drawDelayGhost = (
  ctx: CanvasRenderingContext2D,
  schDtUtc: string,
  x: number,
  y: number,
  w: number,
  h: number,
  timezone: string,
): void => {
  ctx.save()
  ctx.fillStyle = DELAY_GHOST_FILL_COLOR
  ctx.beginPath()
  roundedRect(ctx, x, y, w, h, 3)
  ctx.fill()
  ctx.restore()

  drawDiagonalStripes(ctx, x, y, w, h, DELAY_GHOST_HATCH_COLOR, DELAY_GHOST_HATCH_ALPHA, 5)

  ctx.save()
  ctx.setLineDash(DELAY_GHOST_DASH)
  ctx.strokeStyle = DELAY_GHOST_BORDER_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  roundedRect(ctx, x, y, w, h, 3)
  ctx.stroke()
  ctx.restore()

  if (w >= 40) {
    const label = `${formatTime(schDtUtc, timezone)} sched`
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.font = `9px ${PUCK_FONT_MONO}`
    ctx.fillStyle = DELAY_GHOST_LABEL_COLOR
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + 4, y + h / 2 + 1)
    ctx.restore()
  }
}

/** Font for puck layout */
const PUCK_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const PUCK_FONT_MONO = '"JetBrains Mono", "Fira Code", monospace'

/**
 * Draw full three-column puck layout (≥80px).
 * Left: dep_arp (bold) + dep_time
 * Center: flt_num (bold)
 * Right: arv_arp (bold) + arv_time (+1 indicator if cross-day)
 */
const drawFullPuck = (
  ctx: CanvasRenderingContext2D,
  flight: Flight,
  x: number,
  y: number,
  width: number,
  height: number,
  timezone: string,
  isDeadhead: boolean,
  showActualTimes: boolean,
): void => {
  const textColor = isDeadhead ? '#d8b4fe' : '#ffffff'
  // Puck's own x/width already track actual time when showActualTimes — label with the same
  // pair of timestamps so the printed time matches the position it's drawn at.
  const depDtUtc = showActualTimes ? flight.actDepDtUtc : flight.schDepDtUtc
  const arvDtUtc = showActualTimes ? flight.actArvDtUtc : flight.schArvDtUtc

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 1, width - 4, height - 2)
  ctx.clip()

  // Column widths
  const colWidth = Math.max(32, Math.min(48, width * 0.25))
  const centerX = x + width / 2

  // --- Left column: dep_arp + dep_time ---
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // Airport code (bold, top)
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = isDeadhead ? '#d8b4fe' : FLIGHT_PUCK_AIRPORT_COLOR
  ctx.fillText(flight.depArp || '', x + 4, y + 4)

  // Departure time (mono, bottom) — flagged amber with a "→" suffix once it reflects the
  // ACTUAL (shifted) time rather than schedule, so it visually pairs with the sched ghost.
  ctx.font = `9px ${PUCK_FONT_MONO}`
  ctx.fillStyle = showActualTimes ? DELAY_GHOST_ACTUAL_TIME_COLOR : isDeadhead ? '#c4b5fd' : FLIGHT_PUCK_TIME_COLOR
  const depTime = formatTime(depDtUtc, timezone) + (showActualTimes ? ' →' : '')
  ctx.fillText(depTime, x + 4, y + 15)

  // --- Center column: flt_num ---
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 10px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(flight.fltNum || '', centerX, y + height / 2)

  // --- Right column: arv_arp + arv_time ---
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'

  // V4-P04: cached cross-day check (was: new Intl.DateTimeFormat per flight per frame)
  const isCrossDay = isCrossDayLocal(depDtUtc, arvDtUtc, timezone)

  // Airport code (bold, top)
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = isDeadhead ? '#d8b4fe' : FLIGHT_PUCK_AIRPORT_COLOR
  const arvText = flight.arvArp || ''
  ctx.fillText(arvText, x + width - 4, y + 4)

  // Arrival time (mono, bottom) with +1 indicator if cross-day
  ctx.font = `9px ${PUCK_FONT_MONO}`
  ctx.fillStyle = isDeadhead ? '#c4b5fd' : FLIGHT_PUCK_TIME_COLOR
  const arvTime = formatTime(arvDtUtc, timezone)
  if (isCrossDay) {
    ctx.fillText(arvTime + '⁺¹', x + width - 4, y + 15)
  } else {
    ctx.fillText(arvTime, x + width - 4, y + 15)
  }

  ctx.restore()
}

/**
 * Draw partial puck layout (30-79px).
 * Left: dep_arp
 * Center: flt_num
 */
const drawPartialPuck = (
  ctx: CanvasRenderingContext2D,
  flight: Flight,
  x: number,
  y: number,
  width: number,
  height: number,
  isDeadhead: boolean,
): void => {
  const textColor = isDeadhead ? '#d8b4fe' : '#ffffff'

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 1, width - 4, height - 2)
  ctx.clip()

  // Left: dep_arp
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = isDeadhead ? '#d8b4fe' : FLIGHT_PUCK_AIRPORT_COLOR
  ctx.fillText(flight.depArp || '', x + 4, y + height / 2)

  // Center: flt_num (smaller font)
  ctx.textAlign = 'center'
  ctx.font = `bold 8px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(flight.fltNum || '', x + width / 2, y + height / 2)

  ctx.restore()
}

/**
 * Draw minimal puck layout (16-29px).
 * Center: flt_num last 4 digits
 */
const drawMinimalPuck = (
  ctx: CanvasRenderingContext2D,
  flight: Flight,
  x: number,
  y: number,
  width: number,
  height: number,
  isDeadhead: boolean,
): void => {
  const textColor = isDeadhead ? '#d8b4fe' : '#ffffff'
  const fltNum = flight.fltNum || ''
  const last4 = fltNum.length > 4 ? fltNum.slice(-4) : fltNum

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 1, width - 4, height - 2)
  ctx.clip()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 8px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(last4, x + width / 2, y + height / 2)

  ctx.restore()
}

/**
 * Draw dot puck layout (<16px).
 * Just a color dot in center.
 */
const drawDotPuck = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  isDeadhead: boolean,
): void => {
  const centerX = x + 4
  const centerY = y + height / 2
  const dotColor = isDeadhead ? '#d8b4fe' : '#93c5fd'

  ctx.beginPath()
  ctx.arc(centerX, centerY, PUCK_DOT_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = dotColor
  ctx.fill()
}
