import { describe, it, expect, vi, beforeEach } from 'vitest'
import { register } from 'prom-client'
import type { Pool } from 'pg'

// env.ts requires DATABASE_URL at module-eval time; legality-recheck imports env transitively.
vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

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

import { spawn } from 'node:child_process'
import { affectedRuleCodes, spawnLiveRecheck, recheckLiveRosterMutation } from '../../../services/rule/legality-recheck.js'

/** Read a single labeled value from a prom-client metric (0 if absent). */
const metricVal = async (name: string, labels: Record<string, string>): Promise<number> => {
  const m = register.getSingleMetric(name)
  if (!m) return 0
  const { values } = await (m as unknown as { get: () => Promise<{ values: Array<{ labels: Record<string, string>; value: number }> }> }).get()
  const found = values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
  return found?.value ?? 0
}

const createFastify = () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('computing'),
    publish: vi.fn().mockResolvedValue(1),
  },
  log: { error: vi.fn(), warn: vi.fn() },
} as any)

const GROUP = 'pbs_solver_ruleset'

describe('spawnLiveRecheck observability', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
  })

  it('records started metric + writes computing meta (ruleCodes, ruleCount, rangeDays) on spawn', async () => {
    const fastify = createFastify()
    const startedBefore = await metricVal('rois_live_server_legality_recheck_total', { group: GROUP, status: 'started' })

    spawnLiveRecheck(fastify, GROUP, '2026-06-01', '2026-06-30', ['8002'])
    await new Promise((r) => setImmediate(r))

    expect(spawn).toHaveBeenCalledOnce()
    expect(await metricVal('rois_live_server_legality_recheck_total', { group: GROUP, status: 'started' })).toBe(startedBefore + 1)

    // Status meta goes to the :meta key — NOT the string :status key the child/backstop own.
    const metaCall = fastify.redis.set.mock.calls.find((c: unknown[]) => String(c[0]).endsWith(`:${GROUP}:meta`))
    expect(metaCall).toBeTruthy()
    const meta = JSON.parse(metaCall![1] as string)
    expect(meta).toMatchObject({ status: 'computing', ruleCodes: ['8002'], ruleCount: 1, rangeDays: 29, finishedAt: null })
    expect(meta.startedAt).toBeTruthy()
    // Parent also marks :status computing so draft-Save clients can poll computing→done.
    const statusCall = fastify.redis.set.mock.calls.find(
      (c: unknown[]) => String(c[0]).endsWith(`:${GROUP}:status`) && c[1] === 'computing',
    )
    expect(statusCall).toBeTruthy()
  })

  it('on zero exit: records duration + done meta, and does NOT flip the string status key', async () => {
    const fastify = createFastify()
    spawnLiveRecheck(fastify, GROUP, '2026-06-01', '2026-06-30', null) // whole-group recheck
    await new Promise((r) => setImmediate(r))
    fastify.redis.set.mockClear()
    fastify.redis.publish = vi.fn().mockResolvedValue(1)
    const doneBefore = await metricVal('rois_live_server_legality_recheck_total', { group: GROUP, status: 'done' })

    handlers.exit!(0)
    await new Promise((r) => setImmediate(r))

    expect(await metricVal('rois_live_server_legality_recheck_total', { group: GROUP, status: 'done' })).toBe(doneBefore + 1)
    const metaCall = fastify.redis.set.mock.calls.find((c: unknown[]) => String(c[0]).endsWith(':meta'))
    const meta = JSON.parse(metaCall![1] as string)
    expect(meta.status).toBe('done')
    expect(meta.finishedAt).toBeTruthy()
    expect(typeof meta.durationSec).toBe('number')
    expect(meta.ruleCodes).toBeNull() // whole-group → no scoped codes
    expect(meta.ruleCount).toBe(0)
    // Success must never write 'failed' to the string status key.
    const failedStatusWrite = fastify.redis.set.mock.calls.find((c: unknown[]) => String(c[0]).endsWith(':status') && c[1] === 'failed')
    expect(failedStatusWrite).toBeUndefined()
    expect(fastify.redis.publish).toHaveBeenCalledWith(
      expect.stringMatching(/^violations:.+:pbs_solver_ruleset$/),
      expect.any(String),
    )
  })

  it('on non-zero exit: keeps the backstop — flips a stuck computing status key to failed', async () => {
    const fastify = createFastify()
    fastify.redis.get.mockResolvedValue('computing')
    spawnLiveRecheck(fastify, GROUP, '2026-06-01', '2026-06-30', ['8002'])
    await new Promise((r) => setImmediate(r))

    handlers.exit!(1)
    await new Promise((r) => setImmediate(r))

    const failedStatusWrite = fastify.redis.set.mock.calls.find((c: unknown[]) => String(c[0]).endsWith(`:${GROUP}:status`) && c[1] === 'failed')
    expect(failedStatusWrite).toBeTruthy()
    expect(await metricVal('rois_live_server_legality_recheck_total', { group: GROUP, status: 'failed' })).toBeGreaterThan(0)
  })
})

