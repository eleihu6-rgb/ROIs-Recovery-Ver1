import { startOfDay, addDays } from 'date-fns'
import {
  SUMMARY_BAR_HEIGHT,
  getGanttColors,
} from '../gantt-constants'
import { timeToX } from '../gantt-utils'
import { getTaskColor, getAssignmentGroupCodes } from '@/utils/color'

/** Summary data for a single day: counts by assignment group */
export interface DaySummary {
  date: Date
  /** Map of assignmentGroup -> crew count */
  counts: Record<string, number>
  totalCrews: number
}

export interface SummaryRenderContext {
  ctx: CanvasRenderingContext2D
  dpr: number
  canvasWidth: number
  scrollX: number
  pxPerHour: number
  rangeStart: Date
  rangeEnd: Date
  summaries: DaySummary[]
}

/**
 * Render the summary bar: one stacked column per day, colored by assignment group percentages.
 */
export const renderSummaryBar = (rc: SummaryRenderContext): void => {
  const { ctx, canvasWidth, scrollX, pxPerHour, rangeStart, rangeEnd, summaries } = rc
  const colors = getGanttColors()

  const barHeight = SUMMARY_BAR_HEIGHT

  // Background
  ctx.fillStyle = colors.bgColorHeader
  ctx.fillRect(0, 0, canvasWidth, barHeight)

  // Bottom border
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, barHeight)
  ctx.lineTo(canvasWidth, barHeight)
  ctx.stroke()

  if (summaries.length === 0) return

  // Build a lookup: date string -> summary
  const summaryMap = new Map<string, DaySummary>()
  for (const s of summaries) {
    summaryMap.set(startOfDay(s.date).toISOString(), s)
  }

  const knownGroups = getAssignmentGroupCodes()

  // Iterate each day in range
  let day = startOfDay(rangeStart)
  while (day <= rangeEnd) {
    const nextDay = addDays(day, 1)
    const x1 = timeToX(day, rangeStart, pxPerHour) - scrollX
    const x2 = timeToX(nextDay, rangeStart, pxPerHour) - scrollX

    if (x2 > 0 && x1 < canvasWidth) {
      const colWidth = x2 - x1
      const summary = summaryMap.get(day.toISOString())

      if (summary && summary.totalCrews > 0) {
        drawStackedColumn(ctx, x1, 0, colWidth, barHeight, summary, knownGroups)
      }
    }

    day = nextDay
  }
}

/**
 * Draw a single day's stacked column.
 */
const drawStackedColumn = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  summary: DaySummary,
  groups: string[],
): void => {
  const padding = 1
  const drawWidth = width - padding * 2
  const drawHeight = height - 4 // top/bottom padding
  const startY = y + 2

  let currentY = startY

  for (const group of groups) {
    const count = summary.counts[group] ?? 0
    if (count <= 0) continue

    const fraction = count / summary.totalCrews
    const blockHeight = Math.max(fraction * drawHeight, 1)

    const color = getTaskColor(group)
    ctx.fillStyle = color.bg
    ctx.fillRect(x + padding, currentY, drawWidth, blockHeight)

    currentY += blockHeight
  }

  // Also handle any unmatched groups
  for (const [group, count] of Object.entries(summary.counts)) {
    if (groups.includes(group)) continue
    if (count <= 0) continue

    const fraction = count / summary.totalCrews
    const blockHeight = Math.max(fraction * drawHeight, 1)

    const color = getTaskColor(group)
    ctx.fillStyle = color.bg
    ctx.fillRect(x + padding, currentY, drawWidth, blockHeight)

    currentY += blockHeight
  }
}
