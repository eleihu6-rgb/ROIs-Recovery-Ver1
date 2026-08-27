import type { FastifyInstance } from 'fastify'
import flightRoutes from './flight.js'

export default async function flightModule(fastify: FastifyInstance) {
  await fastify.register(flightRoutes, { prefix: '/api/flight' })
}
