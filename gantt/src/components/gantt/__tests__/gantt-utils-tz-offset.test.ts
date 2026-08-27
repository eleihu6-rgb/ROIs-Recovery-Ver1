import { describe, expect, it } from 'vitest'

import { formatUtcOffset, parseUtcOffsetMinutes } from '../gantt-utils'

describe('parseUtcOffsetMinutes', () => {
  it('parses west-of-UTC offsets to negative minutes', () => {
    expect(parseUtcOffsetMinutes('UTC-240')).toBe(-240)
    expect(parseUtcOffsetMinutes('UTC-360')).toBe(-360)
    expect(parseUtcOffsetMinutes('UTC-420')).toBe(-420)
  })

  it('parses east-of-UTC and zero offsets', () => {
    expect(parseUtcOffsetMinutes('UTC+480')).toBe(480)
    expect(parseUtcOffsetMinutes('UTC+0')).toBe(0)
  })
})

describe('formatUtcOffset', () => {
  it('renders H:MM clock offset without the UTC prefix', () => {
    expect(formatUtcOffset('UTC-240')).toBe('-4:00')
    expect(formatUtcOffset('UTC-360')).toBe('-6:00')
    expect(formatUtcOffset('UTC-420')).toBe('-7:00')
    expect(formatUtcOffset('UTC+480')).toBe('+8:00')
    expect(formatUtcOffset('UTC+330')).toBe('+5:30')
  })

  it('renders nothing for UTC itself', () => {
    expect(formatUtcOffset('UTC+0')).toBe('')
  })

  it('falls back to the raw string when unparsable', () => {
    expect(formatUtcOffset('nonsense')).toBe('nonsense')
  })
})
