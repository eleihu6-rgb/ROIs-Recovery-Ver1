import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyPluginAsync } from 'fastify'

vi.mock('../../config/index.js', () => ({
  env: {
    BULLMQ_REDIS_URL: 'redis://localhost:6379/3',
  },
}))

const queueMocks = vi.hoisted(() => {
  const instances: Array<{ name: string; on: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = []
  return {
    instances,
    Queue: vi.fn((name: string) => {
      const queue = {
        name,
        on: vi.fn(),
        close: vi.fn(async () => undefined),
      }
      instances.push(queue)
      return queue
    }),
  }
})

vi.mock('bullmq', () => ({
  Queue: queueMocks.Queue,
}))

describe('bullmq plugin Redis hardening', () => {
  it('attaches error handlers to queue Redis connections', async () => {
    const app = Fastify({ logger: false })
    const bullmqPluginModule = await import('../../plugins/bullmq.js')
    const plugin = bullmqPluginModule.default as unknown as FastifyPluginAsync
    await app.register(plugin)

    // As of 2026-08-25 the plugin owns 7 queues: realtime / batch / batchCrew /
    // violationsInit / rosterBulkDelete (the original 4) plus mandayRecompute
    // (c8240ba5) and scenarioKpiRecompute (05f601e1). All queue names flow
    // through withPrefix() so this assertion intentionally covers the full
    // set, not the original 4.
    expect(queueMocks.instances).toHaveLength(7)
    for (const queue of queueMocks.instances) {
      const errorHandler = queue.on.mock.calls.find(([event]) => event === 'error')?.[1] as
        | ((err: Error) => void)
        | undefined

      expect(errorHandler).toBeDefined()
      expect(() => errorHandler?.(new Error('Socket closed unexpectedly'))).not.toThrow()
    }

    await app.close()
  })
})
