import { describe, expect, it } from 'vitest'
import { deriveCompositionCardCoverage } from '../derive-composition-card-coverage'

describe('deriveCompositionCardCoverage', () => {
  it('returns full when actual meets or exceeds plan', () => {
    expect(deriveCompositionCardCoverage(1, 1)).toBe('full')
    expect(deriveCompositionCardCoverage(2, 1)).toBe('full')
  })

  it('returns partial when some assignees but under plan', () => {
    expect(deriveCompositionCardCoverage(1, 3)).toBe('partial')
  })

  it('returns empty when plan > 0 and no assignees', () => {
    expect(deriveCompositionCardCoverage(0, 3)).toBe('empty')
  })

  it('returns null when plan is 0', () => {
    expect(deriveCompositionCardCoverage(0, 0)).toBeNull()
    expect(deriveCompositionCardCoverage(1, 0)).toBeNull()
  })
})
