import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../../config/index.js'
import {
  buildAuthPayload,
  LIVE_AUTH_SCHEMA,
  type AuthPayload,
} from './session-auth.js'
import {
  getPermissionVersion,
  permissionKey,
  resolvePermissionContext,
  storePermissionContext,
} from '../permission/permission-service.js'
import { PERMISSION_CACHE_TTL_SEC } from '../../types/permission.js'
import type { users } from '../../models/system/users.js'

export type LoginResponseShape = {
  token: string
  userCode: string
  userName: string
  schema: string
  isAdmin: number
  menus: string[]
  ctrls: Record<string, string[]>
  dataScope: {
    FILIALE: string[]
    DIVISION: string[]
    CREW_DEPARTMENT: string[]
    RANK: string[]
    FLEET: string[]
  }
}

/**
 * 构造登录成功响应：解析权限上下文 + 签发（或复用已有）JWT。
 * 密码登录与 SSO login/ACS 共用；existingToken 供 callback 回显同一 token，避免重复签发。
 */
export async function buildLoginResponse(
  fastify: FastifyInstance,
  user: typeof users.$inferSelect,
  authMode: AuthPayload['authMode'] = 'password',
  existingToken?: string,
): Promise<LoginResponseShape> {
  const permVersion = await getPermissionVersion(fastify.redis, LIVE_AUTH_SCHEMA)
  const ctx = await resolvePermissionContext(fastify.db, user.userCode, permVersion)
  await storePermissionContext(
    fastify.redis,
    permissionKey(LIVE_AUTH_SCHEMA, user.userCode),
    ctx,
    PERMISSION_CACHE_TTL_SEC,
  )

  const token = existingToken
    ?? jwt.sign(buildAuthPayload(user, permVersion, authMode), env.JWT_SECRET, { expiresIn: '24h' })

  return {
    token,
    userCode: user.userCode,
    userName: user.userName,
    schema: LIVE_AUTH_SCHEMA,
    isAdmin: user.isAdmin,
    menus: ctx.menus,
    ctrls: ctx.ctrls,
    dataScope: ctx.dataScope,
  }
}
