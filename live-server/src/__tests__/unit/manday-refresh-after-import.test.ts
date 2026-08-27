import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

const recomputeMock = vi.hoisted(() => vi.fn())

vi.mock('../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8',
  },
}))

vi.mock('../../services/manday/manday-tool.js', () => ({
  recompute: recomputeMock,
}))

describe('refreshMandayAfterImport', () => {
  beforeEach(() => {
    recomputeMock.mockReset()
  })

  it('awaits manday recompute and logs the refresh result', async () => {
    recomputeMock.mockResolvedValue({ crews: 4, daily: 10, monthly: 3, yearly: 2 })
    const logInfo = vi.fn()
    const fastify = {
      pgPool: { label: 'pool' },
      log: { info: logInfo },
    } as unknown as FastifyInstance

    const { refreshMandayAfterImport } = await import('../../workers/manday-refresh-after-import.js')

    await refreshMandayAfterImport(fastify, {
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      updatedBy: 'ROSTER_IMPORT',
      logMessage: 'manday recompute after roster import completed',
    })

    expect(recomputeMock).toHaveBeenCalledWith(
      fastify.pgPool,
      {
        schema: 'f8',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        updatedBy: 'ROSTER_IMPORT',
      },
    )
    expect(logInfo).toHaveBeenCalledWith(
      {
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        crews: 4,
        daily: 10,
        monthly: 3,
        yearly: 2,
      },
      'manday recompute after roster import completed',
    )
  })

  it('propagates manday recompute failures so the import job fails', async () => {
    const error = new Error('ruletool missing')
    recomputeMock.mockRejectedValue(error)
    const fastify = {
      pgPool: { label: 'pool' },
      log: { info: vi.fn() },
    } as unknown as FastifyInstance

    const { refreshMandayAfterImport } = await import('../../workers/manday-refresh-after-import.js')

    await expect(refreshMandayAfterImport(fastify, {
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      updatedBy: 'ROSTER_IMPORT',
      logMessage: 'manday recompute after roster import completed',
    })).rejects.toThrow('ruletool missing')
  })
})
