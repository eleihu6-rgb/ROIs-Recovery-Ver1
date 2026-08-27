import { describe, expect, it } from 'vitest'
import { createContextStoreRegistry, type GanttContextId } from '../create-context-store'

describe('createContextStoreRegistry', () => {
  it('returns the same instance for the same contextId', () => {
    let calls = 0
    const reg = createContextStoreRegistry((id: GanttContextId) => ({ id, n: calls++ }))
    expect(reg.get('live')).toBe(reg.get('live'))
    expect(reg.get(6)).toBe(reg.get(6))
  })

  it('returns distinct instances per contextId', () => {
    const reg = createContextStoreRegistry((id: GanttContextId) => ({ id }))
    expect(reg.get('live')).not.toBe(reg.get(6))
    expect(reg.get(6)).not.toBe(reg.get(460))
  })

  it('recreates after destroy', () => {
    const reg = createContextStoreRegistry((id: GanttContextId) => ({ id }))
    const first = reg.get(6)
    reg.destroy(6)
    expect(reg.get(6)).not.toBe(first)
  })
})
