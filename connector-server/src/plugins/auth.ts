import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../config/index.js'
import { verifyHmacSignature, isTimestampValid } from '../utils/crypto.js'

/** Connector JWT payload */
export interface ConnectorPayload {
  clientId: string
  schema: string
  scopes: string[]
  type: 'connector'
}

/** Admin JWT payload (from live-server) */
export interface AdminPayload {
  userCode: string
  userName: string
  schema: string
  isAdmin: number
}

/** Combined auth payload */
export type AuthPayload = ConnectorPayload | AdminPayload

declare module 'fastify' {
  interface FastifyRequest {
    authConnector?: ConnectorPayload
    authAdmin?: AdminPayload
    connectorCode?: string
  }
}

/** Routes that do NOT require authentication */
const PUBLIC_PATHS = [
  '/api/health',
  '/api/auth/token',
]

/**
 * Global authentication hook for connector-server.
 * Supports three authentication modes:
 * 1. Public paths (no auth required)
 * 2. Connector routes (API Key + HMAC or JWT with connector type)
 * 3. Admin routes (Live admin JWT with isAdmin===1, OR connector JWT with
 *    connector:admin scope) — see verifyAdminJwt
 */
export default fp(async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0]

    // Skip public paths
    if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return

    // Admin routes require an admin JWT (Live isAdmin or connector:admin scope)
    if (path.startsWith('/api/admin')) {
      return verifyAdminJwt(request, reply)
    }

    // Inbound/Outbound routes: API Key + HMAC or JWT
    if (path.startsWith('/api/inbound') || path.startsWith('/api/outbound')) {
      // Try JWT first (OAuth2 CC flow)
      const authHeader = request.headers.authorization
      if (authHeader?.startsWith('Bearer ')) {
        return verifyConnectorJwt(request, reply)
      }

      // API Key + HMAC signature
      return verifyApiKeyHmac(request, reply)
    }
  })
})

async function verifyAdminJwt(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      code: 401,
      data: null,
      message: 'Authentication required for admin routes.',
    })
  }

  let payload: AdminPayload | ConnectorPayload
  try {
    payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as AdminPayload | ConnectorPayload
  } catch {
    return reply.status(401).send({
      code: 401,
      data: null,
      message: 'Token expired or invalid.',
    })
  }

  // Authorization (distinct from authentication above): a valid token is not
  // enough — the caller must be an admin. Accepted forms:
  //   - Live admin JWT:   isAdmin === 1
  //   - Live user JWT:    has one of the menu codes accepted for this path
  //                       (admin tooling: SYSTEM_QUEUE_TASKS; PBS Material
  //                       Import cross-service call: SCENARIO_IMPORT_PBS).
  //                       Permission context is read from live-server's
  //                       Redis cache (perm:{schema}:{userCode}).
  //   - Connector JWT:    scopes includes 'connector:admin'
  const path = request.url.split('?')[0]
  const acceptedMenuCodes = resolveAcceptedMenuCodes(path)
  const isConnector = (payload as ConnectorPayload).type === 'connector'
  const isLiveAdmin = !isConnector && (payload as AdminPayload).isAdmin === 1
  const isConnectorAdmin =
    isConnector &&
    Array.isArray((payload as ConnectorPayload).scopes) &&
    (payload as ConnectorPayload).scopes.includes('connector:admin')

  if (!isLiveAdmin && !isConnectorAdmin) {
    // 非 admin 的 live 用户：校验路径对应的菜单权限（读取 live-server 写入的 Redis 权限上下文）
    const liveUser = payload as AdminPayload
    if (
      !isConnector &&
      liveUser.userCode &&
      liveUser.schema &&
      await hasAnyAcceptedMenuCode(request, liveUser.schema, liveUser.userCode, acceptedMenuCodes)
    ) {
      request.authAdmin = liveUser
      return
    }
    return reply.status(403).send({
      code: 403,
      data: null,
      message: 'Admin privileges required.',
    })
  }

  request.authAdmin = payload as AdminPayload
}

