import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withPrefix } from '../../utils/redis-key-prefix.js'
import {
  mutationConflictMessage,
  mutationExclusiveService,
  type MutationLeaseRef,
} from './mutation-exclusive-service.js'

const makeRedis = () => ({
  set: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
})

describe('mutationExclusiveService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('atomically acquires one schema lease and reports the current owner on conflict', async () => {
    const redis = makeRedis()
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
    redis.get.mockResolvedValue(JSON.stringify({
      token: 'existing-token',
      operation: 'roster-bulk-delete',
      userCode: 'planner-2',
      acquiredAt: 1_700_000_000_000,
    }))

    const acquired = await mutationExclusiveService.tryAcquire(redis as never, 'F8', 'import-pbs-material', 'planner-1')
    expect(acquired.acquired).toBe(true)
    if (!acquired.acquired) throw new Error('expected lease to be acquired')
    expect(acquired.lease.schema).toBe('f8')
    expect(redis.set).toHaveBeenCalledWith(
      withPrefix('mutation:exclusive:f8'),
      expect.stringContaining('"operation":"import-pbs-material"'),
      { NX: true, EX: 900 },
    )

    const conflict = await mutationExclusiveService.tryAcquire(redis as never, 'f8', 'roster-bulk-delete', 'planner-2')
    expect(conflict).toEqual({
      acquired: false,
      owner: {
        operation: 'roster-bulk-delete',
        userCode: 'planner-2',
        acquiredAt: 1_700_000_000_000,
      },
    })
  })

  it('renews and releases only through the token-checked Redis scripts', async () => {
    const redis = makeRedis()
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
    const lease: MutationLeaseRef = { schema: 'f8', token: 'lease-token' }

    await expect(mutationExclusiveService.renew(redis as never, lease)).resolves.toBe(true)
    await expect(mutationExclusiveService.release(redis as never, lease)).resolves.toBe(false)

    expect(redis.eval).toHaveBeenNthCalledWith(1, expect.stringContaining("value['token']"), {
      keys: [withPrefix('mutation:exclusive:f8')],
      arguments: ['lease-token', '900'],
    })
    expect(redis.eval).toHaveBeenNthCalledWith(2, expect.stringContaining("value['token']"), {
      keys: [withPrefix('mutation:exclusive:f8')],
      arguments: ['lease-token'],
    })
  })

  it('gives the user an actionable conflict message without creating a queue promise', () => {
    expect(mutationConflictMessage('import-pbs-material', {
      operation: 'roster-bulk-delete',
      userCode: 'planner-2',
      acquiredAt: 1,
    }, 'planner-1')).toBe(
      'Your Import PBS Material request was not started. Another user is currently running Bulk Delete Roster Flights (user: planner-2). Please wait until it finishes, then try again.',
    )
    expect(mutationConflictMessage('roster-bulk-delete', null, 'planner-1')).toContain(
      'Please wait until it finishes, then try again.',
    )
  })
})
