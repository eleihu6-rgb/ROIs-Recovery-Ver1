import type { FastifyInstance } from 'fastify'
import worksetRoutes from './workset.js'
import legalityRoutes from './legality.js'

export default async function ruleModule(fastify: FastifyInstance) {
  await fastify.register(worksetRoutes, { prefix: '/api/workset' })
  await fastify.register(legalityRoutes, { prefix: '/api/legality' })
}
