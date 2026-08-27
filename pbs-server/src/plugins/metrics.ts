import { timingSafeEqual } from 'node:crypto'
import fp from 'fastify-plugin'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { collectDefaultMetrics, Histogram, register } from 'prom-client'
import { env, isProdLikeEnv } from '../config/env.js'

const DEFAULT_METRIC_SENTINEL = 'rois_pbs_server_process_cpu_user_seconds_total'

// Constant-time string compare that never throws on length mismatch.
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const HTTP_DURATION_METRIC = 'rois_pbs_server_http_request_duration_seconds'
const HTTP_RESPONSE_BYTES_METRIC = 'rois_pbs_server_http_response_bytes'

// Lazily create-or-get the histograms so the helper survives a cleared
// registry (tests call register.clear()) without throwing on re-registration.
const getHttpDurationHistogram = (): Histogram<string> =>
  (register.getSingleMetric(HTTP_DURATION_METRIC) as Histogram<string> | undefined) ??
  new Histogram({
    name: HTTP_DURATION_METRIC,
    help: 'PBS HTTP request duration by method, route, and status code.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [register],
  })

const getHttpResponseBytesHistogram = (): Histogram<string> =>
  (register.getSingleMetric(HTTP_RESPONSE_BYTES_METRIC) as Histogram<string> | undefined) ??
  new Histogram({
    name: HTTP_RESPONSE_BYTES_METRIC,
    help: 'PBS HTTP response payload size by method, route, and status code.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [512, 1024, 4096, 16384, 65536, 262144, 1048576],
    registers: [register],
  })

/**
 * Record a single PBS HTTP response into Prometheus histograms.
 *
 * Labels are kept low-cardinality: only method, matched route template, and
 * status code. Never label with crew/user/pairing ids, tokens, or raw URLs
 * (query strings) — those would explode cardinality.
 */
export const observePbsHttpResponse = (input: {
  method: string
  route: string
  statusCode: number
  elapsedMs: number
  responseBytes: number
}): void => {
  const labels = {
    method: input.method,
    route: input.route,
    status_code: String(input.statusCode),
  }

  getHttpDurationHistogram().observe(labels, input.elapsedMs / 1000)
  getHttpResponseBytesHistogram().observe(labels, input.responseBytes)
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

  if (!register.getSingleMetric(DEFAULT_METRIC_SENTINEL)) {
    collectDefaultMetrics({ prefix: 'rois_pbs_server_' })
  }

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
