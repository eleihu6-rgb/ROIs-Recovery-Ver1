import { addHours } from 'date-fns'
import {
  ROW_HEIGHT,
  HEADER_HEIGHT,
  PAIRING_HEADER_HEIGHT,
  PAIRING_TOP_ROW_HEIGHT,
  PAIRING_BOTTOM_ROW_HEIGHT,
  FONT_FAMILY,
  FONT_SIZE_HEADER,
  NOW_LINE_DASH,
  NOW_LINE_WIDTH,
  getGanttColors,
  getRowBackgroundColor,
} from '../gantt-constants'
import {
  timeToX,
  msToX,
  getVisibleRowRange,
  localDayBoundaries,
  getTimezoneOffset,
  calendarDateToUtcMidnight,
  endOfCalendarDayUtc,
} from '../gantt-utils'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import {
  highZoomDayLabel,
  centeredDayLabelX,
  pickDowMode,
  dayCellLabel,
  layoutMonthLabels,
  type MonthSpan,
} from './timeline-labels'

/** Shared render context passed to all renderers */
export interface BaseRenderContext {
  ctx: CanvasRenderingContext2D
  dpr: number
  canvasWidth: number
  canvasHeight: number
  scrollX: number
  scrollY: number
  /** Pixels per hour (continuous zoom value) */
  pxPerHour: number
  rangeStart: Date
  rangeEnd: Date
  totalRows: number
  /** Row index currently being drop-targeted (highlight), -1 = none */
  dropTargetRow: number
  /** Number of rows frozen at the top (not affected by scrollY) */
  frozenRowCount: number
  /** Set of row indices that are currently selected (for highlight) */
  selectedRowIndices: Set<number>
  /** Custom header height (defaults to HEADER_HEIGHT if not provided) */
  headerHeight?: number
  /** Custom row height (defaults to ROW_HEIGHT if not provided) */
  rowHeight?: number
  /** IANA timezone ID for local time display (e.g., 'America/Toronto', 'UTC') */
  timezone: string
  /** Cached roster periods used to distinguish RP cycles on the shared timeline. */
  rosterPeriods: readonly RosterPeriodOption[]
}

/** Get effective header height from context */
const getHeaderHeight = (rc: BaseRenderContext): number => rc.headerHeight ?? HEADER_HEIGHT

/** Get effective row height from context */
const getRowHeight = (rc: BaseRenderContext): number => rc.rowHeight ?? ROW_HEIGHT

/**
 * Calculate Y position for a row, accounting for frozen rows.
 * Frozen rows: fixed at top (no scrollY). Scrollable rows: offset below frozen zone.
 * @param headerHeight - Optional custom header height (defaults to HEADER_HEIGHT)
 * @param rowHeight - Optional custom row height (defaults to ROW_HEIGHT)
 */
export const rowY = (rowIndex: number, scrollY: number, frozenRowCount: number, headerHeight = HEADER_HEIGHT, rowHeight = ROW_HEIGHT): number => {
  if (rowIndex < frozenRowCount) {
    // Frozen: fixed position, no scrollY
    return headerHeight + rowIndex * rowHeight
  }
  // Scrollable: offset below frozen zone
  return headerHeight + rowIndex * rowHeight - scrollY
}

/** Height of the frozen zone in pixels */
export const frozenZoneHeight = (frozenRowCount: number, rowHeight = ROW_HEIGHT): number => frozenRowCount * rowHeight

export interface RosterPeriodBand {
  startMs: number
  endMs: number
  index: number
}

/**
 * Resolve valid RP calendar dates to UTC bounds in the display timezone.
 * Invalid, reversed, or non-overlapping periods are ignored.
 */
