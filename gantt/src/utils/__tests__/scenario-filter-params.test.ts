import { describe, expect, it } from 'vitest'
import {
  normalizeCrewDivision,
  normalizePoFilterParams,
  normalizeRoCrewFilter,
  normalizeRoPairingFilter,
} from '../scenario-filter-params'

describe('normalizeCrewDivision', () => {
  it('defaults empty / ALL / * / A to P', () => {
    expect(normalizeCrewDivision(null)).toBe('P')
    expect(normalizeCrewDivision('')).toBe('P')
    expect(normalizeCrewDivision('ALL')).toBe('P')
    expect(normalizeCrewDivision('*')).toBe('P')
    expect(normalizeCrewDivision('A')).toBe('P')
  })

  it('keeps valid codes', () => {
    expect(normalizeCrewDivision('C')).toBe('C')
    expect(normalizeCrewDivision(' P ')).toBe('P')
  })
})

describe('normalizePoFilterParams', () => {
  it('maps legacy singular base and ignores division in JSON', () => {
    const out = normalizePoFilterParams({ base: 'YYZ', division: 'C' })
    expect(out).toEqual({
      bases: ['YYZ'],
      flightNos: [],
      depAirports: [],
      arrAirports: [],
      fleets: [],
      flightStatus: 'ALL',
    })
    expect('division' in out).toBe(false)
  })

  it('preserves modern bases[] and flight facets', () => {
    const out = normalizePoFilterParams({
      bases: ['YEG'],
      flightNos: ['F8101'],
      depAirports: ['YYC'],
      arrAirports: [],
      fleets: ['7M8'],
      flightStatus: 'SCHEDULED',
    })
    expect(out.bases).toEqual(['YEG'])
    expect(out.flightNos).toEqual(['F8101'])
    expect(out.flightStatus).toBe('SCHEDULED')
  })
})

describe('normalizeRoCrewFilter', () => {
  it('keeps bases, ranks and fleets without division field', () => {
    const out = normalizeRoCrewFilter({
      bases: ['YEG'],
      ranks: ['CA'],
      fleets: [],
      seniority: { min: 1, max: '20' as never },
      birthday: { from: '1980-01-01', to: '1999-12-31' },
      status: 'ACTIVE',
    })
    expect(out.bases).toEqual(['YEG'])
    expect(out.ranks).toEqual(['CA'])
    expect(out.seniority).toEqual({ min: 1, max: 20 })
    expect(out.birthday).toEqual({ from: '1980-01-01', to: '1999-12-31' })
    expect('division' in out).toBe(false)
  })
})

describe('normalizeRoPairingFilter', () => {
  it('keeps bases, ranks, fleets, types and duration', () => {
    const out = normalizeRoPairingFilter({
      bases: ['YYZ'],
      ranks: ['FO'],
      fleets: ['7M8'],
      types: ['FLT'],
      duration: { min: '1' as never, max: 4 },
    })
    expect(out).toMatchObject({
      bases: ['YYZ'],
      ranks: ['FO'],
      fleets: ['7M8'],
      types: ['FLT'],
      duration: { min: 1, max: 4 },
    })
  })
})
