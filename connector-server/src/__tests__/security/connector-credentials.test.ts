import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'

// env.ts (imported by the route via oauth2Auth) requires DATABASE_URL.
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

// Loaded in beforeAll (after env is set) — avoids top-level await (CJS build).
type AuthRoutes = typeof import('../../routes/auth.js')['authRoutes']
type ConnectorConfigService = typeof import('../../services/connector/index.js')['connectorConfigService']
let authRoutes: AuthRoutes
let connectorConfigService: ConnectorConfigService

beforeAll(async () => {
  authRoutes = (await import('../../routes/auth.js')).authRoutes
  connectorConfigService = (await import('../../services/connector/index.js')).connectorConfigService
})

// Build a fake drizzle chain whose terminal .limit() resolves to `rows`.
function setConnectorRows(rows: unknown[]) {
  connectorConfigService.setFastify({
    db: {
      select: () => ({ from: () => ({ limit: async () => rows }) }),
    },
  } as never)
}

const enabledOAuthConnector = {
  id: 1,
  connectorCode: 'f8-oauth-test',
  authType: 'oauth2_cc',
  isEnabled: 1,
  isDeleted: 0,
  authConfig: {
    clientId: 'cid',
    clientSecret: 'correct-secret',
    scopes: ['connector:read', 'connector:write'],
  },
}

async function postToken(app: FastifyInstance, body: Record<string, string>) {
  return app.inject({ method: 'POST', url: '/api/auth/token', payload: body })
}

describe('POST /api/auth/token credential verification', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    await app.register(authRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('issues a token for valid client_id + client_secret', async () => {
    setConnectorRows([enabledOAuthConnector])
    const res = await postToken(app, {
      grant_type: 'client_credentials',
      client_id: 'cid',
      client_secret: 'correct-secret',
    })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.access_token).toBeTruthy()
    // Falls back to the connector's configured scopes
    expect(json.data.scope).toBe('connector:read connector:write')
  })

  // Route-level failures use the project's envelope: HTTP 200 with the error
  // code in body.code (per fail() / CLAUDE.md `{ code, data, message }`).
  it('rejects a wrong secret (body.code 401, no token)', async () => {
    setConnectorRows([enabledOAuthConnector])
    const res = await postToken(app, {
      grant_type: 'client_credentials',
      client_id: 'cid',
      client_secret: 'WRONG',
    })
    expect(res.json().code).toBe(401)
    expect(res.json().data?.access_token).toBeFalsy()
  })

  it('rejects an unknown client (body.code 401)', async () => {
    setConnectorRows([])
    const res = await postToken(app, {
      grant_type: 'client_credentials',
      client_id: 'ghost',
      client_secret: 'whatever',
    })
    expect(res.json().code).toBe(401)
  })

  it('rejects a disabled connector (body.code 401)', async () => {
    setConnectorRows([{ ...enabledOAuthConnector, isEnabled: 0 }])
    const res = await postToken(app, {
      grant_type: 'client_credentials',
      client_id: 'cid',
      client_secret: 'correct-secret',
    })
    expect(res.json().code).toBe(401)
  })

  it('rejects a requested scope outside the configured set (body.code 403)', async () => {
    setConnectorRows([enabledOAuthConnector])
    const res = await postToken(app, {
      grant_type: 'client_credentials',
      client_id: 'cid',
      client_secret: 'correct-secret',
      scope: 'connector:admin',
    })
    expect(res.json().code).toBe(403)
  })
})