export const getRosterPeriodBands = (
  periods: readonly RosterPeriodOption[],
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
): RosterPeriodBand[] => {
  const rangeStartMs = rangeStart.getTime()
  const rangeEndMs = rangeEnd.getTime()

  return periods
    .map((period, index) => {
      const startMs = calendarDateToUtcMidnight(period.rpStart, timezone).getTime()
      const endMs = endOfCalendarDayUtc(period.rpEnd, timezone).getTime()
      return { startMs, endMs, index }
    })
    .filter(({ startMs, endMs }) =>
      Number.isFinite(startMs)
      && Number.isFinite(endMs)
      && startMs <= endMs
      && endMs >= rangeStartMs
      && startMs <= rangeEndMs,
    )
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
}

/**
 * Draw very light alternating RP bands. This sits below weekend/today
 * highlights and all pane content, so it does not reduce text or task contrast.
 */
export const drawRosterPeriodBands = (rc: BaseRenderContext, topY = getHeaderHeight(rc)): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, pxPerHour, rangeStart, rangeEnd, timezone, rosterPeriods } = rc
  if (rosterPeriods.length === 0) return

  const colors = getGanttColors()
  const rangeStartMs = rangeStart.getTime()
  const bands = getRosterPeriodBands(rosterPeriods, rangeStart, rangeEnd, timezone)

  for (const [visibleIndex, band] of bands.entries()) {
    const x1 = msToX(Math.max(band.startMs, rangeStartMs), rangeStartMs, pxPerHour) - scrollX
    const x2 = msToX(Math.min(band.endMs, rangeEnd.getTime()), rangeStartMs, pxPerHour) - scrollX
    const left = Math.max(0, x1)
    const right = Math.min(canvasWidth, x2)
    if (right <= left) continue

    ctx.fillStyle = visibleIndex % 2 === 0 ? colors.bgColorRp : colors.bgColorRpAlt
    ctx.fillRect(left, topY, right - left, canvasHeight - topY)

    if (x1 >= 0 && x1 <= canvasWidth) {
      ctx.strokeStyle = colors.rpBoundaryColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x1, topY)
      ctx.lineTo(x1, canvasHeight)
      ctx.stroke()
    }
  }
}

/**
 * Render the background (alternating row stripes) with frozen row support.
 */
export const drawBackground = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollY, totalRows, frozenRowCount, selectedRowIndices } = rc
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)
  const rh = getRowHeight(rc)

  ctx.fillStyle = colors.bgColor
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  const fzH = frozenZoneHeight(frozenRowCount, rh)

  // ── Scrollable rows ──
  const { first, last } = getVisibleRowRange(scrollY, canvasHeight, totalRows - frozenRowCount, rh)
  for (let idx = first; idx <= last; idx++) {
    const i = idx + frozenRowCount
    const y = rowY(i, scrollY, frozenRowCount, hh, rh)
    if (y + rh < hh + fzH) continue
    if (y > canvasHeight) break

    ctx.fillStyle = getRowBackgroundColor(i, colors)
    ctx.fillRect(0, Math.max(y, hh + fzH), canvasWidth, rh)
    // Selection highlight
    if (selectedRowIndices.has(i)) {
      ctx.fillStyle = colors.rowSelectedColor
      ctx.fillRect(0, Math.max(y, hh + fzH), canvasWidth, rh)
    }
  }

  // ── Frozen rows (on top) ──
  for (let i = 0; i < frozenRowCount && i < totalRows; i++) {
    const y = rowY(i, scrollY, frozenRowCount, hh, rh)
    ctx.fillStyle = getRowBackgroundColor(i, colors)
    ctx.fillRect(0, y, canvasWidth, rh)
    // Frozen tint
    ctx.fillStyle = colors.rowFrozenColor
    ctx.fillRect(0, y, canvasWidth, rh)
  }

  // Frozen zone separator line
  if (frozenRowCount > 0 && frozenRowCount < totalRows) {
    const sepY = hh + fzH
    ctx.save()
    ctx.strokeStyle = colors.selectionBorder
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(0, sepY)
    ctx.lineTo(canvasWidth, sepY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}

/**
 * Highlight today's column.
 */
export const drawTodayHighlight = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, pxPerHour, rangeStart, timezone } = rc
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)

  const nowMs = Date.now()
  // Search a ±2 day window so we always capture today's boundaries.
  // Truncate the window to UTC-day boundaries so the localDayBoundaries cache key is
  // stable per day — a per-frame ms-precision key would miss (and pollute) the cache
  // on every draw.
  const probeStartMs = Math.floor((nowMs - 2 * 86400000) / 86400000) * 86400000
  const days = localDayBoundaries(new Date(probeStartMs), new Date(probeStartMs + 4 * 86400000), timezone)

  let todayMidnightMs = 0
  let tomorrowMidnightMs = 0
  for (let i = 0; i < days.length - 1; i++) {
    if (days[i].midnightUtcMs <= nowMs && nowMs < days[i + 1].midnightUtcMs) {
      todayMidnightMs = days[i].midnightUtcMs
      tomorrowMidnightMs = days[i + 1].midnightUtcMs
      break
    }
  }
  if (todayMidnightMs === 0) return

  const x1 = msToX(todayMidnightMs, rangeStart.getTime(), pxPerHour) - scrollX
  const x2 = msToX(tomorrowMidnightMs, rangeStart.getTime(), pxPerHour) - scrollX

  if (x2 > 0 && x1 < canvasWidth) {
    ctx.fillStyle = colors.bgColorToday
    ctx.fillRect(x1, hh, x2 - x1, canvasHeight - hh)
  }
}

