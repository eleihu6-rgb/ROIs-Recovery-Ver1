import 'dotenv/config'
import { describe, it, expect } from 'vitest'
import { normalizeRosterSource } from '../../routes/scenario/scenario.js'

describe('normalizeRosterSource', () => {
  it('passes IMP through without masking to CR', () => {
    expect(normalizeRosterSource('IMP')).toBe('IMP')
  })

  it('passes PA through verbatim', () => {
    expect(normalizeRosterSource('PA')).toBe('PA')
  })

  it('passes MA through verbatim', () => {
    expect(normalizeRosterSource('MA')).toBe('MA')
  })

  it('passes CR through verbatim', () => {
    expect(normalizeRosterSource('CR')).toBe('CR')
  })

  it('maps unknown values to CR', () => {
    expect(normalizeRosterSource('UNKNOWN')).toBe('CR')
    expect(normalizeRosterSource(null)).toBe('CR')
    expect(normalizeRosterSource(undefined)).toBe('CR')
    expect(normalizeRosterSource('')).toBe('CR')
  })
})
