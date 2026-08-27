import { describe, expect, it } from 'vitest'

import { rankAppliesToDivision } from '../use-rank-options'

describe('rankAppliesToDivision', () => {
  it('matches a single-division rank', () => {
    expect(rankAppliesToDivision('P', 'P')).toBe(true)
    expect(rankAppliesToDivision('P', 'C')).toBe(false)
  })

  it('matches a multi-division rank for either division', () => {
    expect(rankAppliesToDivision('P,C', 'P')).toBe(true)
    expect(rankAppliesToDivision('P,C', 'C')).toBe(true)
    expect(rankAppliesToDivision('P,C', 'A')).toBe(false)
  })

  it('matches regardless of non-canonical order', () => {
    expect(rankAppliesToDivision('C,P', 'P')).toBe(true)
  })

  it('keeps all ranks when no division filter is set', () => {
    expect(rankAppliesToDivision('P', '')).toBe(true)
    expect(rankAppliesToDivision('C', '')).toBe(true)
  })
})