/**
 * Highlight weekend columns with a subtle background tint.
 */
export const drawWeekendHighlight = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, pxPerHour, rangeStart, rangeEnd, timezone } = rc
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)

  const days = localDayBoundaries(rangeStart, rangeEnd, timezone)
  const rangeStartMs = rangeStart.getTime()
  for (let i = 0; i < days.length; i++) {
    const { midnightUtcMs, dow } = days[i]
    if (dow !== 0 && dow !== 6) continue
    const nextMidnightUtcMs = days[i + 1]?.midnightUtcMs ?? midnightUtcMs + 86400000

    const x1 = msToX(midnightUtcMs, rangeStartMs, pxPerHour) - scrollX
    const x2 = msToX(nextMidnightUtcMs, rangeStartMs, pxPerHour) - scrollX

    if (x2 > 0 && x1 < canvasWidth) {
      ctx.fillStyle = colors.bgColorWeekend
      ctx.fillRect(Math.max(x1, 0), hh, Math.min(x2, canvasWidth) - Math.max(x1, 0), canvasHeight - hh)
    }
  }
}

/**
 * Draw vertical time grid lines and horizontal row separators.
 */
export const drawGridLines = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, scrollY, pxPerHour, rangeStart, rangeEnd, totalRows, frozenRowCount } = rc
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)
  const rh = getRowHeight(rc)

  const dayWidth = pxPerHour * 24
  // Adaptive grid: fewer lines when zoomed out
  let hourStep = 1
  if (dayWidth < 20) hourStep = 24         // only day lines
  else if (dayWidth < 80) hourStep = 24    // only day lines
  else if (pxPerHour <= 10) hourStep = 6
  else if (pxPerHour <= 20) hourStep = 3
  else if (pxPerHour <= 40) hourStep = 1

  // Vertical lines — use IANA-aware local midnight as the day-boundary anchor
  const { timezone } = rc
  const days = localDayBoundaries(rangeStart, rangeEnd, timezone)
  const dayMidnightSet = new Set(days.map(d => d.midnightUtcMs))
  const rangeStartMs = rangeStart.getTime()
  const firstAnchorMs = days.length > 0 ? days[0].midnightUtcMs : rangeStartMs

  // F54-P02: only iterate grid steps inside the visible window, keeping anchor alignment,
  // instead of walking the full date range every frame.
  const stepMs = hourStep * 3600000
  const visStartMs = rangeStartMs + (scrollX / pxPerHour) * 3600000
  const visEndMs = rangeStartMs + ((scrollX + canvasWidth) / pxPerHour) * 3600000
  const loopStartMs = firstAnchorMs + Math.max(0, Math.floor((visStartMs - firstAnchorMs) / stepMs)) * stepMs
  const loopEndMs = Math.min(rangeEnd.getTime(), visEndMs + stepMs)

  ctx.lineWidth = 0.5
  let currentMs = loopStartMs
  while (currentMs <= loopEndMs) {
    const x = msToX(currentMs, rangeStartMs, pxPerHour) - scrollX
    if (x >= 0 && x <= canvasWidth) {
      const isDay = dayMidnightSet.has(currentMs)
      ctx.strokeStyle = isDay ? colors.gridColorMajor : colors.gridColor
      ctx.lineWidth = isDay ? 1 : 0.5
      ctx.beginPath()
      ctx.moveTo(x, hh)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }
    currentMs += stepMs
  }

  // Horizontal lines
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 0.5

  // Frozen rows
  for (let i = 0; i <= frozenRowCount && i <= totalRows; i++) {
    const hy = rowY(i, scrollY, frozenRowCount, hh, rh)
    if (hy >= hh && hy <= canvasHeight) {
      ctx.beginPath()
      ctx.moveTo(0, hy)
      ctx.lineTo(canvasWidth, hy)
      ctx.stroke()
    }
  }

  // Scrollable rows
  const scrollableCount = totalRows - frozenRowCount
  const { first, last } = getVisibleRowRange(scrollY, canvasHeight, scrollableCount, rh)
  for (let idx = first; idx <= last + 1; idx++) {
    const i = idx + frozenRowCount
    const hy = rowY(i, scrollY, frozenRowCount, hh, rh)
    if (hy < hh + frozenZoneHeight(frozenRowCount, rh)) continue
    if (hy > canvasHeight) break
    ctx.beginPath()
    ctx.moveTo(0, hy)
    ctx.lineTo(canvasWidth, hy)
    ctx.stroke()
  }
}

