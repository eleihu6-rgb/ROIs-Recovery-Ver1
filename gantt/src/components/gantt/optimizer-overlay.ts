import { FONT_FAMILY } from './gantt-constants'

/** Font size (px) for the text-only optimizer ⚡ icon outside the puck corner. */
export const OPTIMIZER_BADGE_SIZE = 9

/** Minimum puck / check-in width (px) before the badge is drawn. */
export const OPTIMIZER_BADGE_MIN_WIDTH = 8

/** Roster item placed by the optimizer (Scenario assignments use source === 'CR'). */
export const isOptimizerRosterSource = (source: string | null | undefined): boolean => source === 'CR'

export const shouldDrawOptimizerBadge = (
  source: string | null | undefined,
  blockWidth: number,
): boolean => isOptimizerRosterSource(source) && blockWidth >= OPTIMIZER_BADGE_MIN_WIDTH

/** Matcha dashed pairing/puck outline when CR-sourced and not selected. */
export const shouldDrawOptimizerOutline = (
  source: string | null | undefined,
  isSelected: boolean,
): boolean => isOptimizerRosterSource(source) && !isSelected

export interface OptimizerBadgeBlock {
  blockX: number
  blockY: number
  blockWidth: number
}

/** Leftmost visible block wins when drawing one badge per logical puck/group. */
export const pickOptimizerBadgeBlock = (
  blocks: OptimizerBadgeBlock[],
  viewportWidth: number,
): OptimizerBadgeBlock | null => {
  let best: OptimizerBadgeBlock | null = null
  let bestLeft = Infinity
  for (const block of blocks) {
    const right = block.blockX + block.blockWidth
    if (right <= 0 || block.blockX >= viewportWidth) continue
    if (block.blockX < bestLeft) {
      bestLeft = block.blockX
      best = block
    }
  }
  return best
}

export type OptimizerBadgeAnchor = 'pairing' | 'ground'

export interface OptimizerBadgePlacement {
  x: number
  y: number
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
}

const halfBadge = (): number => Math.ceil(OPTIMIZER_BADGE_SIZE / 2)

/**
 * Flight / RES pairing — ⚡ straddles the puck top-left corner, half outside
 * left and above the check-in / pairing-start puck.
 */
export const optimizerBadgePositionTopLeftOutside = (
  blockX: number,
  blockY: number,
  _blockWidth?: number,
  _blockHeight?: number,
): OptimizerBadgePlacement => ({
  x: blockX - halfBadge(),
  y: blockY - halfBadge(),
  textAlign: 'left',
  textBaseline: 'top',
})

/**
 * Ground duties (DO, VAC, etc.) — ⚡ straddles the puck top-right corner,
 * half outside right and above the ground puck.
 */
export const optimizerBadgePositionTopRightOutside = (
  blockX: number,
  blockY: number,
  blockWidth: number,
  _blockHeight?: number,
): OptimizerBadgePlacement => ({
  x: blockX + blockWidth + halfBadge(),
  y: blockY - halfBadge(),
  textAlign: 'right',
  textBaseline: 'top',
})

/** Dispatch pairing vs ground anchor modes. */
export const optimizerBadgePosition = (
  anchor: OptimizerBadgeAnchor,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight?: number,
): OptimizerBadgePlacement =>
  anchor === 'pairing'
    ? optimizerBadgePositionTopLeftOutside(blockX, blockY, blockWidth, blockHeight)
    : optimizerBadgePositionTopRightOutside(blockX, blockY, blockWidth, blockHeight)

/** Amber ⚡ text only — optimizer-placed duty (source === 'CR'). No circle fill. */
export const drawOptimizerBadge = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  textAlign: CanvasTextAlign = 'left',
  textBaseline: CanvasTextBaseline = 'top',
): void => {
  ctx.save()
  ctx.fillStyle = '#f59e0b'
  ctx.font = `bold ${OPTIMIZER_BADGE_SIZE}px ${FONT_FAMILY}`
  ctx.textAlign = textAlign
  ctx.textBaseline = textBaseline
  ctx.fillText('⚡', x, y)
  ctx.restore()
}
