import { format, startOfDay, addDays, addHours } from 'date-fns'
import { parseISO } from '@/utils/date'
import {
  ROW_HEIGHT,
  HEADER_HEIGHT,
  TASK_PADDING,
  TASK_HEIGHT,
  MIN_TASK_WIDTH,
  FONT_SIZE_HEADER,
  FONT_SIZE_TASK,
  GRID_COLOR,
  GRID_COLOR_MAJOR,
  BG_COLOR,
  BG_COLOR_ALT,
  BG_COLOR_HEADER,
  BG_COLOR_TODAY,
  TEXT_COLOR,
  TEXT_COLOR_SECONDARY,
} from './gantt-constants'
import { timeToX, rowToY, getChartWidth } from './gantt-utils'
import { getTaskColor, SELECTION_COLOR, HOVER_COLOR, VIOLATION_COLOR } from '@/utils/color'
import type { RosterItem } from '@/types'

export interface RenderContext {
  ctx: CanvasRenderingContext2D
  dpr: number
  canvasWidth: number
  canvasHeight: number
  scrollX: number
  scrollY: number
  pxPerHour: number
  rangeStart: Date
  rangeEnd: Date
  crewIds: string[]
  crewLabels: string[]
  items: RosterItem[]
  selectedTaskIds: Set<number>
  hoveredTaskId: number | null
  violationTaskIds: Set<number>
}

/**
 * Main render function. Draws the entire Gantt chart onto the canvas.
 * Uses virtual rendering: only draws items visible in the viewport.
 */
export const renderGantt = (rc: RenderContext): void => {
  const { ctx, dpr, canvasWidth, canvasHeight, scrollX, scrollY } = rc

  // Clear canvas
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // Draw layers in order
  drawBackground(rc)
  drawTodayHighlight(rc)
  drawGridLines(rc)
  drawTasks(rc)
  drawTimelineHeader(rc)
  drawCrewLabels(rc)

  ctx.restore()
}

/** Draw alternating row backgrounds */
const drawBackground = (rc: RenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollY, crewIds } = rc

  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // Determine visible row range
  const firstVisibleRow = Math.max(0, Math.floor(scrollY / ROW_HEIGHT))
  const lastVisibleRow = Math.min(
    crewIds.length - 1,
    Math.ceil((scrollY + canvasHeight) / ROW_HEIGHT),
  )

  for (let i = firstVisibleRow; i <= lastVisibleRow; i++) {
    const y = rowToY(i) - scrollY
    if (y + ROW_HEIGHT < HEADER_HEIGHT) continue
    if (y > canvasHeight) break

    if (i % 2 === 1) {
      ctx.fillStyle = BG_COLOR_ALT
      ctx.fillRect(0, Math.max(y, HEADER_HEIGHT), canvasWidth, ROW_HEIGHT)
    }
  }
}

/** Highlight today's column */
const drawTodayHighlight = (rc: RenderContext): void => {
  const { ctx, canvasHeight, scrollX, pxPerHour, rangeStart } = rc

  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const x1 = timeToX(today, rangeStart, pxPerHour) - scrollX
  const x2 = timeToX(tomorrow, rangeStart, pxPerHour) - scrollX

  if (x2 > 0 && x1 < rc.canvasWidth) {
    ctx.fillStyle = BG_COLOR_TODAY
    ctx.fillRect(x1, HEADER_HEIGHT, x2 - x1, canvasHeight - HEADER_HEIGHT)
  }
}

