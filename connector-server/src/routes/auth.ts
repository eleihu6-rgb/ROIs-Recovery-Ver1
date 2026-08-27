import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../utils/response.js'
import { oauth2Auth } from '../services/auth/index.js'
import { connectorConfigService } from '../services/connector/index.js'
import type { AuthConfig } from '../models/index.js'
import { env } from '../config/index.js'

// Constant-time secret compare that never throws on length mismatch.
const secretsMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const tokenRequestSchema = z.object({
  grant_type: z.literal('client_credentials'),
  client_id: z.string(),
  client_secret: z.string(),
  scope: z.string().optional(),
})

/**
 * Auth routes
 * POST /api/auth/token - OAuth 2.0 Client Credentials token exchange
 */
export const authRoutes = async (fastify: FastifyInstance) => {
  fastify.post<{
    Body: z.infer<typeof tokenRequestSchema>
  }>('/auth/token', {
    schema: {
      tags: ['auth'],
      summary: 'OAuth 2.0 Token exchange',
      description: 'Exchange client credentials for a JWT access token',
      consumes: ['application/x-www-form-urlencoded', 'application/json'],
      body: {
        type: 'object',
        required: ['grant_type', 'client_id', 'client_secret'],
        properties: {
          grant_type: { type: 'string' },
          client_id: { type: 'string' },
          client_secret: { type: 'string' },
          scope: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
            data: {
              type: 'object',
              properties: {
                access_token: { type: 'string' },
                token_type: { type: 'string' },
                expires_in: { type: 'integer' },
                scope: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const contentType = request.headers['content-type']

    let body: z.infer<typeof tokenRequestSchema>

    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const form = request.body as Record<string, string>
      body = tokenRequestSchema.parse({
        grant_type: form.grant_type,
        client_id: form.client_id,
        client_secret: form.client_secret,
        scope: form.scope,
      })
    } else {
      const parseResult = tokenRequestSchema.safeParse(request.body)
      if (!parseResult.success) {
        return fail(reply, 400, `Invalid request: ${parseResult.error.message}`)
      }
      body = parseResult.data
    }

    const clientId = body.client_id

    // 1. Look up the connector registered for this OAuth client_id.
    const config = await connectorConfigService.getConfigByOAuthClientId(clientId)
    const authConfig = config?.authConfig as AuthConfig | undefined

    // 2. Verify the client_secret in constant time. Use a generic failure message
    //    for unknown client / wrong secret / disabled connector so we never reveal
    //    which field was wrong.
    if (
      !config ||
      !authConfig?.clientSecret ||
      !secretsMatch(body.client_secret, authConfig.clientSecret)
    ) {
      return fail(reply, 401, 'Invalid client credentials.')
    }

    // 3. Resolve scopes: requested scopes must be a subset of the connector's
    //    configured scopes. If none requested, fall back to the configured set.
    const allowedScopes = authConfig.scopes ?? []
    const requestedScopes = body.scope?.split(' ').filter(Boolean)
    let scopes: string[]
    if (requestedScopes && requestedScopes.length > 0) {
      const disallowed = requestedScopes.filter((s) => !allowedScopes.includes(s))
      if (disallowed.length > 0) {
        return fail(reply, 403, 'Requested scope is not permitted for this client.')
      }
      scopes = requestedScopes
    } else {
      scopes = allowedScopes
    }

    // 4. Issue the connector JWT. `schema` stays empty: connector_config has no
    //    airline-schema binding, so this is intentional (not an oversight).
    const token = oauth2Auth.generateConnectorJwt(
      clientId,
      '',
      scopes,
      env.JWT_SECRET,
      '1h'
    )

    return success(reply, {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: scopes.join(' '),
    })
  })
}