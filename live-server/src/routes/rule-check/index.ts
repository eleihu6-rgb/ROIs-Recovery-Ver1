import type { FastifyInstance } from 'fastify'
import ruleCheckRoutes from './rule-check-routes.js'

export default async function ruleCheckRouteGroup(fastify: FastifyInstance) {
  await fastify.register(ruleCheckRoutes, { prefix: '/api/rule-check' })
}
