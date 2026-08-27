import { describe, expect, it } from 'vitest'
import { getRowBackgroundColor } from '../gantt-constants'

describe('getRowBackgroundColor', () => {
  const colors = {
    bgColor: '#ffffff',
    bgColorAlt: '#eaf4ff',
  }

  it('keeps existing odd-row alternate stripe parity', () => {
    expect(getRowBackgroundColor(0, colors)).toBe('#ffffff')
    expect(getRowBackgroundColor(1, colors)).toBe('#eaf4ff')
    expect(getRowBackgroundColor(2, colors)).toBe('#ffffff')
    expect(getRowBackgroundColor(3, colors)).toBe('#eaf4ff')
  })
})
