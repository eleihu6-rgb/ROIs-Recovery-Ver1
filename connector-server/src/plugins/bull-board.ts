import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'

export default fp(async (fastify: FastifyInstance) => {
  const serverAdapter = new FastifyAdapter()

  createBullBoard({
    queues: [
      new BullMQAdapter(fastify.queues.flightInbound),
      new BullMQAdapter(fastify.queues.crewInbound),
      new BullMQAdapter(fastify.queues.pairingInbound),
      new BullMQAdapter(fastify.queues.rosterInbound),
      new BullMQAdapter(fastify.queues.rosterOutbound),
      new BullMQAdapter(fastify.queues.pollTrigger),
    ],
    serverAdapter,
  })

  serverAdapter.setBasePath('/fpqe/connector/admin/queues')
  await fastify.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' })

  fastify.log.info('Bull Board registered at /admin/queues (external: /fpqe/connector/admin/queues)')
})
