import { VIOLATION_SEVERITY_COLORS, FONT_FAMILY } from './gantt-constants'

/** Side length (px) of the square violation badge. */
export const VIOLATION_BADGE_SIZE = 10

/**
 * Top-left (x, y) at which to draw the violation badge so it sits centered
 * inside the given puck rect. Centering keeps the badge clear of the
 * edge-anchored time / airport text that previously overlapped it.
 */
export const violationBadgePosition = (
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number,
): { x: number; y: number } => ({
  x: blockX + blockWidth / 2 - VIOLATION_BADGE_SIZE / 2,
  y: blockY + blockHeight / 2 - VIOLATION_BADGE_SIZE / 2,
})

/**
 * Draw a bell icon violation badge at the given position.
 * The color depends on the severity level (1-5).
 *
 * @param ctx - Canvas rendering context
 * @param x - X position (top-right area of the task block)
 * @param y - Y position
 * @param severity - Violation severity (1-5):
 *   1-2: yellow, 3: orange, 4-5: red
 */
export const drawViolationBadge = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  severity: number,
): void => {
  const clampedSev = Math.max(1, Math.min(5, severity))
  const color = VIOLATION_SEVERITY_COLORS[clampedSev] ?? VIOLATION_SEVERITY_COLORS[5]
  const size = VIOLATION_BADGE_SIZE

  ctx.save()

  // Draw a filled circle background
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()

  // Draw bell shape (simplified) using a unicode character
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 7px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('!', x + size / 2, y + size / 2)

  ctx.restore()
}

/**
 * Draw a violation BELL on the left crew panel (right of the MDO column) for any crew
 * that has rule violations. Colored by max severity (1-2 yellow, 3 orange, 4-5 red),
 * matching the per-rule severity palette. Hover is wired in pane-header-canvas →
 * ViolationTooltip, which lists the crew's roster + pairing rule warning messages.
 */
export const drawCrewViolationIndicator = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  maxSeverity: number,
): void => {
  const clampedSev = Math.max(1, Math.min(5, maxSeverity))
  const color = VIOLATION_SEVERITY_COLORS[clampedSev] ?? VIOLATION_SEVERITY_COLORS[5]
  const s = 5 // half-height of the bell

  ctx.save()
  ctx.fillStyle = color

  // Bell body (dome flaring to a rim).
  ctx.beginPath()
  ctx.moveTo(x - s, y + s * 0.7)
  ctx.lineTo(x + s, y + s * 0.7)
  ctx.lineTo(x + s * 0.78, y + s * 0.4)
  ctx.quadraticCurveTo(x + s * 0.72, y - s * 0.9, x, y - s)
  ctx.quadraticCurveTo(x - s * 0.72, y - s * 0.9, x - s * 0.78, y + s * 0.4)
  ctx.closePath()
  ctx.fill()

  // Top knob + clapper.
  ctx.beginPath()
  ctx.arc(x, y - s, s * 0.24, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y + s * 1.05, s * 0.26, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}
