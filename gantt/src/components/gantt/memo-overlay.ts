/**
 * Crew-memo sticky-note badge for the roster canvas.
 *
 * Mirrors violation-overlay.ts: a small canvas-drawn badge anchored to a duty
 * puck. We anchor to the puck's top-left corner (not center) so it never sits on
 * top of the violation badge and stays clear of the puck's edge-anchored text.
 */

/** Side length (px) of the square memo badge. */
export const MEMO_BADGE_SIZE = 12

/**
 * Top-left (x, y) at which to draw the memo badge. Anchored just inside the
 * puck's top-left corner; when no puck owns the cell, the caller centers it.
 */
export const memoBadgePosition = (
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number,
  hasPuck: boolean,
): { x: number; y: number } => {
  if (hasPuck) return { x: blockX + 1, y: blockY + 1 }
  return {
    x: blockX + blockWidth / 2 - MEMO_BADGE_SIZE / 2,
    y: blockY + blockHeight / 2 - MEMO_BADGE_SIZE / 2,
  }
}

/** Draw a flat yellow sticky-note with a coral pin and red text lines. */
export const drawMemoBadge = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  const s = MEMO_BADGE_SIZE
  const fold = Math.round(s * 0.28)
  ctx.save()

  // note body (yellow) with a folded bottom-right corner
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + s, y)
  ctx.lineTo(x + s, y + s - fold)
  ctx.lineTo(x + s - fold, y + s)
  ctx.lineTo(x, y + s)
  ctx.closePath()
  ctx.fillStyle = '#fbd34d'
  ctx.fill()

  // folded corner (darker)
  ctx.beginPath()
  ctx.moveTo(x + s, y + s - fold)
  ctx.lineTo(x + s - fold, y + s)
  ctx.lineTo(x + s - fold, y + s - fold)
  ctx.closePath()
  ctx.fillStyle = '#e3a52e'
  ctx.fill()

  // text lines (red/orange)
  ctx.strokeStyle = '#e8553a'
  ctx.lineWidth = 1
  for (let i = 1; i <= 3; i++) {
    const ly = y + (s / 4) * i - 0.5
    ctx.beginPath()
    ctx.moveTo(x + 2, ly)
    ctx.lineTo(x + s - 3, ly)
    ctx.stroke()
  }

  // coral push-pin at the top-center
  ctx.beginPath()
  ctx.arc(x + s / 2, y, Math.max(1.5, s * 0.16), 0, Math.PI * 2)
  ctx.fillStyle = '#e8553a'
  ctx.fill()

  ctx.restore()
}
