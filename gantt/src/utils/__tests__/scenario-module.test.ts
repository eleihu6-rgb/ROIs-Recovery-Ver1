import { describe, expect, it } from 'vitest'
import { parseScenarioModuleKey, scenarioTabLabel } from '../scenario-module'

describe('parseScenarioModuleKey', () => {
  it('parses a plain scenario module key', () => {
    expect(parseScenarioModuleKey('scenario-gantt:596')).toEqual({ id: 596, version: undefined })
  })

  it('parses a versioned scenario module key', () => {
    expect(parseScenarioModuleKey('scenario-gantt:596@v1')).toEqual({ id: 596, version: 'v1' })
  })

  it('keeps the full version string including the v prefix', () => {
    expect(parseScenarioModuleKey('scenario-gantt:7@v10')).toEqual({ id: 7, version: 'v10' })
  })
})

describe('scenarioTabLabel', () => {
  it('prefixes the version before the scenario id', () => {
    expect(scenarioTabLabel(123, 'Alpha', 'v1')).toBe('v1 #123 Alpha')
  })

  it('keeps the current-scenario label unchanged when no version', () => {
    expect(scenarioTabLabel(123, 'Alpha')).toBe('#123 Alpha')
  })

  it('renders a version-aware fallback when the name is not yet loaded', () => {
    expect(scenarioTabLabel(123, '', 'v2')).toBe('v2 #123')
    expect(scenarioTabLabel(123, '')).toBe('#123')
  })
})
