import { describe, it, expect } from 'vitest'
import { isFresh, type LegalityStatusRow } from '../../../services/scenario/legality-freshness.js'

const row = (p: Partial<LegalityStatusRow>): LegalityStatusRow => ({
  status: 'READY',
  computed_version: 5,
  roster_version: 5,
  ...p,
})

describe('scenario legality freshness', () => {
  it('is fresh only when READY and versions match', () => {
    expect(isFresh(row({}))).toBe(true)
  })

  it('is stale when the roster moved past the computed version', () => {
    expect(isFresh(row({ computed_version: 4, roster_version: 5 }))).toBe(false)
  })

  it('is not fresh while COMPUTING even if versions match', () => {
    expect(isFresh(row({ status: 'COMPUTING' }))).toBe(false)
  })

  it('is not fresh when explicitly STALE', () => {
    expect(isFresh(row({ status: 'STALE' }))).toBe(false)
  })

  it('is not fresh on PENDING (never computed: computed_version -1)', () => {
    expect(isFresh(row({ status: 'PENDING', computed_version: -1, roster_version: 0 }))).toBe(false)
  })

  it('is not fresh on FAILED', () => {
    expect(isFresh(row({ status: 'FAILED' }))).toBe(false)
  })
})
