import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'

/**
 * Baseline browser security headers for this API service.
 *
 * API-safe defaults (no UI assets served here):
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: DENY (frameguard)
 *   - Referrer-Policy: no-referrer
 *   - Cross-Origin-Resource-Policy: same-site
 *   - x-powered-by removed
 *
 * CSP is disabled because responses are JSON, not HTML.
 */
export default fp(async function securityHeadersPlugin(fastify: FastifyInstance) {
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  })
})
