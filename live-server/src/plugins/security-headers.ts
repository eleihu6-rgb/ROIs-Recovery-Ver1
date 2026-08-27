import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'

/**
 * Baseline browser security headers for this API service.
 *
 * These are API-safe defaults (no UI assets are served from this service):
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: DENY (frameguard)
 *   - Referrer-Policy: no-referrer
 *   - Cross-Origin-Resource-Policy: same-site
 *   - x-powered-by removed
 *
 * CSP is disabled here because responses are JSON, not HTML; a CSP on a pure
 * JSON API adds no value and can break Swagger/Bull Board admin UIs. Tighten
 * per-route if any HTML surface is added later.
 */
export default fp(async function securityHeadersPlugin(fastify: FastifyInstance) {
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  })
})
