import { FONT_FAMILY } from './gantt-constants'

/** Lock indicator colors — blue for own locks, red for others */
export const LOCK_COLOR_MINE = '#3b82f6'
export const LOCK_COLOR_OTHER = '#ef4444'

/**
 * Draw a lock underline at the bottom of a task block.
 * Blue = current user's lock, Red = another user's lock.
 */
export const drawLockIndicator = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  taskHeight: number,
  lockType: 'mine' | 'other',
): void => {
  const color = lockType === 'mine' ? LOCK_COLOR_MINE : LOCK_COLOR_OTHER
  const lineY = y + taskHeight - 1

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, lineY)
  ctx.lineTo(x + width, lineY)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw a lock badge on the crew row header (left panel).
 * Shows a small colored dot + truncated username.
 */
export const drawCrewLockBadge = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  username: string,
  lockType: 'mine' | 'other',
): void => {
  const color = lockType === 'mine' ? LOCK_COLOR_MINE : LOCK_COLOR_OTHER
  const radius = 3

  ctx.save()

  // Dot
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()

  // Username text (truncated)
  ctx.fillStyle = color
  ctx.font = `9px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  const label = username.length > 8 ? username.slice(0, 7) + '\u2026' : username
  ctx.fillText(label, x + 5, y)

  ctx.restore()
}
