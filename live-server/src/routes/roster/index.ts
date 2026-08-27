import type { FastifyInstance } from 'fastify'
import rosterRoutes from './roster.js'
import rosterPublishRoutes from './roster-publish.js'

export default async function rosterModule(fastify: FastifyInstance) {
  await fastify.register(rosterRoutes, { prefix: '/api/roster' })
  await fastify.register(rosterPublishRoutes, { prefix: '/api/roster/publish' })
}
