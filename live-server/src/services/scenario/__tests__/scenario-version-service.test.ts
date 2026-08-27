import { describe, expect, it } from 'vitest'
import {
  compareVersionsDesc,
  isCurrentVersion,
  nextScenarioVersion,
  normalizeScenarioVersions,
} from '../scenario-version-service.js'

describe('scenario version service', () => {
  it('starts the first run at v0', () => {
    expect(nextScenarioVersion([])).toBe('v0')
  })

  it('allocates the next version after the highest existing number', () => {
    const versions = normalizeScenarioVersions([
      { version: 'v0' },
      { version: 'v2' },
    ])
    expect(nextScenarioVersion(versions)).toBe('v3')
  })

  it('does not reuse a deleted version gap', () => {
    const versions = normalizeScenarioVersions([{ version: 'v0' }, { version: 'v3' }])
    expect(nextScenarioVersion(versions)).toBe('v4')
  })

  it('sorts versions newest first and marks the current pointer', () => {
    const versions = normalizeScenarioVersions([
      { version: 'v0', taskId: 'task-0' },
      { version: 'v2', taskId: 'task-2' },
      { version: 'v1', checksum: 'checksum-1' },
    ])
    expect(versions.sort(compareVersionsDesc).map((item) => item.version)).toEqual(['v2', 'v1', 'v0'])
    expect(isCurrentVersion(versions[0], { taskId: 'task-2', checksum: null })).toBe(true)
    expect(isCurrentVersion(versions[1], { taskId: null, checksum: 'checksum-1' })).toBe(true)
    expect(isCurrentVersion(versions[2], { taskId: 'other', checksum: 'other' })).toBe(false)
  })
})
