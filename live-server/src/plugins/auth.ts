import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../config/index.js'
import {
  AuthSessionError,
  TOKEN_INVALID_MESSAGE,
  validateAuthPayload,
  type AuthPayload,
} from '../services/auth/session-auth.js'

export type { AuthPayload } from '../services/auth/session-auth.js'

/** Extend Fastify request with authenticated user */
declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthPayload
  }
}

/** Routes that do NOT require authentication (must match exact route paths defined in routes/*.ts) */
const PUBLIC_PATHS = [
  '/api/auth/login',      // User authentication
  '/api/auth/sso/login',  // Azure SAML SSO entry
  '/api/auth/sso/acs',    // Azure SAML assertion consumer (POST)
  '/api/auth/sso/metadata', // SP metadata for Azure import
  '/api/auth/sso/callback', // SSO token → session exchange
  '/api/auth/sso/logout', // IdP-initiated logout redirect target
  '/api/health',          // Basic health check (for monitoring)
  '/api/health/detail',   // Detailed health check (for monitoring)
  '/api/version',         // Public build/runtime version metadata
  '/api/public/config',   // Public system config (for login page)
]

/** Exact public exceptions that must not expose other methods or descendants. */
const PUBLIC_EXACT_ROUTES = [
  { method: 'POST', path: '/api/mobile-roster/session' }, // Crew credential authentication; production requires HTTPS and mobile hardening
]

/**
 * Global JWT authentication hook.
 * Verifies Authorization: Bearer <token> on every request except public paths.
 * Attaches decoded payload to request.authUser.
 */
export default fp(async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip WebSocket upgrade requests (handled separately)
    if (request.headers.upgrade === 'websocket') return

    // Skip public paths
    const path = request.url.split('?')[0]
    if (
      PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))
      || PUBLIC_EXACT_ROUTES.some((route) => route.method === request.method && route.path === path)
    ) return

    // Extract Bearer token
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        code: 401,
        data: null,
        message: 'Authentication required. Please login first.',
      })
    }

    try {
      const verifiedPayload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as AuthPayload
      const payload = await validateAuthPayload(fastify.db, verifiedPayload)
      request.authUser = payload
    } catch (error) {
      if (error instanceof AuthSessionError) {
        return reply.status(error.statusCode).send({
          code: error.statusCode,
          data: null,
          message: error.message,
        })
      }

      return reply.status(401).send({
        code: 401,
        data: null,
        message: TOKEN_INVALID_MESSAGE,
      })
    }
  })
})
