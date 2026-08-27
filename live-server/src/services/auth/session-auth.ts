import { eq, sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { env } from '../../config/index.js'
import { users } from '../../models/system/users.js'

type LiveDb = ReturnType<typeof drizzle>
type UserRow = typeof users.$inferSelect

export const LIVE_AUTH_SCHEMA = env.LIVE_SCHEMA
export const LOGIN_INVALID_MESSAGE = 'Invalid user code or password.'
export const TOKEN_INVALID_MESSAGE = 'Token expired or invalid. Please login again.'
export const ACCOUNT_FORBIDDEN_MESSAGE = 'This account cannot access ROIS.'

export interface AuthPayload {
  userCode: string
  userName: string
  schema: string
  isAdmin: number
  tokenVersion: number
  /** 权限版本号；登录时写入，权限变更后递增。旧 JWT 缺失时为 undefined（跳过陈旧校验） */
  permVersion?: number
  /** 登录方式；SSO 登录签发时为 "sso"，存量 token 缺省视为 "password" */
  authMode?: 'password' | 'sso'
}

export class AuthSessionError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'AuthSessionError'
    this.statusCode = statusCode
  }
}

const hasEnabledAccess = (value: string | null): boolean => value === 'Y'

export const hasLivePortalAccess = (user: UserRow, now: Date): boolean =>
  user.status === 0
  && hasEnabledAccess(user.passwordAccess)
  && hasEnabledAccess(user.portalAccess)
  && user.effDt <= now
  && (user.expDt === null || user.expDt > now)

/** SSO 门槛：不要求 passwordAccess（SSO 是认证方式本身），其余与密码登录一致 */
export const hasSsoPortalAccess = (user: UserRow, now: Date): boolean =>
  user.status === 0
  && hasEnabledAccess(user.portalAccess)
  && user.effDt <= now
  && (user.expDt === null || user.expDt > now)

export const buildAuthPayload = (
  user: UserRow,
  permVersion = 1,
  authMode: 'password' | 'sso' = 'password',
): AuthPayload => ({
  userCode: user.userCode,
  userName: user.userName,
  schema: LIVE_AUTH_SCHEMA,
  isAdmin: user.isAdmin,
  tokenVersion: user.tokenVersion,
  permVersion,
  authMode,
})

export const validateAuthPayload = async (db: LiveDb, payload: AuthPayload): Promise<AuthPayload> => {
  if (
    payload.schema !== LIVE_AUTH_SCHEMA
    || typeof payload.userCode !== 'string'
    || !payload.userCode
    || !Number.isInteger(payload.tokenVersion)
  ) {
    throw new AuthSessionError(401, TOKEN_INVALID_MESSAGE)
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.userCode, payload.userCode))
    .limit(1)
  const user = result[0]

  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new AuthSessionError(401, TOKEN_INVALID_MESSAGE)
  }

  if (!hasLivePortalAccess(user, new Date())) {
    throw new AuthSessionError(403, ACCOUNT_FORBIDDEN_MESSAGE)
  }

  // 保留原 JWT 的 permVersion 与 authMode（权限陈旧校验与 SSO 标记依赖它），重建其余字段
  return buildAuthPayload(user, payload.permVersion, payload.authMode ?? 'password')
}

/**
 * SSO callback 用校验：与 validateAuthPayload 同构，但门槛走 SSO 版（不要求 passwordAccess）。
 * SSO 用户在 ACS 已按 SSO 门槛放行，callback 不应再用密码门槛拒绝。
 */
export const validateSsoAuthPayload = async (db: LiveDb, payload: AuthPayload): Promise<AuthPayload> => {
  if (
    payload.schema !== LIVE_AUTH_SCHEMA
    || typeof payload.userCode !== 'string'
    || !payload.userCode
    || !Number.isInteger(payload.tokenVersion)
  ) {
    throw new AuthSessionError(401, TOKEN_INVALID_MESSAGE)
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.userCode, payload.userCode))
    .limit(1)
  const user = result[0]

  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new AuthSessionError(401, TOKEN_INVALID_MESSAGE)
  }

  if (!hasSsoPortalAccess(user, new Date())) {
    throw new AuthSessionError(403, ACCOUNT_FORBIDDEN_MESSAGE)
  }

  return buildAuthPayload(user, payload.permVersion, payload.authMode ?? 'sso')
}

export const revokeUserTokens = async (db: LiveDb, userCode: string): Promise<void> => {
  await db
    .update(users)
    .set({
      tokenVersion: sql`${users.tokenVersion} + 1`,
      updatedAt: new Date(),
      updatedBy: 'live-auth',
    })
    .where(eq(users.userCode, userCode))
}
