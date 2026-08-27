import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processRosterRetentionCleanup } from './roster-retention-cleanup-worker.js'

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    BULLMQ_REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    ROSTER_SOFT_DELETE_RETENTION_MONTHS: 1,
    ROSTER_SOFT_DELETE_CLEANUP_BATCH_SIZE: 1000,
  },
}))

describe('roster retention cleanup worker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when another instance holds the cleanup lock', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ acquired: false }] })
        .mockResolvedValue({ rowCount: 0, rows: [] }),
      release: vi.fn(),
    }
    const fastify = {
      pgPool: { connect: vi.fn().mockResolvedValue(client) },
      log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    }

    const result = await processRosterRetentionCleanup(fastify as never)

    expect(result.skipped).toBe(true)
    expect(client.query).toHaveBeenCalledTimes(4)
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('cleans tables in dependency order using one-month retention and bounded batches', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        .mockResolvedValue({ rowCount: 0, rows: [] }),
      release: vi.fn(),
    }
    const fastify = {
      pgPool: { connect: vi.fn().mockResolvedValue(client) },
      log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    }

    const result = await processRosterRetentionCleanup(fastify as never)

    expect(result).toEqual({
      skipped: false,
      deleted: {
        rosterFlight: 0,
        pairingComposition: 0,
        pairingSegment: 0,
        pairingMemo: 0,
        pairing: 0,
        flightComposition: 0,
        flight: 0,
      },
    })
    const deleteQueries = client.query.mock.calls
      .map(([query]) => String(query))
      .filter((query) => query.includes('with candidates'))
    expect(deleteQueries).toHaveLength(7)
    expect(deleteQueries.map((query) => query.match(/delete from "f8"\.([a-z_]+)/)?.[1])).toEqual([
      'roster_flight',
      'pairing_composition',
      'pairing_segment',
      'pairing_memo',
      'pairing',
      'flight_composition',
      'flight',
    ])
    expect(deleteQueries.every((query) => query.includes("interval '1 month'") && query.includes('limit $2::int'))).toBe(true)
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_lock'), ['roster-retention-cleanup'])
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'), ['roster-retention-cleanup'])
    expect(client.release).toHaveBeenCalledTimes(1)
  })
})
