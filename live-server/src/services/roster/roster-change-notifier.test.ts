import { describe, expect, it, vi } from 'vitest'
import { notifyRosterTasksChanged } from './roster-change-notifier.js'
import { withPrefix } from '../../utils/redis-key-prefix.js'

describe('notifyRosterTasksChanged', () => {
  it('clears roster caches, bumps affected crew chunk versions, then broadcasts', async () => {
    const calls: string[] = []
    const fastify = {
      redis: {
        scan: vi.fn(async (cursor: number) => {
          calls.push(`scan:${cursor}`)
          return { cursor: 0, keys: [withPrefix('roster:view:old')] }
        }),
        del: vi.fn(async (keys: string[]) => {
          calls.push(`del:${keys.join(',')}`)
        }),
        incr: vi.fn(async (key: string) => {
          calls.push(`incr:${key}`)
          return 1
        }),
      },
      wsBroadcastAll: vi.fn((schema: string, message: unknown) => {
        calls.push(`broadcast:${schema}:${JSON.stringify(message)}`)
      }),
    }

    const notified = await notifyRosterTasksChanged(fastify as never, {
      schema: 'f8',
      crewIds: ['927', '927', ' 928 ', ''],
      pairingIds: [41, 41],
    })

    expect(notified).toEqual(['927', '928'])
    expect(fastify.redis.scan).toHaveBeenCalledWith(0, { MATCH: withPrefix('roster:view:*'), COUNT: 200 })
    expect(fastify.redis.incr).toHaveBeenCalledWith(withPrefix('roster:v2:chunkver:927'))
    expect(fastify.redis.incr).toHaveBeenCalledWith(withPrefix('roster:v2:chunkver:928'))
    expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8', {
      type: 'roster-updated',
      crewIds: ['927', '928'],
      pairingIds: [41],
    })
    expect(calls.at(-1)).toBe('broadcast:f8:{"type":"roster-updated","crewIds":["927","928"],"pairingIds":[41]}')
  })

  it('does not broadcast when there are no affected crews', async () => {
    const fastify = {
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => undefined),
        incr: vi.fn(async () => 1),
      },
      wsBroadcastAll: vi.fn(),
    }

    const notified = await notifyRosterTasksChanged(fastify as never, { schema: 'f8', crewIds: [] })

    expect(notified).toEqual([])
    expect(fastify.redis.scan).toHaveBeenCalled()
    expect(fastify.redis.incr).not.toHaveBeenCalled()
    expect(fastify.wsBroadcastAll).not.toHaveBeenCalled()
  })
})
