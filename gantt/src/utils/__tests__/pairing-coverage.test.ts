// gantt/src/utils/__tests__/pairing-coverage.test.ts
import { describe, it, expect } from 'vitest'
import {
  classifyCoverage,
  coverageMatches,
  isCoverageMet,
  ALL_COVERAGE,
} from '../pairing-coverage'

const caFullFoShort = [
  { rank: 'CA', plan: 1, fill: 1 },
  { rank: 'FO', plan: 1, fill: 0 },
]
const caShortFoFull = [
  { rank: 'CA', plan: 1, fill: 0 },
  { rank: 'FO', plan: 1, fill: 1 },
]

describe('classifyCoverage', () => {
  it('no composition requirement → full', () => {
    expect(classifyCoverage([])).toBe('full')
  })
  it('total fill 0 → open', () => {
    expect(classifyCoverage([{ plan: 1, fill: 0 }, { plan: 1, fill: 0 }])).toBe('open')
  })
  it('every slot exactly met → full', () => {
    expect(classifyCoverage([{ plan: 2, fill: 2 }, { plan: 1, fill: 1 }])).toBe('full')
  })
  it('a slot short → partial', () => {
    expect(classifyCoverage([{ plan: 2, fill: 1 }, { plan: 1, fill: 1 }])).toBe('partial')
  })
  it('no shortage, a slot over → over', () => {
    expect(classifyCoverage([{ plan: 2, fill: 3 }, { plan: 1, fill: 1 }])).toBe('over')
  })
  it('shortage wins over surplus (over on one rank, short on another) → partial', () => {
    expect(classifyCoverage([{ plan: 2, fill: 3 }, { plan: 1, fill: 0 }])).toBe('partial')
  })
  it('isCoverageMet true for full and over, false for open/partial', () => {
    expect(isCoverageMet([{ plan: 1, fill: 1 }])).toBe(true)   // full
    expect(isCoverageMet([{ plan: 1, fill: 2 }])).toBe(true)   // over
    expect(isCoverageMet([{ plan: 1, fill: 0 }])).toBe(false)  // open
    expect(isCoverageMet([{ plan: 2, fill: 1 }])).toBe(false)  // partial
  })
  it('ALL_COVERAGE lists exactly the four states', () => {
    expect(ALL_COVERAGE).toEqual(['open', 'partial', 'full', 'over'])
  })
})

describe('rank-scoped coverage', () => {
  it('CA full + FO short → whole-pairing partial; CA-scoped → full', () => {
    expect(classifyCoverage(caFullFoShort)).toBe('partial')
    expect(classifyCoverage(caFullFoShort, ['CA'])).toBe('full')
  })
  it('CA short + FO full → CA-scoped open', () => {
    expect(classifyCoverage(caShortFoFull, ['CA'])).toBe('open')
  })
  it('Open+Partial + Rank=CA excludes CA-full FO-short', () => {
    expect(coverageMatches(['open', 'partial'], caFullFoShort, ['CA'])).toBe(false)
    expect(coverageMatches(['open', 'partial'], caShortFoFull, ['CA'])).toBe(true)
  })
  it('Open+Partial with no ranks still keeps FO-short (whole-pairing partial)', () => {
    expect(coverageMatches(['open', 'partial'], caFullFoShort)).toBe(true)
  })
})
