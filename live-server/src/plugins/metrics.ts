import { timingSafeEqual } from 'node:crypto'
import fp from 'fastify-plugin'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { collectDefaultMetrics, register } from 'prom-client'
import { env, isProdLikeEnv } from '../config/env.js'
import { getOrCreateHistogram } from '../utils/metrics.js'

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

  collectDefaultMetrics({ prefix: 'rois_live_server_' })

  // Per-route latency + payload size (P0). Labels are low-cardinality: `route` is the
  // route *template* (e.g. /api/gantt/bootstrap), never a concrete URL with ids, so the
  // hot Gantt paths are observable without leaking crew/flight/pairing identifiers.
  const httpRequestDuration = getOrCreateHistogram({
    name: 'rois_live_server_http_request_duration_seconds',
    help: 'HTTP request duration in seconds by method, route template and status code.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  })
  const httpResponseBytes = getOrCreateHistogram({
    name: 'rois_live_server_http_response_bytes',
    help: 'HTTP response payload size in bytes by method and route template.',
    labelNames: ['method', 'route'],
    buckets: [256, 1024, 16384, 131072, 1048576, 8388608, 33554432],
  })

  // Route template, never the concrete URL (which carries ids/query → high cardinality).
  const routeLabel = (request: FastifyRequest): string =>
    (request.routeOptions?.url as string | undefined) ?? 'unmatched'

  // onSend sees the body before @fastify/compress — measure the real payload the
  // service produced (string/Buffer). Skip the /metrics scrape itself.
  fastify.addHook('onSend', async (request, _reply, payload) => {
    const route = routeLabel(request)
    if (route === '/metrics') return payload
    let bytes = 0
    if (typeof payload === 'string') bytes = Buffer.byteLength(payload)
    else if (Buffer.isBuffer(payload)) bytes = payload.length
    if (bytes > 0) httpResponseBytes.observe({ method: request.method, route }, bytes)
    return payload
  })

  fastify.addHook('onResponse', async (request, reply) => {
    const route = routeLabel(request)
    if (route === '/metrics') return
    httpRequestDuration.observe(
      { method: request.method, route, status_code: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    )
  })

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
