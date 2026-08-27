import type { FastifyInstance } from 'fastify'
import scenarioRoutes from './scenario.js'
import scenarioLegalityRoutes from './legality.js'
import importPbsMaterialRoutes from './import-pbs-material.js'
import scenarioMandayDailyRoutes from './scenario-manday-daily.js'

export default async function scenarioModule(fastify: FastifyInstance) {
  await fastify.register(scenarioRoutes, { prefix: '/api/scenario' })
  await fastify.register(scenarioLegalityRoutes, { prefix: '/api/scenario' })
  await fastify.register(importPbsMaterialRoutes, { prefix: '/api/scenario' })
  await fastify.register(scenarioMandayDailyRoutes, { prefix: '/api/scenario' })
}
