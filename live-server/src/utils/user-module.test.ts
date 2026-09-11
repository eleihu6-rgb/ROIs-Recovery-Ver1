import { describe, it, expect } from 'vitest'
import { formatUserModule, stampCreatedUpdated } from './user-module.js'

describe('formatUserModule', () => {
  it('stamps user(module) when both are provided', () => {
    expect(formatUserModule('tiao', 'legality_recheck')).toBe('tiao(legality_recheck)')
  })

  it('falls back to system when user is empty/null/undefined', () => {
    expect(formatUserModule('', 'legality_recheck')).toBe('system(legality_recheck)')
    expect(formatUserModule(null, 'legality_recheck')).toBe('system(legality_recheck)')
    expect(formatUserModule(undefined, 'legality_recheck')).toBe('system(legality_recheck)')
  })

  it('falls back to "unknown" when module is empty', () => {
    expect(formatUserModule('tiao', '')).toBe('tiao(unknown)')
  })

  it('truncates user (with ellipsis) to keep module intact within 50 chars', () => {
    const veryLong = 'x'.repeat(80)
    const out = formatUserModule(veryLong, 'legality_recheck')
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out).toContain('…')
    expect(out.endsWith('(legality_recheck)')).toBe(true)
  })
})

describe('stampCreatedUpdated', () => {
  it('returns identical created/updated strings', () => {
    const { createdBy, updatedBy } = stampCreatedUpdated('tiao', 'persist_7501')
    expect(createdBy).toBe('tiao(persist_7501)')
    expect(updatedBy).toBe('tiao(persist_7501)')
  })
})