/**
 * Draw current time "NOW" line — red dashed vertical line with label.
 */
export const drawNowLine = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, pxPerHour, rangeStart, rangeEnd } = rc
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)

  const now = new Date()
  if (now < rangeStart || now > rangeEnd) return

  // Use UTC time for positioning
  const x = timeToX(now, rangeStart, pxPerHour, 'UTC') - scrollX
  if (x < 0 || x > canvasWidth) return

  // Dashed line
  ctx.save()
  ctx.strokeStyle = colors.nowLineColor
  ctx.lineWidth = NOW_LINE_WIDTH
  ctx.setLineDash(NOW_LINE_DASH)
  ctx.beginPath()
  ctx.moveTo(x, hh)
  ctx.lineTo(x, canvasHeight)
  ctx.stroke()
  ctx.setLineDash([])

  // "NOW" label at top
  ctx.fillStyle = colors.nowLineColor
  ctx.font = `bold 9px ${FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'

  const labelWidth = ctx.measureText('NOW').width + 6
  const labelHeight = 13
  const labelX = x - labelWidth / 2
  const labelY = hh + 2

  // Label background pill
  ctx.beginPath()
  ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 2)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.fillText('NOW', x, labelY + 2)
  ctx.textAlign = 'left'
  ctx.restore()
}

/**
 * Draw the time axis header (shared across all panes).
 */
/**
 * Hit regions for month labels — populated during drawTimelineHeader, read by the
 * owning TimeAxis for click detection.
 * F54-P05: per-axis out-array (each TimeAxis passes its own), no shared module state —
 * with one TimeAxis per pane toolbar, a global array would be owned by whichever axis
 * drew last.
 */
export interface MonthLabelHit {
  x: number
  width: number
  year: number
  month: number
}

/**
 * Draw a blank header band (background + bottom border) at the top of a pane canvas.
 * The timeline itself now lives in the pane title row (TimeAxis inside PaneToolbar);
 * this band keeps the left-panel column headers and the gantt rows vertically aligned,
 * and serves as the backdrop for the DOM condition strip (chips + pane actions).
 */
export const drawHeaderBand = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth } = rc
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)

  ctx.fillStyle = colors.bgColorHeader
  ctx.fillRect(0, 0, canvasWidth, hh)

  ctx.strokeStyle = colors.gridColorMajor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, hh)
  ctx.lineTo(canvasWidth, hh)
  ctx.stroke()
}

export const drawTimelineHeader = (rc: BaseRenderContext, monthLabelHits: MonthLabelHit[]): void => {
  monthLabelHits.length = 0 // reset each render (caller-owned out-array)
  const { ctx, canvasWidth, scrollX, pxPerHour, rangeStart, rangeEnd, timezone } = rc
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)
  const isPairing = hh === PAIRING_HEADER_HEIGHT
  // F54-P02: direct ms→x arithmetic (pixel-equivalent to timeToX 'UTC'), no Date allocs in loops
  const rangeStartMs = rangeStart.getTime()
  const rangeEndMs = rangeEnd.getTime()

  // Header background
  ctx.fillStyle = colors.bgColorHeader
  ctx.fillRect(0, 0, canvasWidth, hh)

  // Repeat the subtle RP alternation in the header so the period boundaries
  // remain visible while scrolling, without placing a label over the header.
  drawRosterPeriodBands(rc, 0)

  // Bottom border
  ctx.strokeStyle = colors.gridColorMajor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, hh)
  ctx.lineTo(canvasWidth, hh)
  ctx.stroke()

  const dayWidth = pxPerHour * 24  // pixels per day

  // For Pairing pane: top row = 22px (month/day), bottom row = 18px (time)
  const topRowHeight = isPairing ? PAIRING_TOP_ROW_HEIGHT : Math.floor(hh / 2)
  const bottomRowY = isPairing ? PAIRING_TOP_ROW_HEIGHT : topRowHeight

  ctx.textBaseline = 'top'

  // Iterate local-timezone day boundaries (IANA DST-aware, no browser TZ contamination)
  const days = localDayBoundaries(rangeStart, rangeEnd, timezone)

  // UI date standard: bottom-row day cells show "7 Mon" / "7 M" / "7" per column width
  ctx.font = `${FONT_SIZE_HEADER - 1}px ${FONT_FAMILY}`
  const dowMode = dayWidth >= 120
    ? 'none' as const
    : pickDowMode(dayWidth, ctx.measureText('30 Wed').width, ctx.measureText('30 W').width)

  for (let di = 0; di < days.length; di++) {
    const { midnightUtcMs, year, month, date, dow } = days[di]
    const x = msToX(midnightUtcMs, rangeStartMs, pxPerHour) - scrollX
    if (x < -50 || x > canvasWidth + 50) continue

    const isMonthStart = date === 1
    const isWeekend = dow === 0 || dow === 6

    // Vertical line through entire header
    ctx.strokeStyle = isMonthStart ? colors.gridColorMajor : colors.gridColor
    ctx.lineWidth = isMonthStart ? 1 : 0.5
    ctx.globalAlpha = isMonthStart ? 1 : 0.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, hh)
    ctx.stroke()
    ctx.globalAlpha = 1

    if (dayWidth >= 120) {
      // ── High zoom: top row = "Jun 7 Sun" centered in its day column ──
      const label = highZoomDayLabel(month, date, dow)
      ctx.font = `${FONT_SIZE_HEADER}px ${FONT_FAMILY}`
      ctx.fillStyle = isWeekend ? colors.textColorWeekend : colors.textColor
      const labelW = ctx.measureText(label).width
      const drawX = centeredDayLabelX(x, dayWidth, labelW)
      ctx.fillText(label, drawX, 3)
      monthLabelHits.push({ x: drawX, width: labelW, year, month })
    } else if (dayWidth >= 12) {
      // ── Bottom row: day number + adaptive DOW ("7 Mon" / "7 M" / "7"), centered in the day column ──
      const cell = dayCellLabel(date, dow, dowMode)
      ctx.font = `${dayWidth >= 40 ? FONT_SIZE_HEADER - 1 : 9}px ${FONT_FAMILY}`
      ctx.fillStyle = isWeekend ? colors.textColorWeekend : colors.textColorSecondary
      const textW = ctx.measureText(cell).width
      ctx.fillText(cell, Math.max(centeredDayLabelX(x, dayWidth, textW), x + 2), bottomRowY + 2)
    }
  }

  // ── Month row: labels anchored at each month's first day (sticky-clamped) ──
  if (dayWidth < 120) {
    const monthSpans: MonthSpan[] = []
    for (let di = 0; di < days.length; di++) {
      const d = days[di]
      if (di === 0 || d.date === 1) {
        const startX = msToX(d.midnightUtcMs, rangeStartMs, pxPerHour) - scrollX
        if (monthSpans.length > 0) monthSpans[monthSpans.length - 1].endX = startX
        monthSpans.push({ startX, endX: 0, year: d.year, month: d.month })
      }
    }
    if (monthSpans.length > 0) {
      monthSpans[monthSpans.length - 1].endX = msToX(rangeEndMs, rangeStartMs, pxPerHour) - scrollX
    }
    ctx.font = `${FONT_SIZE_HEADER}px ${FONT_FAMILY}`
    ctx.fillStyle = colors.textColor
    for (const l of layoutMonthLabels(monthSpans, canvasWidth, (s) => ctx.measureText(s).width)) {
      ctx.fillText(l.label, l.x, 3)
      monthLabelHits.push({ x: l.x, width: l.width, year: l.year, month: l.month })
    }
  }

  // ── Hour labels (in local timezone) ──
  // First local midnight in UTC
  const firstLocal = days[0]
  const hourAnchorMs = firstLocal ? firstLocal.midnightUtcMs : rangeStartMs

  // F54-P02: only iterate hours inside the visible window (±60px margin), instead of
  // walking the full date range every frame. Start stays aligned to the local-midnight
  // anchor so the local-hour modulo math is unchanged.
  const visStartMs = rangeStartMs + ((scrollX - 60) / pxPerHour) * 3600000
  const visEndMs = rangeStartMs + ((scrollX + canvasWidth + 60) / pxPerHour) * 3600000
  const hourLoopStart = hourAnchorMs + Math.max(0, Math.floor((visStartMs - hourAnchorMs) / 3600000)) * 3600000
  const hourLoopEnd = Math.min(rangeEndMs, visEndMs)

  if (dayWidth >= 120) {
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `${FONT_SIZE_HEADER - 1}px ${FONT_FAMILY}`
    const labelMinPx = 35
    let hourStep = Math.max(1, Math.ceil(labelMinPx / pxPerHour))
    const niceSteps = [1, 2, 3, 4, 6, 8, 12]
    hourStep = niceSteps.find((s) => s >= hourStep) ?? 12

    let hourMs = hourLoopStart
    while (hourMs <= hourLoopEnd) {
      // Local hour = (elapsed ms from local midnight) / 3600000
      const elapsedFromMidnight = (hourMs - hourAnchorMs) % 86400000
      const localH = Math.round(elapsedFromMidnight / 3600000)
      if (localH % hourStep === 0) {
        const x = msToX(hourMs, rangeStartMs, pxPerHour) - scrollX
        if (x > -50 && x < canvasWidth + 50) {
          ctx.fillText(localH === 0 ? '0' : String(localH), x + 2, bottomRowY + 2)
        }
      }
      hourMs += 3600000
    }
  } else if (pxPerHour >= 20) {
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `${FONT_SIZE_HEADER - 2}px ${FONT_FAMILY}`
    const hourStep = pxPerHour < 40 ? 6 : 3

    let hourMs = hourLoopStart
    while (hourMs <= hourLoopEnd) {
      const elapsedFromMidnight = (hourMs - hourAnchorMs) % 86400000
      const localH = Math.round(elapsedFromMidnight / 3600000)
      if (localH % hourStep === 0) {
        const x = msToX(hourMs, rangeStartMs, pxPerHour) - scrollX
        if (x > 0 && x < canvasWidth) {
          ctx.fillText(localH === 0 ? '0' : String(localH), x + 2, bottomRowY + 2)
        }
      }
      hourMs += 3600000
    }
  }

  // Horizontal divider between top/bottom rows
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 0.5
  ctx.globalAlpha = 0.4
  ctx.beginPath()
  ctx.moveTo(0, bottomRowY)
  ctx.lineTo(canvasWidth, bottomRowY)
  ctx.stroke()
  ctx.globalAlpha = 1

  // For Pairing pane, add extra bottom row separator
  if (isPairing) {
    ctx.strokeStyle = colors.gridColorMajor
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.moveTo(0, hh)
    ctx.lineTo(canvasWidth, hh)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

/**
 * Highlight the drop target row (used during drag operations).
 */
export const drawDropTargetHighlight = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth, scrollY, dropTargetRow, frozenRowCount } = rc
  if (dropTargetRow < 0) return
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)
  const rh = getRowHeight(rc)

  const y = rowY(dropTargetRow, scrollY, frozenRowCount, hh, rh)
  if (y + rh < hh) return

  ctx.fillStyle = colors.dropTargetColor
  ctx.fillRect(0, Math.max(y, hh), canvasWidth, rh)

  ctx.strokeStyle = colors.dropTargetBorder
  ctx.lineWidth = 2
  ctx.strokeRect(0, Math.max(y, hh), canvasWidth, rh)
}

/**
 * Full base render pass: background, weekend, today highlight, grid, now line, drop target.
 * Task-specific rendering is done by pane-specific renderers afterward.
 */
export const renderBase = (rc: BaseRenderContext): void => {
  drawBackground(rc)
  drawRosterPeriodBands(rc)
  drawWeekendHighlight(rc)
  drawTodayHighlight(rc)
  drawGridLines(rc)
  drawNowLine(rc)
  drawDropTargetHighlight(rc)
  // Note: Timeline header is rendered by the shared TimeAxis component above panes,
  // not inside each pane canvas. Only call drawTimelineHeader() when used standalone.
}

/**
 * Re-draw frozen zone background to cover any scrollable content that leaked above.
 * Call this AFTER pane-specific rendering to ensure frozen rows are visually on top.
 */
/**
 * Re-draw frozen zone on right canvas with frozen tint + separators.
 * Call AFTER pane-specific rendering to cover any scrollable content that leaked above.
 */
export const drawFrozenOverlay = (rc: BaseRenderContext): void => {
  const { ctx, canvasWidth, scrollY, totalRows, frozenRowCount } = rc
  if (frozenRowCount <= 0) return
  const colors = getGanttColors()
  const hh = getHeaderHeight(rc)
  const rh = getRowHeight(rc)

  const fzH = frozenZoneHeight(frozenRowCount, rh)

  // Re-draw each frozen row tint + grid line. Do not clear the row: roster
  // duties on pinned rows must remain visible.
  for (let i = 0; i < frozenRowCount && i < totalRows; i++) {
    const y = rowY(i, scrollY, frozenRowCount, hh, rh)

    // Frozen tint
    ctx.fillStyle = colors.rowFrozenColor
    ctx.fillRect(0, y, canvasWidth, rh)

    // Row separator
    ctx.strokeStyle = colors.gridColor
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, y + rh)
    ctx.lineTo(canvasWidth, y + rh)
    ctx.stroke()
  }

  // Separator line between frozen and scrollable
  if (frozenRowCount < totalRows) {
    const sepY = hh + fzH
    ctx.save()
    ctx.strokeStyle = colors.selectionBorder
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(0, sepY)
    ctx.lineTo(canvasWidth, sepY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}
