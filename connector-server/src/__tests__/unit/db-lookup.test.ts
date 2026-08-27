import { describe, it, expect, vi } from 'vitest'

describe('loadCrewSet', () => {
  it('returns a Set of crew_id strings from DB result', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ crew_id: 'C001' }, { crew_id: 'C002' }],
      }),
    }

    const { loadCrewSet } = await import('../../utils/db-lookup.js')
    const result = await loadCrewSet(mockDb as never)

    expect(result).toBeInstanceOf(Set)
    expect(result.has('C001')).toBe(true)
    expect(result.has('C002')).toBe(true)
    expect(result.size).toBe(2)
  })

  it('returns empty Set when no crew in DB', async () => {
    const mockDb = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
    const { loadCrewSet } = await import('../../utils/db-lookup.js')
    const result = await loadCrewSet(mockDb as never)
    expect(result.size).toBe(0)
  })
})