/** Draw grid lines (vertical time lines + horizontal row separators) */
const drawGridLines = (rc: RenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, scrollY, pxPerHour, rangeStart, rangeEnd, crewIds } = rc

  ctx.lineWidth = 0.5

  // Vertical lines: determine interval based on zoom level

  let hourStep = 1
  if (pxPerHour <= 4) hourStep = 24
  else if (pxPerHour <= 10) hourStep = 6
  else if (pxPerHour <= 20) hourStep = 3
  else if (pxPerHour <= 40) hourStep = 1

  const chartWidth = getChartWidth(rangeStart, rangeEnd, pxPerHour)
  let current = startOfDay(rangeStart)

  while (current <= rangeEnd) {
    const x = timeToX(current, rangeStart, pxPerHour) - scrollX

    if (x >= 0 && x <= canvasWidth) {
      const isDay = current.getHours() === 0
      ctx.strokeStyle = isDay ? GRID_COLOR_MAJOR : GRID_COLOR
      ctx.lineWidth = isDay ? 1 : 0.5
      ctx.beginPath()
      ctx.moveTo(x, HEADER_HEIGHT)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    current = addHours(current, hourStep)
  }

  // Horizontal lines
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 0.5

  const firstVisibleRow = Math.max(0, Math.floor(scrollY / ROW_HEIGHT))
  const lastVisibleRow = Math.min(crewIds.length, Math.ceil((scrollY + canvasHeight) / ROW_HEIGHT))

  for (let i = firstVisibleRow; i <= lastVisibleRow; i++) {
    const y = rowToY(i) - scrollY
    if (y < HEADER_HEIGHT || y > canvasHeight) continue

    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvasWidth, y)
    ctx.stroke()
  }
}

/** Draw the time axis header */
const drawTimelineHeader = (rc: RenderContext): void => {
  const { ctx, canvasWidth, scrollX, pxPerHour, rangeStart, rangeEnd } = rc

  // Header background
  ctx.fillStyle = BG_COLOR_HEADER
  ctx.fillRect(0, 0, canvasWidth, HEADER_HEIGHT)

  // Bottom border
  ctx.strokeStyle = GRID_COLOR_MAJOR
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, HEADER_HEIGHT)
  ctx.lineTo(canvasWidth, HEADER_HEIGHT)
  ctx.stroke()



  // Day labels (top row)
  ctx.fillStyle = TEXT_COLOR
  ctx.font = `bold ${FONT_SIZE_HEADER}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  ctx.textBaseline = 'top'

  let day = startOfDay(rangeStart)
  while (day <= rangeEnd) {
    const x = timeToX(day, rangeStart, pxPerHour) - scrollX
    const nextDay = addDays(day, 1)
    const nextX = timeToX(nextDay, rangeStart, pxPerHour) - scrollX

    if (nextX > 0 && x < canvasWidth) {
      const label = format(day, 'MM/dd EEE')
      const drawX = Math.max(x + 4, 4)
      ctx.fillText(label, drawX, 6)
    }

    day = nextDay
  }

  // Hour labels (bottom row) — only show when zoomed in enough
  if (pxPerHour >= 20) {
    ctx.fillStyle = TEXT_COLOR_SECONDARY
    ctx.font = `${FONT_SIZE_HEADER - 1}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

    let hourStep = 1
    if (pxPerHour < 40) hourStep = 3
    if (pxPerHour < 20) hourStep = 6

    let hour = startOfDay(rangeStart)
    while (hour <= rangeEnd) {
      if (hour.getHours() % hourStep === 0 && hour.getHours() !== 0) {
        const x = timeToX(hour, rangeStart, pxPerHour) - scrollX
        if (x > 0 && x < canvasWidth) {
          ctx.fillText(format(hour, 'HH:mm'), x + 2, HEADER_HEIGHT - 16)
        }
      }
      hour = addHours(hour, 1)
    }
  }
}

/** Draw crew labels on the left (overlay on header area, pinned) */
const drawCrewLabels = (rc: RenderContext): void => {
  // Crew labels are rendered in the sidebar DOM, not on canvas
  // This is intentionally empty — the sidebar component handles crew names
}

