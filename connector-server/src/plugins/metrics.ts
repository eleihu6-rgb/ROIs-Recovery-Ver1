import { timingSafeEqual } from 'node:crypto'
import fp from 'fastify-plugin'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { collectDefaultMetrics, register } from 'prom-client'
import { env, isProdLikeEnv } from '../config/env.js'

// Constant-time string compare that never throws on length mismatch.
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Prometheus /metrics endpoint with exposure controls (security quick-win):
 *   - METRICS_ENABLED=false  -> endpoint not registered (404).
 *   - METRICS_TOKEN set      -> requires `Authorization: Bearer <token>` or
 *                               `X-Metrics-Token: <token>`.
 *   - production-like env     -> refuses to start if metrics are enabled without
 *                               a token, so internal telemetry is never public.
 */
export default fp(async function metricsPlugin(fastify: FastifyInstance) {
  if (!env.METRICS_ENABLED) {
    fastify.log.info('Metrics disabled (METRICS_ENABLED=false); /metrics not registered')
    return
  }

  if (isProdLikeEnv && !env.METRICS_TOKEN) {
    throw new Error(
      'METRICS_TOKEN is required when METRICS_ENABLED is true in a production-like environment. ' +
        'Set a token or disable metrics (METRICS_ENABLED=false).',
    )
  }

  collectDefaultMetrics({ prefix: 'rois_connector_server_' })

  const requireToken = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!env.METRICS_TOKEN) return
    const header = request.headers.authorization
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined
    const provided = bearer ?? (request.headers['x-metrics-token'] as string | undefined)
    if (!provided || !safeEqual(provided, env.METRICS_TOKEN)) {
      reply.code(403).send({ code: 403, data: null, message: 'Forbidden.' })
    }
  }

  fastify.get(
    '/metrics',
    { logLevel: 'silent', preHandler: requireToken },
    async (_request, reply) => {
      reply.header('Content-Type', register.contentType)
      return register.metrics()
    },
  )
})
