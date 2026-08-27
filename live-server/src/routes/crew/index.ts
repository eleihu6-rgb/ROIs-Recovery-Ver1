import type { FastifyInstance } from 'fastify'
import crewRoutes from './crew.js'
import crewHistoryRoutes from './crew-history.js'
import crewCredentialRoutes from './crew-credential.js'
import crewOtherRoutes from './crew-other.js'
import crewQualsBatchRoutes from './crew-quals-batch.js'
import crewStatsRoutes from './crew-stats.js'
import crewMandayDailyRoutes from './crew-manday-daily.js'

export default async function crewModule(fastify: FastifyInstance) {
  // Static paths before /:id so they are never captured as crew ids
  // /api/crew/stats — manday stats (YBH/MBH/MCred/YAL/MAL/YDO/MDO)
  await fastify.register(crewStatsRoutes, { prefix: '/api/crew' })

  // /api/crew/manday-daily — per-day credit + blh for Manday Info dialog
  await fastify.register(crewMandayDailyRoutes, { prefix: '/api/crew' })

  // /api/crew/batch-quals — batch fetch qualifications for rule engine
  await fastify.register(crewQualsBatchRoutes, { prefix: '/api/crew' })

  // /api/crew — main CRUD + KPI adjust
  await fastify.register(crewRoutes, { prefix: '/api/crew' })

  // /api/crew/:crewId/ranks|bases|fleets|statuses|teams — history
  await fastify.register(crewHistoryRoutes, { prefix: '/api/crew' })

  // /api/crew/:crewId/certificates|licenses|...|qualifications — credentials
  await fastify.register(crewCredentialRoutes, { prefix: '/api/crew' })

  // /api/crew/:crewId/entitlements|memos|seniorities — other sub-resources
  await fastify.register(crewOtherRoutes, { prefix: '/api/crew' })
}
