import { describe, expect, it } from 'vitest'
import { assertCommentsNamespaceAvailable } from '../roster-service.js'

describe('roster comments namespace', () => {
  it('rejects manual use of the reserved PBS Award namespace', () => {
    expect(() => assertCommentsNamespaceAvailable('PBS_AWARD_V1|anything')).toThrowError(
      'Comments cannot use the reserved PBS_AWARD_ prefix.',
    )

    try {
      assertCommentsNamespaceAvailable('PBS_AWARD_V1|anything')
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400 })
    }
  })

  it('allows ordinary comments and empty values', () => {
    expect(() => assertCommentsNamespaceAvailable('Planner note')).not.toThrow()
    expect(() => assertCommentsNamespaceAvailable(null)).not.toThrow()
    expect(() => assertCommentsNamespaceAvailable(undefined)).not.toThrow()
  })
})
