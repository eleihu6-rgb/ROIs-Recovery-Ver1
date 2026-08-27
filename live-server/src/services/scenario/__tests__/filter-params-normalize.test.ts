import { describe, expect, it } from 'vitest'
import {
  normalizeCrewDivision,
  normalizePoScope,
} from '../filter-params-normalize.js'

describe('filter-params-normalize', () => {
  it('normalizeCrewDivision maps empty/ALL/A to P', () => {
    expect(normalizeCrewDivision(undefined)).toBe('P')
    expect(normalizeCrewDivision('ALL')).toBe('P')
    expect(normalizeCrewDivision('A')).toBe('P')
    expect(normalizeCrewDivision('C')).toBe('C')
  })

  it('normalizePoScope maps legacy base only (division from workset)', () => {
    expect(normalizePoScope({ base: 'YYZ' })).toEqual({ division: 'P', bases: ['YYZ'] })
    expect(normalizePoScope({ bases: ['YEG'] }).bases).toEqual(['YEG'])
  })
})