/**
 * Map admin path → accepted menu codes for non-admin live users.
 *
 * The connector-server admin gate is shared by all `/api/admin/*` routes, but
 * the trigger/list endpoints are also called cross-service by live-server's
 * PBS Material Import flow (which gates the originating call on
 * SCENARIO_IMPORT_PBS). Trust the upstream gate by accepting the same menu
 * code here; configuration endpoints (POST/PUT/DELETE) keep the stricter
 * SYSTEM_QUEUE_TASKS gate to stay admin-only.
 *
 * Tested via `src/__tests__/security/admin-auth.test.ts`.
 */
const ADMIN_PATH_RULES: ReadonlyArray<{ pattern: RegExp; codes: ReadonlyArray<string> }> = [
  // Connector admin endpoints exercised by live-server's PBS Material Import
  // flow. Upstream `POST /api/scenario/import-pbs-material` gates on
  // SCENARIO_IMPORT_PBS; mirror that here.
  { pattern: /^\/api\/admin\/connectors$/, codes: ['SCENARIO_IMPORT_PBS'] },
  { pattern: /^\/api\/admin\/connectors\/[^/]+\/trigger$/, codes: ['SCENARIO_IMPORT_PBS'] },
]

const DEFAULT_ADMIN_PATH_MENU_CODES: ReadonlyArray<string> = ['SYSTEM_QUEUE_TASKS']

function resolveAcceptedMenuCodes(path: string): ReadonlyArray<string> {
  for (const rule of ADMIN_PATH_RULES) {
    if (rule.pattern.test(path)) return rule.codes
  }
  return DEFAULT_ADMIN_PATH_MENU_CODES
}

/**
 * Read live-server's permission context from Redis (`perm:{schema}:{userCode}`)
 * and return true if the user holds any of the accepted menu codes — either as
 * a parent menu (`ctx.menus`) or as a ctl under any parent (`ctx.ctrls[*]`).
 */
async function hasAnyAcceptedMenuCode(
  request: FastifyRequest,
  schema: string,
  userCode: string,
  acceptedCodes: ReadonlyArray<string>,
): Promise<boolean> {
  if (acceptedCodes.length === 0) return false
  try {
    const raw = await request.server.redis.get(`perm:${schema}:${userCode}`)
    if (!raw) return false
    const ctx = JSON.parse(raw) as {
      menus?: string[]
      ctrls?: Record<string, string[]>
    }
    const menus = Array.isArray(ctx.menus) ? ctx.menus : []
    const ctrls = ctx.ctrls ?? {}
    return acceptedCodes.some(
      (code) =>
        menus.includes(code) ||
        Object.values(ctrls).some((list) => Array.isArray(list) && list.includes(code)),
    )
  } catch {
    return false
  }
}

async function verifyConnectorJwt(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization!

  try {
    const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as ConnectorPayload
    if (payload.type !== 'connector') {
      return reply.status(401).send({
        code: 401,
        data: null,
        message: 'Invalid token type for connector routes.',
      })
    }
    request.authConnector = payload
  } catch {
    return reply.status(401).send({
      code: 401,
      data: null,
      message: 'Token expired or invalid.',
    })
  }
}

async function verifyApiKeyHmac(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string
  const timestamp = parseInt(request.headers['x-timestamp'] as string)
  const signature = request.headers['x-signature'] as string

  if (!apiKey || !timestamp || !signature) {
    return reply.status(401).send({
      code: 401,
      data: null,
      message: 'Missing API Key authentication headers.',
    })
  }

  // Check timestamp validity (prevent replay attacks)
  if (!isTimestampValid(timestamp)) {
    return reply.status(401).send({
      code: 401,
      data: null,
      message: 'Request timestamp expired. Rejecting potential replay attack.',
    })
  }

  // Get connector config and verify signature
  // Note: Actual secret lookup will be implemented in connector-config-service
  // For now, we'll pass this check in the route handler with full config access
  request.connectorCode = apiKey // Temporary: API key used as connector code

  // Signature verification will happen in route handler with secret from DB
}