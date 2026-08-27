import { describe, expect, it } from 'vitest'
import {
  importProgressChannel,
  importProgressHistoryKey,
  importProgressStateKey,
} from '../../types/import-progress.js'

describe('import progress keys', () => {
  it('builds stable channel and state keys', () => {
    expect(importProgressChannel('abc')).toBe('import:progress:abc')
    expect(importProgressStateKey('abc')).toBe('import:state:abc')
    expect(importProgressHistoryKey('abc')).toBe('import:history:abc')
  })
})
