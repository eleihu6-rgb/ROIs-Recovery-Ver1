import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the child's event handlers so tests can drive 'exit' without a real process.
const handlers: Record<string, (arg?: unknown) => void> = {}
const fakeChild = {
  on: vi.fn((evt: string, cb: (arg?: unknown) => void) => {
    handlers[evt] = cb
    return fakeChild
  }),
  unref: vi.fn(),
}
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => fakeChild) }))
vi.mock('../../../config/index.js', () => ({
  env: { LIVE_SCHEMA: 'f8', SCENARIO_SCHEMA: 'scenario' },
}))

import { ensureLegality, forceRecompute } from '../../../services/scenario/legality-status.js'

const createFastify = () => ({
  pgPool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  log: { error: vi.fn() },
} as any)

describe('spawnCompute exit backstop (regression: scenario legality stuck at COMPUTING forever)', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
  })

  it('on zero exit: does not touch legality_status (the script itself already wrote READY)', async () => {
    const fastify = createFastify()
    await forceRecompute(fastify, 623)
    fastify.pgPool.query.mockClear()

    handlers.exit!(0)
    await new Promise((r) => setImmediate(r))

    expect(fastify.pgPool.query).not.toHaveBeenCalled()
  })

  it('on non-zero exit: flips a stuck COMPUTING row to FAILED with an error_text instead of leaving it forever', async () => {
    const fastify = createFastify()
    await forceRecompute(fastify, 623)
    fastify.pgPool.query.mockClear()

    handlers.exit!(1)
    await new Promise((r) => setImmediate(r))

    expect(fastify.pgPool.query).toHaveBeenCalledTimes(1)
    const [sql, params] = fastify.pgPool.query.mock.calls[0]
    expect(sql).toMatch(/status='FAILED'/)
    expect(sql).toMatch(/where scenario_id=\$1 and status='COMPUTING'/)
    expect(params[0]).toBe(623)
    expect(params[1]).toMatch(/exited with code 1/)
  })

  it('on DB write failure inside the backstop itself: logs but does not throw (fire-and-forget)', async () => {
    const fastify = createFastify()
    await forceRecompute(fastify, 623)
    fastify.pgPool.query.mockClear()
    fastify.pgPool.query.mockRejectedValueOnce(new Error('connection lost'))

    expect(() => handlers.exit!(1)).not.toThrow()
    await new Promise((r) => setImmediate(r))

    expect(fastify.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: 623 }),
      'failed to flip legality_status to FAILED',
    )
  })
})

describe('ensureLegality seed freshness', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
  })

  it('does not serve an old READY version-0 result for a seed RO DRAFT scenario', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [], rowCount: 0 }
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 }
        if (sql.includes('insert into')) return { rows: [], rowCount: 0 }
        if (sql.includes('select status')) {
          return {
            rows: [{
              status: 'READY',
              computed_version: 0,
              roster_version: 0,
              params_stale: false,
              computed_at: new Date('2026-07-17T12:29:09.000Z'),
              error_text: null,
            }],
            rowCount: 1,
          }
        }
        if (sql.includes('update')) return { rows: [{ scenario_id: 672 }], rowCount: 1 }
        return { rows: [], rowCount: 0 }
      }),
      release: vi.fn(),
    }
    const fastify = {
      pgPool: {
        query: vi.fn(async () => ({ rows: [{ ruleset_id: 700, status: 'DRAFT', file_type: 'RO' }] })),
        connect: vi.fn(async () => client),
      },
      log: { error: vi.fn() },
    } as any

    const result = await ensureLegality(fastify, 672)

    expect(result.state).toBe('COMPUTING')
  })
})
