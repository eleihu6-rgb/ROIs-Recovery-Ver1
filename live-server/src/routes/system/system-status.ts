import type { FastifyInstance } from 'fastify'
import { success } from '../../utils/response.js'
import { checkRustBins, checkServiceTable } from '../../services/system-status/service-status.js'

/**
 * Aggregated stack health for the Gantt's "services" indicator.
 *
 * The Gantt runs behind the ROIS tunnel where only live-server is reachable, so
 * the browser cannot probe :3001/:3002/... itself. This endpoint does the
 * probing from the host and returns one flat status the UI can render.
 */
export default async function systemStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/api/system/services', async (_request, reply) => {
    const services = await checkServiceTable()
    const rustBins = checkRustBins()

    const infrastructure: Record<string, string> = {}
    try {
      const client = await fastify.pgPool.connect()
      const result = await client.query('SELECT 1')
      client.release()
      infrastructure.database = result.rows.length > 0 ? 'ok' : 'fail'
    } catch {
      infrastructure.database = 'fail'
    }
    try {
      const pong = await fastify.redis.ping()
      infrastructure.redis = pong === 'PONG' ? 'ok' : 'fail'
    } catch {
      infrastructure.redis = 'fail'
    }

    const ok =
      services.every((service) => service.mandatory ? service.state === 'up' : true) &&
      rustBins.state === 'up' &&
      Object.values(infrastructure).every((value) => value === 'ok')

    return success(reply, {
      ok,
      checkedAt: new Date().toISOString(),
      services: services.map(({ name, port, livePort, mandatory, state, detail, note }) => ({
        name, port, livePort, mandatory, state, detail, note,
      })),
      rustBins,
      infrastructure,
    })
  })
}
