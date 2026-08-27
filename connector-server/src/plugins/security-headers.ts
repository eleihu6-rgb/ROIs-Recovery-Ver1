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
 * CSP is disabled because responses are JSON; Swagger UI (this service registers
 * @fastify/swagger-ui) renders its own same-origin assets, so leaving CSP off
 * keeps the admin docs working while still adding the other security headers.
 */
export default fp(async function securityHeadersPlugin(fastify: FastifyInstance) {
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  })
})
