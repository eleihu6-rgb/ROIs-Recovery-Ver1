import type { FastifyBaseLogger } from 'fastify'
import { env } from '../config/index.js'
import { parseRedisUrl } from './redis-url.js'

export const getBullmqRedisConnection = (): ReturnType<typeof parseRedisUrl> =>
  parseRedisUrl(env.BULLMQ_REDIS_URL)

type BullmqErrorEmitter = {
  on(event: 'error', listener: (err: Error) => void): unknown
}

export const attachBullmqErrorLogger = <T extends BullmqErrorEmitter>(
  emitter: T,
  log: FastifyBaseLogger,
  label: string,
): T => {
  emitter.on('error', (err) => {
    log.error({ err }, `${label} error`)
  })
  return emitter
}