describe('affectedRuleCodes', () => {
  it('scopes Rule 7509 parameter edits to the 7509 engine', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ function: 7509 }] })),
    } as unknown as Pick<Pool, 'query'>

    await expect(affectedRuleCodes(pool, 7509001)).resolves.toEqual(['7509'])
  })
})

describe('recheckLiveRosterMutation window', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
  })

  it('pads −31 / +31 load days and passes the unpadded mutation focus', async () => {
    const fastify = {
      redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
      log: { error: vi.fn() },
      pgPool: { query: vi.fn((sql: string) => String(sql).includes('where id = $1')
        ? Promise.resolve({ rows: [{ id: 103 }] })
        : Promise.resolve({ rows: [] })) },
    } as any

    await recheckLiveRosterMutation(fastify, 103, ['2026-09-26T20:20:00.000Z'], ['2438'])
    await new Promise((r) => setImmediate(r))

    expect(spawn).toHaveBeenCalledOnce()
    const args = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[]
    const fromIdx = args.indexOf('--from')
    const toIdx = args.indexOf('--to')
    expect(args[fromIdx + 1]).toBe('2026-08-26')
    expect(args[toIdx + 1]).toBe('2026-10-27')
    expect(args[args.indexOf('--group') + 1]).toBe('103')
    expect(args[args.indexOf('--focus-start-secs') + 1]).toBe(String(Date.parse('2026-09-26T20:20:00.000Z') / 1000))
    expect(args[args.indexOf('--focus-end-secs') + 1]).toBe(String(Date.parse('2026-09-26T20:20:00.000Z') / 1000 + 1))
    expect(args[args.indexOf('--focus-crew-ids') + 1]).toBe('2438')
  })

  it('derives focus bounds from the earliest and latest mutation timestamps', async () => {
    const fastify = {
      redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
      log: { error: vi.fn() },
      pgPool: { query: vi.fn((sql: string) => String(sql).includes('where id = $1')
        ? Promise.resolve({ rows: [{ id: 103 }] })
        : Promise.resolve({ rows: [] })) },
    } as any

    await recheckLiveRosterMutation(fastify, 103, [
      '2026-09-27T04:15:30.900Z',
      '2026-09-26T20:20:00.500Z',
    ], ['A', 'B'])
    await new Promise((r) => setImmediate(r))

    const args = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[]
    expect(args[args.indexOf('--focus-start-secs') + 1]).toBe(String(Math.floor(Date.parse('2026-09-26T20:20:00.500Z') / 1000)))
    expect(args[args.indexOf('--focus-end-secs') + 1]).toBe(String(Math.floor(Date.parse('2026-09-27T04:15:30.900Z') / 1000)))
    expect(args[args.indexOf('--focus-crew-ids') + 1]).toBe('A,B')
  })

  it('omits mutation focus when affected crew ids are unknown', async () => {
    const fastify = {
      redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
      log: { error: vi.fn() },
      pgPool: { query: vi.fn((sql: string) => String(sql).includes('where id = $1')
        ? Promise.resolve({ rows: [{ id: 103 }] })
        : Promise.resolve({ rows: [] })) },
    } as any

    await recheckLiveRosterMutation(fastify, 103, ['2026-09-26T20:20:00.000Z'])
    await new Promise((r) => setImmediate(r))

    const args = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[]
    expect(args).not.toContain('--focus-start-secs')
    expect(args).not.toContain('--focus-end-secs')
    expect(args).not.toContain('--focus-crew-ids')
  })

  it('filters enabled LIVE worksets by the affected crews\' division (P-only crew → only P workset)', async () => {
    const fastify = {
      redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
      log: { error: vi.fn() },
      pgPool: { query: vi.fn((sql: string) => {
        if (String(sql).includes('distinct division from crew')) {
          return Promise.resolve({ rows: [{ division: 'P' }] })
        }
        if (String(sql).includes('division = any')) {
          return Promise.resolve({ rows: [{ id: 103 }] })
        }
        if (String(sql).includes('SELECT division FROM workset')) {
          return Promise.resolve({ rows: [{ division: 'P' }] })
        }
        return Promise.resolve({ rows: [] })
      }) },
    } as any

    await recheckLiveRosterMutation(fastify, undefined, ['2026-09-26T20:20:00.000Z'], ['2438'])
    await new Promise((r) => setImmediate(r))

    expect(spawn).toHaveBeenCalledOnce()
    const args = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[]
    expect(args[args.indexOf('--group') + 1]).toBe('103')
    expect(args[args.indexOf('--division') + 1]).toBe('P')
  })

  it('falls back to all enabled LIVE worksets when crews have no resolvable division', async () => {
    const fastify = {
      redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
      log: { error: vi.fn() },
      pgPool: { query: vi.fn((sql: string) => {
        if (String(sql).includes('distinct division from crew')) {
          return Promise.resolve({ rows: [] })
        }
        if (String(sql).includes('enabled = true')) {
          return Promise.resolve({ rows: [{ id: 103 }, { id: 637 }] })
        }
        return Promise.resolve({ rows: [] })
      }) },
    } as any

    await recheckLiveRosterMutation(fastify, undefined, ['2026-09-26T20:20:00.000Z'], ['2438'])
    await new Promise((r) => setImmediate(r))

    expect(spawn).toHaveBeenCalledTimes(2)
  })
})
