import { describe, expect, it } from 'vitest'

import { isScenarioNotFoundError } from '../scenario-error-routing'

describe('isScenarioNotFoundError', () => {
  it.each([
    'Scenario not found',
    'scenario not found',
    'Error: Scenario not found',
  ])('returns true for missing scenario message "%s"', (message) => {
    expect(isScenarioNotFoundError(message)).toBe(true)
  })

  it.each([
    null,
    undefined,
    '',
    'Scenario 577 fixture intentionally absent',
    'Failed to fetch scenario gantt data',
    'Internal server error',
  ])('returns false for non-missing-scenario message "%s"', (message) => {
    expect(isScenarioNotFoundError(message)).toBe(false)
  })
})
