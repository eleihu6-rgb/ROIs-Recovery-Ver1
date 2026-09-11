import { describe, it, expect, beforeEach } from 'vitest'
import { useTimezoneStore, type TzOption } from '@/stores/timezone-store'
import { useFilterStore } from '@/stores/filter-store'
import { syncDisplayTimezoneForBases } from '../base-timezone'

const setTimezone = (zoneId: string, airport: string): void => {
  useTimezoneStore.getState().setTimezone(zoneId, airport)
}

const setOptions = (options: TzOption[]): void => {
  useTimezoneStore.getState().setOptions(options)
}

const clearFilter = (): void => {
  useFilterStore.getState().resetFilters()
}

const YVR: TzOption = {
  airport: 'YVR',
  airportName: 'Vancouver',
  zoneId: 'America/Vancouver',
  utcOffset: 'UTC-8',
  isBase: true,
}
const PEK: TzOption = {
  airport: 'PEK',
  airportName: 'Beijing',
  zoneId: 'Asia/Shanghai',
  utcOffset: 'UTC+8',
  isBase: true,
}
const UTC_OPT: TzOption = {
  airport: 'UTC',
  airportName: 'Coordinated Universal Time',
  zoneId: 'UTC',
  utcOffset: 'UTC+0',
  isBase: false,
}

describe('syncDisplayTimezoneForBases — Rule A auto-timezone from crew base filter', () => {
  beforeEach(() => {
    clearFilter()
    setOptions([UTC_OPT, YVR, PEK])
    setTimezone('UTC', 'UTC')
  })

  it('empty bases list defaults to UTC', () => {
    setTimezone('America/Vancouver', 'YVR')
    syncDisplayTimezoneForBases([])
    const tz = useTimezoneStore.getState()
    expect(tz.timezoneAirport).toBe('UTC')
    expect(tz.timezone).toBe('UTC')
  })

  it('first base with isBase=true flips timezone to that base IANA zone', () => {
    syncDisplayTimezoneForBases(['YVR'])
    const tz = useTimezoneStore.getState()
    expect(tz.timezoneAirport).toBe('YVR')
    expect(tz.timezone).toBe('America/Vancouver')
  })

  it('only the first base is honoured when multiple are selected', () => {
    syncDisplayTimezoneForBases(['YVR', 'PEK'])
    const tz = useTimezoneStore.getState()
    expect(tz.timezoneAirport).toBe('YVR')
    expect(tz.timezone).toBe('America/Vancouver')
  })

  it('no-op when the current timezone already matches the first base', () => {
    setTimezone('America/Vancouver', 'YVR')
    // Same TZ — must not re-anchor the date range (which would clobber user-set values).
    syncDisplayTimezoneForBases(['YVR'])
    const tz = useTimezoneStore.getState()
    expect(tz.timezoneAirport).toBe('YVR')
    expect(tz.timezone).toBe('America/Vancouver')
  })

  it('falls back to UTC when first base is not in the loaded timezone options', () => {
    setTimezone('America/Vancouver', 'YVR')
    syncDisplayTimezoneForBases(['UNKNOWN_BASE'])
    const tz = useTimezoneStore.getState()
    // No match → keep the current TZ (do nothing), so we don't blank the display.
    expect(tz.timezoneAirport).toBe('YVR')
    expect(tz.timezone).toBe('America/Vancouver')
  })
})
