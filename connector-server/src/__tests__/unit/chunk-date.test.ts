import { describe, it, expect } from 'vitest'
import { chunkDateRange, fetchWithChunkRetry } from '../../utils/chunk-date.js'

describe('chunkDateRange', () => {
  it('returns single chunk when range <= chunkDays', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-01-05', 10)
    expect(chunks).toEqual([{ startDt: '2026-01-01', endDt: '2026-01-05' }])
  })

  it('splits into multiple chunks', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-01-25', 10)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({ startDt: '2026-01-01', endDt: '2026-01-10' })
    expect(chunks[1]).toEqual({ startDt: '2026-01-11', endDt: '2026-01-20' })
    expect(chunks[2]).toEqual({ startDt: '2026-01-21', endDt: '2026-01-25' })
  })

  it('handles exact boundary', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-01-10', 10)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ startDt: '2026-01-01', endDt: '2026-01-10' })
  })

  it('splits a successful capped response into smaller date chunks', async () => {
    const fn = async (startDt: string, endDt: string) => {
      if (startDt === '2026-01-01' && endDt === '2026-01-10') {
        return Array.from({ length: 1000 }, (_, index) => ({ index }))
      }
      return [{ startDt, endDt }]
    }

    const rows = await fetchWithChunkRetry(fn, '2026-01-01', '2026-01-10', 10, {
      maxRowsPerResponse: 1000,
      splitOnCap: true,
      failOnSingleDayCap: true,
    })

    expect(rows).toEqual([
      { startDt: '2026-01-01', endDt: '2026-01-05' },
      { startDt: '2026-01-06', endDt: '2026-01-10' },
    ])
  })

  it('fails instead of silently accepting a capped single-day response', async () => {
    const fn = async () => Array.from({ length: 1000 }, (_, index) => ({ index }))

    await expect(fetchWithChunkRetry(fn, '2026-01-01', '2026-01-01', 1, {
      maxRowsPerResponse: 1000,
      splitOnCap: true,
      failOnSingleDayCap: true,
    })).rejects.toThrow('refusing to silently truncate')
  })

  it('can fail instead of skipping a repeatedly failing single-day response', async () => {
    const fn = async () => {
      throw new Error('upstream timeout')
    }

    await expect(fetchWithChunkRetry(fn, '2026-01-01', '2026-01-01', 1, {
      failOnRepeatedFailure: true,
    })).rejects.toThrow('failed after repeated retries: upstream timeout')
  })

  it('retries a single-day transient failure before failing the fetch stage', async () => {
    let calls = 0
    const fn = async (startDt: string, endDt: string) => {
      calls += 1
      if (calls < 3) throw new Error('temporary timeout')
      return [{ startDt, endDt }]
    }

    const rows = await fetchWithChunkRetry(fn, '2026-01-01', '2026-01-01', 1, {
      failOnRepeatedFailure: true,
      singleDayRetryAttempts: 3,
      singleDayRetryDelayMs: 1,
      singleDayRetryMaxDelayMs: 1,
    })

    expect(calls).toBe(3)
    expect(rows).toEqual([{ startDt: '2026-01-01', endDt: '2026-01-01' }])
  })
})
