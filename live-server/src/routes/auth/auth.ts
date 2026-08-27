import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../../config/index.js'
import { users } from '../../models/system/users.js'
import {
  ACCOUNT_FORBIDDEN_MESSAGE,
  AuthSessionError,
  hasLivePortalAccess,
  LOGIN_INVALID_MESSAGE,
  LIVE_AUTH_SCHEMA,
  revokeUserTokens,
  TOKEN_INVALID_MESSAGE,
  validateAuthPayload,
  type AuthPayload,
} from '../../services/auth/session-auth.js'
import {
  buildAdminContext,
  getOrResolvePermissionContext,
} from '../../services/permission/permission-service.js'
import type { PermissionContext } from '../../types/permission.js'
import { buildLoginResponse } from '../../services/auth/login-response.js'

const loginSchema = z.object({
  userCode: z.string().min(1),
  password: z.string().min(1),
})

/**
 * Normalize user code: trim surrounding whitespace ONLY. The lookup is
 * case-SENSITIVE — accounts distinguish case (e.g. 'Ryan' [admin] and 'ryan'
 * are different users), so we must NOT lowercase here or in the query.
 */
export function normalizeUserCode(code: string): string {
  return code.trim()
}

const ok = (reply: FastifyReply, data: unknown) =>
  reply.send({ code: 200, data, message: 'ok' })

const fail = (reply: FastifyReply, code: number, message: string) =>
  reply.status(code).send({ code, data: null, message })

const getValidatedPayload = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
): Promise<AuthPayload | null> => {
  if (request.authUser) return request.authUser

  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null

  const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as AuthPayload
  return validateAuthPayload(fastify.db, payload)
}

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/auth/login
   * Body: { userCode, password }
   * Returns: { token, userCode, userName, schema }
   */
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, 'userCode and password are required')

    const { userCode, password } = parsed.data
    const normalized = normalizeUserCode(userCode)

    const result = await fastify.db
      .select()
      .from(users)
      .where(sql`${users.userCode} = ${normalized}`)
      .limit(1)

    const user = result[0]
    if (!user) return fail(reply, 401, LOGIN_INVALID_MESSAGE)

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return fail(reply, 401, LOGIN_INVALID_MESSAGE)

    if (!hasLivePortalAccess(user, new Date())) {
      return fail(reply, 403, ACCOUNT_FORBIDDEN_MESSAGE)
    }

    const response = await buildLoginResponse(fastify, user)
    return ok(reply, response)
  })

  /**
   * GET /api/auth/me
   * Header: Authorization: Bearer <token>
   * Returns current user info + filtered permission context (menus/ctrls/dataScope)
   */
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await getValidatedPayload(fastify, request)
      if (!payload) return fail(reply, 401, 'Not authenticated')

      let ctx: PermissionContext
      if (payload.isAdmin === 1) {
        ctx = await buildAdminContext(fastify.db)
      } else {
        ctx = await getOrResolvePermissionContext(fastify.db, fastify.redis, payload.schema, payload.userCode)
      }

      return ok(reply, {
        user: {
          userCode: payload.userCode,
          userName: payload.userName,
          schema: payload.schema,
          isAdmin: payload.isAdmin,
        },
        menus: ctx.menus,
        ctrls: ctx.ctrls,
        dataScope: ctx.dataScope,
      })
    } catch (error) {
      if (error instanceof AuthSessionError) {
        return fail(reply, error.statusCode, error.message)
      }

      return fail(reply, 401, TOKEN_INVALID_MESSAGE)
    }
  })

  fastify.delete('/session', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await getValidatedPayload(fastify, request)
      if (!payload) return fail(reply, 401, 'Not authenticated')

      await revokeUserTokens(fastify.db, payload.userCode)
      return ok(reply, { loggedOut: true })
    } catch (error) {
      if (error instanceof AuthSessionError) {
        return fail(reply, error.statusCode, error.message)
      }

      return fail(reply, 401, TOKEN_INVALID_MESSAGE)
    }
  })
}
