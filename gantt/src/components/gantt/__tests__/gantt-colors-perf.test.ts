import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getGanttColors,
  BG_COLOR,
  TEXT_COLOR_WEEKEND,
  HOVER_BORDER_COLOR,
  OPTIMIZER_BORDER_COLOR,
  OPTIMIZER_BORDER_GREEN,
} from '../gantt-constants'

/**
 * Perf regression: getGanttColors runs in the canvas render loop (per-row/per-task
 * across multiple panes). `getComputedStyle` forces a style recalc and is the
 * expensive part, so the function MUST resolve the computed style only ONCE per
 * call — not once per CSS variable. Before the fix it called getComputedStyle 22×
 * per invocation (once per palette key). This test would have failed before the fix.
 */
describe('getGanttColors performance', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.style.cssText = ''
  })

  it('calls getComputedStyle exactly once per invocation', () => {
    const spy = vi.spyOn(window, 'getComputedStyle')
    getGanttColors()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('resolves CSS variable values from :root when present', () => {
    document.documentElement.style.setProperty('--gantt-bg', '#123456')
    document.documentElement.style.setProperty('--gantt-text-weekend', '#abcdef')
    const colors = getGanttColors()
    expect(colors.bgColor).toBe('#123456')
    expect(colors.textColorWeekend).toBe('#abcdef')
  })

  it('falls back to the constant when the CSS variable is absent', () => {
    // No custom properties set → every value must come from the fallback constant.
    const colors = getGanttColors()
    expect(colors.bgColor).toBe(BG_COLOR)
    expect(colors.textColorWeekend).toBe(TEXT_COLOR_WEEKEND)
    expect(colors.hoverBorder).toBe(HOVER_BORDER_COLOR)
    expect(colors.optimizerBorder).toBe(OPTIMIZER_BORDER_COLOR)
    expect(OPTIMIZER_BORDER_COLOR).toBe(OPTIMIZER_BORDER_GREEN)
    expect(OPTIMIZER_BORDER_GREEN).toBe('#1b9d4b')
  })

  it('returns a complete palette (all keys populated, no empty strings)', () => {
    const colors = getGanttColors()
    const values = Object.values(colors)
    expect(values).toHaveLength(24)
    expect(values.every((c) => typeof c === 'string' && c.length > 0)).toBe(true)
  })
})
