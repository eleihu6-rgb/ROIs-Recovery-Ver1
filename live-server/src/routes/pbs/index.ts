import type { FastifyInstance } from 'fastify'
import crewBidsRoutes from './crew-bids.js'
import pbsPeriodAdminRoutes from './period-admin.js'
import pbsBidDefinitionRoutes from './bid-definitions.js'

export default async function pbsRoutes(fastify: FastifyInstance) {
  await fastify.register(crewBidsRoutes, { prefix: '/api/pbs' })
  await fastify.register(pbsPeriodAdminRoutes, { prefix: '/api/pbs' })
  await fastify.register(pbsBidDefinitionRoutes, { prefix: '/api/pbs' })
}
