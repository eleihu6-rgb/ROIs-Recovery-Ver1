import { describe, expect, it } from 'vitest'
import { getFilterStore } from '@/stores/filter-store'
import { resolveFilterStore } from '../filter-dialog'

describe('FilterDialog contextId store resolution', () => {
  it('defaults to the live store and isolates per context', () => {
    expect(resolveFilterStore('live')).toBe(getFilterStore('live'))
    expect(resolveFilterStore(6)).toBe(getFilterStore(6))
    expect(resolveFilterStore(6)).not.toBe(getFilterStore('live'))
  })
})
