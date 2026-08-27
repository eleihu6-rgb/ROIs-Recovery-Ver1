import { describe, it, expect } from 'vitest'
import { batchProgresses } from '../batch-progress'

describe('batchProgresses', () => {
  it('returns 0..100 per completed batch', () => {
    expect(batchProgresses(4, 817)).toEqual([25, 50, 75, 100])
    expect(batchProgresses(1, 817)).toEqual([100])
  })
  it('empty crew list -> empty array (no batches)', () => {
    expect(batchProgresses(4, 0)).toEqual([])
  })
})
