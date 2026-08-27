import { describe, it, expect } from 'vitest'
import { formatSeniority } from '@/utils/format-seniority'

describe('formatSeniority', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(formatSeniority(null)).toBe('')
    expect(formatSeniority(undefined)).toBe('')
    expect(formatSeniority('')).toBe('')
  })

  it('strips a trailing .00 (whole numbers display without decimals)', () => {
    expect(formatSeniority('1234.00')).toBe('1234')
    expect(formatSeniority('5.00')).toBe('5')
  })

  it('preserves a meaningful fractional part', () => {
    expect(formatSeniority('12.50')).toBe('12.50')
    expect(formatSeniority('12.5')).toBe('12.5')
  })

  it('passes through plain integer strings unchanged', () => {
    expect(formatSeniority('42')).toBe('42')
  })
})
