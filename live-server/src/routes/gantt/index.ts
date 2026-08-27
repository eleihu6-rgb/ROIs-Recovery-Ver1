import type { FastifyInstance } from 'fastify'
import ganttRoutes from './gantt.js'

export default async function ganttModule(fastify: FastifyInstance) {
  await fastify.register(ganttRoutes, { prefix: '/api/gantt' })
}
