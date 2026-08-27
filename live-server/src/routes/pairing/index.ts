import type { FastifyInstance } from 'fastify'
import pairingRoutes from './pairing.js'
import pairingTemplateRoutes from './pairing-template.js'

export default async function pairingModule(fastify: FastifyInstance) {
  await fastify.register(pairingRoutes, { prefix: '/api/pairing' })
  await fastify.register(pairingTemplateRoutes, { prefix: '/api/pairing/template' })
}
