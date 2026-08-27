import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processRosterBulkDelete } from './roster-bulk-delete-worker.js'

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

const spies = vi.hoisted(() => ({
  bulkRemoveSpy: vi.fn(async () => ({
    deleted: 2,
    crewIds: ['386', '390'],
    pairingIds: [7001, 7002],
    firstSchStrDtUtc: new Date('2026-07-01T03:00:00Z'),
    lastSchStrDtUtc: new Date('2026-07-31T19:00:00Z'),
  })),
  recheckSpy: vi.fn(async (..._args: unknown[]): Promise<void> => undefined),
  recomputeNotifySpy: vi.fn(async (..._args: unknown[]) => ({ recompute: { crews: 2 }, crewIds: ['386', '390'] })),
  notifySpy: vi.fn(async (..._args: unknown[]) => ['386', '390']),
  mandayWindowSpy: vi.fn(async () => ({ startDt: '2026-06-28', endDt: '2026-08-10' } as { startDt: string; endDt: string } | null)),
  refreshPairingCompositionFillBulkSpy: vi.fn(async (..._args: unknown[]): Promise<void> => undefined),
  invalidateSpy: vi.fn(async (..._args: unknown[]): Promise<void> => undefined),
}))

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

vi.mock('../services/roster/roster-service.js', () => ({
  rosterService: {
    bulkRemove: spies.bulkRemoveSpy,
  },
}))

vi.mock('../services/rule/legality-recheck.js', () => ({
  recheckLiveRosterMutation: spies.recheckSpy,
}))

vi.mock('../services/manday/manday-mutation-window.js', () => ({
  mandayMutationWindow: spies.mandayWindowSpy,
}))

vi.mock('../services/manday/manday-operation-service.js', () => ({
  recomputeMandayAndNotify: spies.recomputeNotifySpy,
}))

vi.mock('../services/roster/roster-change-notifier.js', () => ({
  notifyRosterTasksChanged: spies.notifySpy,
}))

vi.mock('../utils/composition-fill.js', () => ({
  refreshPairingCompositionFillBulk: spies.refreshPairingCompositionFillBulkSpy,
}))

vi.mock('../utils/cache.js', () => ({
  invalidate: spies.invalidateSpy,
}))

describe('roster bulk delete worker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes, rechecks, recomputes manday, then broadcasts roster refresh', async () => {
    const updates: unknown[] = []
    const fastify = {
      pgPool: {},
      db: {},
      redis: { eval: vi.fn(async () => 1) },
      log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      wsBroadcastAll: vi.fn(),
    }
    const job = {
      data: {
        ids: [101, 102],
        pairingCrewKeys: [],
        username: 'planner',
        schema: 'f8',
        mutationLeaseToken: 'lease-token',
        rulesetId: 103,
      },
      updateProgress: vi.fn(async (progress: unknown) => updates.push(progress)),
    }

    const result = await processRosterBulkDelete(fastify as never, job as never)

    expect(result.deleted).toBe(2)
    expect(spies.bulkRemoveSpy).toHaveBeenCalledWith(fastify, [101, 102], [], 'planner')
    expect(spies.refreshPairingCompositionFillBulkSpy).toHaveBeenCalledWith(fastify.db, [7001, 7002], 'planner')
    expect(spies.invalidateSpy).toHaveBeenCalledWith(
      fastify.redis,
      'pairing:7001', 'pairing:comp:7001', 'pairing:crewids:7001', 'pairing:crewdetail:7001',
      'pairing:7002', 'pairing:comp:7002', 'pairing:crewids:7002', 'pairing:crewdetail:7002',
    )
    expect(spies.recheckSpy.mock.calls[0][3]).toEqual(['386', '390'])
    expect(spies.recomputeNotifySpy.mock.calls[0][1]).toMatchObject({
      crewIds: ['386', '390'],
      startDt: '2026-06-28',
      endDt: '2026-08-10',
      updatedBy: 'planner',
      notify: false,
    })
    expect(spies.notifySpy.mock.calls[0][1]).toEqual({ schema: 'f8', crewIds: ['386', '390'], pairingIds: [7001, 7002] })
    // Manday was recomputed into the DB; the frontend refreshes crew stats (RpCred/RpDO/RpBH)
    // on manday-updated, NOT on roster-updated — so both signals must go out.
    expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8', { type: 'manday-updated', crewIds: ['386', '390'] })
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'deleting', percent: 5 }),
      expect.objectContaining({ stage: 'rechecking', percent: 50 }),
      expect.objectContaining({ stage: 'recomputing-manday', percent: 60 }),
      expect.objectContaining({ stage: 'broadcasting', percent: 90 }),
      expect.objectContaining({ stage: 'completed', percent: 100 }),
    ]))
  })

  it('runs recheck and manday work in parallel after deletion', async () => {
    const updates: unknown[] = []
    const recheckDone = deferred<void>()
    const mandayWindowDone = deferred<{ startDt: string; endDt: string } | null>()
    const recomputeDone = deferred<{ recompute: { crews: number }; crewIds: string[] }>()
    const fastify = {
      pgPool: {},
      db: {},
      redis: { eval: vi.fn(async () => 1) },
      log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      wsBroadcastAll: vi.fn(),
    }
    const job = {
      data: {
        ids: [101, 102],
        pairingCrewKeys: [],
        username: 'planner',
        schema: 'f8',
        mutationLeaseToken: 'lease-token',
        rulesetId: 103,
      },
      updateProgress: vi.fn(async (progress: unknown) => updates.push(progress)),
    }

    spies.bulkRemoveSpy.mockResolvedValueOnce({
      deleted: 2,
      crewIds: ['386', '390'],
      pairingIds: [7001, 7002],
      firstSchStrDtUtc: new Date('2026-07-01T03:00:00Z'),
      lastSchStrDtUtc: new Date('2026-07-31T19:00:00Z'),
    })
    spies.recheckSpy.mockImplementationOnce(async () => recheckDone.promise)
    spies.mandayWindowSpy.mockImplementationOnce(async () => mandayWindowDone.promise)
    spies.recomputeNotifySpy.mockImplementationOnce(async () => recomputeDone.promise)

    const resultPromise = processRosterBulkDelete(fastify as never, job as never)

    await vi.waitFor(() => {
      expect(spies.recheckSpy).toHaveBeenCalled()
      expect(spies.mandayWindowSpy).toHaveBeenCalled()
    })

    expect(spies.recheckSpy.mock.invocationCallOrder[0]).toBeLessThan(spies.mandayWindowSpy.mock.invocationCallOrder[0])
    expect(spies.recomputeNotifySpy).not.toHaveBeenCalled()
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'rechecking', percent: 50 }),
      expect.objectContaining({ stage: 'recomputing-manday', percent: 60 }),
    ]))

    mandayWindowDone.resolve({ startDt: '2026-06-28', endDt: '2026-08-10' })
    recheckDone.resolve()
    await vi.waitFor(() => {
      expect(spies.recomputeNotifySpy).toHaveBeenCalled()
    })
    recomputeDone.resolve({ recompute: { crews: 2 }, crewIds: ['386', '390'] })

    const result = await resultPromise

    expect(result.deleted).toBe(2)
  })
})
