import type { FastifyInstance } from 'fastify'
import dashboardRoutes from './dashboard.js'

export default async function (fastify: FastifyInstance) {
  fastify.register(dashboardRoutes)
}
