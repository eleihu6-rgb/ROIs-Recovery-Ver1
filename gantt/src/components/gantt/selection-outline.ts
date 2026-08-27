/**
 * Shared rounded outlines for Gantt selection vs optimizer (CR) identity.
 * Selection uses a solid thick ring + wash; CR keeps a thin green dashed ring.
 */
import {
  OPTIMIZER_BORDER_WIDTH,
  PENDING_BORDER_WIDTH,
  SELECTION_BORDER_WIDTH,
  SELECTION_DASH,
  SELECTION_GLOW_COLOR,
} from './gantt-constants'
import { roundedRect } from './gantt-utils'

export type OutlineStyle = 'solid' | 'dashed'

export interface DrawRoundedOutlineOptions {
  strokeColor: string
  style: OutlineStyle
  lineWidth: number
  /** Optional fill under the stroke (selection wash). */
  fillColor?: string | null
  radius?: number
}

/** Low-level rounded outline; restores line dash after stroke. */
export const drawRoundedOutline = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  options: DrawRoundedOutlineOptions,
): void => {
  const radius = options.radius ?? 3
  if (options.fillColor) {
    ctx.fillStyle = options.fillColor
    ctx.beginPath()
    roundedRect(ctx, x, y, w, h, radius)
    ctx.fill()
  }
  ctx.strokeStyle = options.strokeColor
  ctx.lineWidth = options.lineWidth
  if (options.style === 'dashed') {
    ctx.setLineDash(SELECTION_DASH)
  } else {
    ctx.setLineDash([])
  }
  ctx.beginPath()
  roundedRect(ctx, x, y, w, h, radius)
  ctx.stroke()
  ctx.setLineDash([])
}

/** Interactive focus: solid 3px ring + soft wash. */
export const drawSelectionOutline = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  strokeColor: string,
  fillColor: string = SELECTION_GLOW_COLOR,
): void => {
  drawRoundedOutline(ctx, x, y, w, h, {
    strokeColor,
    style: 'solid',
    lineWidth: SELECTION_BORDER_WIDTH,
    fillColor,
  })
}

/** CR source identity: thin green dashed ring (no wash). */
export const drawOptimizerOutline = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  strokeColor: string,
): void => {
  drawRoundedOutline(ctx, x, y, w, h, {
    strokeColor,
    style: 'dashed',
    lineWidth: OPTIMIZER_BORDER_WIDTH,
  })
}

/** Unsaved/pending Scenario edit identity: thin amber dashed ring (no wash). */
export const drawPendingOutline = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  strokeColor: string,
): void => {
  drawRoundedOutline(ctx, x, y, w, h, {
    strokeColor,
    style: 'dashed',
    lineWidth: PENDING_BORDER_WIDTH,
  })
}
