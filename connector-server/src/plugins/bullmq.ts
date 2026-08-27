import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { Queue, QueueBaseOptions } from 'bullmq'
import { env } from '../config/index.js'
import { withPrefix, withBullmqPrefix } from '../utils/redis-key-prefix.js'

const parseRedisConnection = (url: string): QueueBaseOptions['connection'] => {
  try {
    const parsed = new URL(url)
    const db = Number(parsed.pathname.replace('/', ''))

    return {
      host: parsed.hostname || 'localhost',
      port: Number(parsed.port) || 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: Number.isFinite(db) ? db : undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

const queueBaseOptions: QueueBaseOptions = {
  connection: parseRedisConnection(env.BULLMQ_REDIS_URL),
}

declare module 'fastify' {
  interface FastifyInstance {
    queues: {
      flightInbound: Queue
      crewInbound: Queue
      pairingInbound: Queue
      rosterInbound: Queue
      rosterGroundInbound: Queue
      rosterOutbound: Queue
      mandayInbound: Queue
      pollTrigger: Queue
    }
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const flightInbound = new Queue(withBullmqPrefix('connector.flight.inbound'), queueBaseOptions)
  const crewInbound = new Queue(withBullmqPrefix('connector.crew.inbound'), queueBaseOptions)
  const pairingInbound = new Queue(withBullmqPrefix('connector.pairing.inbound'), queueBaseOptions)
  const rosterInbound = new Queue(withBullmqPrefix('connector.roster.inbound'), queueBaseOptions)
  const rosterGroundInbound = new Queue(withBullmqPrefix('connector.roster_ground.inbound'), queueBaseOptions)
  const rosterOutbound = new Queue(withBullmqPrefix('connector.roster.outbound'), queueBaseOptions)
  const mandayInbound = new Queue(withBullmqPrefix('connector.manday.inbound'), queueBaseOptions)
  const pollTrigger = new Queue(withBullmqPrefix('connector.poll.trigger'), queueBaseOptions)

  fastify.decorate('queues', {
    flightInbound,
    crewInbound,
    pairingInbound,
    rosterInbound,
    rosterGroundInbound,
    rosterOutbound,
    mandayInbound,
    pollTrigger,
  })

  fastify.log.info('BullMQ queues initialized')

  fastify.addHook('onClose', async () => {
    await Promise.all([
      flightInbound.close(),
      crewInbound.close(),
      pairingInbound.close(),
      rosterInbound.close(),
      rosterGroundInbound.close(),
      rosterOutbound.close(),
      mandayInbound.close(),
      pollTrigger.close(),
    ])
    fastify.log.info('BullMQ queues closed')
  })
})

export { queueBaseOptions }
