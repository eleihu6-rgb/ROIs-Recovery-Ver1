import { describe, expect, it } from 'vitest'
import { type FlightFilter, flightFiltersEqual, hasFlightFilterValues } from '../filter-store'

const base: FlightFilter = { depArps: [], arvArps: [], fltNums: [], fleets: [], statuses: [] }

describe('FlightFilter register field', () => {
  it('treats differing register lists as not equal', () => {
    expect(flightFiltersEqual({ ...base, register: ['C-ABC'] }, { ...base, register: ['C-XYZ'] })).toBe(false)
    expect(flightFiltersEqual({ ...base, register: ['C-ABC'] }, { ...base, register: ['C-ABC'] })).toBe(true)
  })
  it('counts register as an active value', () => {
    expect(hasFlightFilterValues({ ...base, register: ['C-ABC'] })).toBe(true)
    expect(hasFlightFilterValues(base)).toBe(false)
  })
  it('is backward compatible when register is omitted', () => {
    expect(flightFiltersEqual(base, base)).toBe(true)
    expect(hasFlightFilterValues(base)).toBe(false)
  })
})
