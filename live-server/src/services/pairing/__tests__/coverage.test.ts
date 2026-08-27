import { describe, it, expect } from 'vitest'
import { classifyCoverage, isCoverageMet } from '../coverage'

describe('classifyCoverage (live-server mirror)', () => {
  it('empty → full', () => expect(classifyCoverage([])).toBe('full'))
  it('total fill 0 → open', () => expect(classifyCoverage([{ plan: 1, fill: 0 }])).toBe('open'))
  it('exact → full', () => expect(classifyCoverage([{ plan: 2, fill: 2 }])).toBe('full'))
  it('short → partial', () => expect(classifyCoverage([{ plan: 2, fill: 1 }])).toBe('partial'))
  it('over (no short) → over', () => expect(classifyCoverage([{ plan: 1, fill: 2 }])).toBe('over'))
  it('short beats over → partial', () =>
    expect(classifyCoverage([{ plan: 1, fill: 2 }, { plan: 1, fill: 0 }])).toBe('partial'))
  it('met = full|over', () => {
    expect(isCoverageMet([{ plan: 1, fill: 1 }])).toBe(true)
    expect(isCoverageMet([{ plan: 1, fill: 2 }])).toBe(true)
    expect(isCoverageMet([{ plan: 1, fill: 0 }])).toBe(false)
  })
  it('rank-scoped: CA full + FO short → full for CA ranks', () => {
    const slots = [
      { rank: 'CA', plan: 1, fill: 1 },
      { rank: 'FO', plan: 1, fill: 0 },
    ]
    expect(classifyCoverage(slots)).toBe('partial')
    expect(classifyCoverage(slots, ['CA'])).toBe('full')
  })
})
