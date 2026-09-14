import { describe, expect, it } from 'vitest'

import { chunkRecoveryCostInputs, RECOVERY_COST_BATCH_LIMIT } from '@/services/recovery-api'

/**
 * Regression: /api/recovery/calculate-cost/batch rejects more than 128 inputs
 * with HTTP 400. Before chunking, a Live roster with many alerts sent one big
 * batch, the request failed, and every recovery candidate rendered "Unpriced"
 * even though the cost library had prices configured.
 */
describe('chunkRecoveryCostInputs', () => {
  const input = (n: number): number => n

  it('matches the live-server batch cap', () => {
    expect(RECOVERY_COST_BATCH_LIMIT).toBe(128)
  })

  it('returns no chunks for an empty input list', () => {
    expect(chunkRecoveryCostInputs([])).toEqual([])
  })

  it('keeps a full-size batch in one chunk', () => {
    const inputs = Array.from({ length: RECOVERY_COST_BATCH_LIMIT }, (_, i) => input(i))
    const chunks = chunkRecoveryCostInputs(inputs)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(RECOVERY_COST_BATCH_LIMIT)
  })

  it('splits an over-limit batch and preserves input order across chunks', () => {
    const inputs = Array.from({ length: RECOVERY_COST_BATCH_LIMIT + 1 }, (_, i) => input(i))
    const chunks = chunkRecoveryCostInputs(inputs)
    expect(chunks.map((c) => c.length)).toEqual([RECOVERY_COST_BATCH_LIMIT, 1])
    expect(chunks.flat()).toEqual(inputs)
    expect(chunks.every((c) => c.length <= RECOVERY_COST_BATCH_LIMIT)).toBe(true)
  })

  it('rejects a non-positive chunk size', () => {
    expect(() => chunkRecoveryCostInputs([1], 0)).toThrow(/positive integer/)
  })
})
