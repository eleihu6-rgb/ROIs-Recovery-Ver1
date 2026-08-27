import { describe, expect, it } from 'vitest'
import { resizeRowHeights } from '@/components/layout/row-resize'

describe('resizeRowHeights', () => {
  it('materializes visible rows above the dragged lower splitter before resizing', () => {
    const next = resizeRowHeights({
      rowHeights: [-1, -1, -1],
      measuredHeights: [320, 260, 180],
      draggedRowIndex: 1,
      dy: 40,
      containerHeight: 772,
      splitterTotalHeight: 12,
    })

    expect(next).toEqual([320, 300, 140])
  })

  it('redistributes height between the dragged row and its adjacent lower row', () => {
    const next = resizeRowHeights({
      rowHeights: [340, 260, -1],
      measuredHeights: [345, 258, 180],
      draggedRowIndex: 1,
      dy: -30,
      containerHeight: 732,
      splitterTotalHeight: 12,
    })

    expect(next).toEqual([340, 228, 152])
  })

  it('clamps the dragged row to the minimum height while expanding the adjacent lower row', () => {
    const next = resizeRowHeights({
      rowHeights: [-1, -1],
      measuredHeights: [180, 140],
      draggedRowIndex: 0,
      dy: -500,
      containerHeight: 326,
      splitterTotalHeight: 6,
    })

    expect(next).toEqual([80, 240])
  })

  it('keeps the bottom row at the minimum height when dragging the lower splitter downward', () => {
    const next = resizeRowHeights({
      rowHeights: [-1, -1, -1],
      measuredHeights: [240, 220, 180],
      draggedRowIndex: 1,
      dy: 300,
      containerHeight: 652,
      splitterTotalHeight: 12,
    })

    expect(next).toEqual([240, 320, 80])
  })

  it('keeps the lower row visible in a two-row stack when dragging the upper splitter downward', () => {
    const next = resizeRowHeights({
      rowHeights: [-1, -1],
      measuredHeights: [260, 240],
      draggedRowIndex: 0,
      dy: 500,
      containerHeight: 506,
      splitterTotalHeight: 6,
    })

    expect(next).toEqual([420, 80])
  })

  it('keeps deeper lower rows fixed while the splitter redistributes its adjacent pair', () => {
    const next = resizeRowHeights({
      rowHeights: [220, 180, 200],
      measuredHeights: [220, 180, 200],
      draggedRowIndex: 1,
      dy: 300,
      containerHeight: 612,
      splitterTotalHeight: 12,
    })

    expect(next).toEqual([220, 300, 80])
  })

  it('still lets the middle row shrink after the bottom row has already hit minimum height', () => {
    const next = resizeRowHeights({
      rowHeights: [240, 320, 80],
      measuredHeights: [240, 320, 80],
      draggedRowIndex: 0,
      dy: 100,
      containerHeight: 652,
      splitterTotalHeight: 12,
    })

    expect(next).toEqual([340, 220, 80])
  })
})
