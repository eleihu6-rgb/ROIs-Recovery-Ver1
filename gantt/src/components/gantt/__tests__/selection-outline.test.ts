import { describe, expect, it } from 'vitest'
import {
  OPTIMIZER_BORDER_WIDTH,
  SELECTION_BORDER_WIDTH,
  SELECTION_DASH,
  SELECTION_GLOW_COLOR,
} from '../gantt-constants'
import { drawOptimizerOutline, drawSelectionOutline } from '../selection-outline'

const createMockCtx = () => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
  }
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    setLineDash: record('setLineDash'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    stroke: record('stroke'),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx }
}

describe('drawSelectionOutline', () => {
  it('draws a solid 3px ring with wash fill (no dash)', () => {
    const { ctx, calls, raw } = createMockCtx()

    drawSelectionOutline(ctx, 10, 20, 100, 30, '#c026d3', 'rgba(192, 38, 211, 0.22)')

    expect(raw.fillStyle).toBe('rgba(192, 38, 211, 0.22)')
    expect(raw.strokeStyle).toBe('#c026d3')
    expect(raw.lineWidth).toBe(SELECTION_BORDER_WIDTH)
    expect(SELECTION_BORDER_WIDTH).toBe(3)

    const dashCalls = calls.filter((c) => c.method === 'setLineDash')
    expect(dashCalls.length).toBeGreaterThanOrEqual(2)
    // solid path: empty dash before stroke, then restore
    expect(dashCalls.some((c) => Array.isArray(c.args[0]) && (c.args[0] as number[]).length === 0)).toBe(true)
    expect(dashCalls.at(-1)?.args[0]).toEqual([])

    expect(calls.some((c) => c.method === 'fill')).toBe(true)
    expect(calls.some((c) => c.method === 'stroke')).toBe(true)
  })

  it('defaults wash to SELECTION_GLOW_COLOR', () => {
    const { ctx, raw } = createMockCtx()
    drawSelectionOutline(ctx, 0, 0, 50, 20, '#c026d3')
    expect(raw.fillStyle).toBe(SELECTION_GLOW_COLOR)
  })
})

describe('drawOptimizerOutline', () => {
  it('draws a thin green dashed ring without wash', () => {
    const { ctx, calls, raw } = createMockCtx()

    drawOptimizerOutline(ctx, 10, 20, 100, 30, '#1b9d4b')

    expect(raw.strokeStyle).toBe('#1b9d4b')
    expect(raw.lineWidth).toBe(OPTIMIZER_BORDER_WIDTH)
    expect(OPTIMIZER_BORDER_WIDTH).toBe(2)

    const dashCalls = calls.filter((c) => c.method === 'setLineDash')
    expect(dashCalls.some((c) => Array.isArray(c.args[0]) && (c.args[0] as number[]).join(',') === SELECTION_DASH.join(','))).toBe(true)
    expect(dashCalls.at(-1)?.args[0]).toEqual([])

    expect(calls.some((c) => c.method === 'fill')).toBe(false)
    expect(calls.some((c) => c.method === 'stroke')).toBe(true)
  })
})

describe('selection vs CR outline contract', () => {
  it('keeps selection thicker/solid and CR thinner/dashed', () => {
    expect(SELECTION_BORDER_WIDTH).toBeGreaterThan(OPTIMIZER_BORDER_WIDTH)
    expect(SELECTION_DASH).toEqual([4, 3])
  })
})