/** Draw all visible task blocks */
const drawTasks = (rc: RenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, scrollY, pxPerHour, rangeStart, crewIds, items, selectedTaskIds, hoveredTaskId, violationTaskIds } = rc

  // Determine visible row range for virtual rendering
  const firstVisibleRow = Math.max(0, Math.floor(scrollY / ROW_HEIGHT))
  const lastVisibleRow = Math.min(
    crewIds.length - 1,
    Math.ceil((scrollY + canvasHeight) / ROW_HEIGHT),
  )

  // Build crew → row index map
  const crewRowMap = new Map<string, number>()
  for (let i = firstVisibleRow; i <= lastVisibleRow; i++) {
    crewRowMap.set(crewIds[i], i)
  }

  // Filter to only visible items
  const visibleItems = items.filter((item) => {
    if (!item.schStrDtUtc || !item.schEndDtUtc) return false
    if (!crewRowMap.has(item.crewId)) return false

    const startX = timeToX(parseISO(item.schStrDtUtc), rangeStart, pxPerHour) - scrollX
    const endX = timeToX(parseISO(item.schEndDtUtc), rangeStart, pxPerHour) - scrollX

    // Off-screen horizontally
    return endX > 0 && startX < canvasWidth
  })

  for (const task of visibleItems) {
    const rowIndex = crewRowMap.get(task.crewId)!
    drawSingleTask(rc, task, rowIndex)
  }
}

/** Draw a single task block */
const drawSingleTask = (
  rc: RenderContext,
  task: RosterItem,
  rowIndex: number,
): void => {
  const { ctx, scrollX, scrollY, pxPerHour, rangeStart, selectedTaskIds, hoveredTaskId, violationTaskIds } = rc

  if (!task.schStrDtUtc || !task.schEndDtUtc) return

  const taskStart = parseISO(task.schStrDtUtc)
  const taskEnd = parseISO(task.schEndDtUtc)
  const x = timeToX(taskStart, rangeStart, pxPerHour) - scrollX
  const endX = timeToX(taskEnd, rangeStart, pxPerHour) - scrollX
  const width = Math.max(endX - x, MIN_TASK_WIDTH)
  const y = rowToY(rowIndex) - scrollY + TASK_PADDING

  if (y + TASK_HEIGHT < HEADER_HEIGHT) return

  const color = getTaskColor(task.assignmentGroup)
  const isSelected = selectedTaskIds.has(task.id)
  const isHovered = hoveredTaskId === task.id
  const isViolation = violationTaskIds.has(task.id)

  // Task block background
  ctx.fillStyle = color.bg
  ctx.beginPath()
  roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
  ctx.fill()

  // Selection overlay
  if (isSelected) {
    ctx.fillStyle = SELECTION_COLOR
    ctx.beginPath()
    roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
    ctx.fill()
  }

  // Hover overlay
  if (isHovered && !isSelected) {
    ctx.fillStyle = HOVER_COLOR
    ctx.beginPath()
    roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
    ctx.fill()
  }

  // Border
  ctx.strokeStyle = isViolation ? VIOLATION_COLOR : color.border
  ctx.lineWidth = isViolation ? 2 : 1
  ctx.beginPath()
  roundedRect(ctx, x, y, width, TASK_HEIGHT, 3)
  ctx.stroke()

  // Violation corner badge
  if (isViolation) {
    ctx.fillStyle = VIOLATION_COLOR
    ctx.beginPath()
    ctx.moveTo(x + width - 10, y)
    ctx.lineTo(x + width, y)
    ctx.lineTo(x + width, y + 10)
    ctx.closePath()
    ctx.fill()
  }

  // Task label text
  if (width > 20) {
    const label = task.label || task.assignment || task.assignmentGroup
    ctx.fillStyle = color.text
    ctx.font = `${FONT_SIZE_TASK}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
    ctx.textBaseline = 'middle'

    // Clip text to task block
    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 3, y, width - 6, TASK_HEIGHT)
    ctx.clip()
    ctx.fillText(label, x + 4, y + TASK_HEIGHT / 2)
    ctx.restore()
  }
}

/** Helper: draw a rounded rectangle path */
const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}
