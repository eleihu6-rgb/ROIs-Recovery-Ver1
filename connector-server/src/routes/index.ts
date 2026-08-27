import type { FastifyInstance } from 'fastify'
import { healthRoutes } from './health.js'
import { inboundRoutes } from './inbound/index.js'
import { outboundRoutes } from './outbound/index.js'
import { adminRoutes } from './admin/index.js'
import { authRoutes } from './auth.js'

export const registerRoutes = (fastify: FastifyInstance) => {
  // Health check (public)
  fastify.register(healthRoutes, { prefix: '/api' })

  // Inbound routes (external push)
  fastify.register(inboundRoutes, { prefix: '/api/inbound' })

  // Outbound routes (external query)
  fastify.register(outboundRoutes, { prefix: '/api/outbound' })

  // Admin routes (internal management)
  fastify.register(adminRoutes, { prefix: '/api/admin' })

  // Auth routes (token exchange)
  fastify.register(authRoutes, { prefix: '/api' })
}