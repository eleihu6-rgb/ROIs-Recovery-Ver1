import { eq, inArray, ne } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import type { RedisClientType } from 'redis'
import {
  profileAuthorization,
  profileCtrlPrivilege,
  profileMenuPrivilege,
  systemMenu,
  userProfile,
  users,
} from '../../models/index.js'
import { PERMISSION_CACHE_TTL_SEC, type PermissionContext } from '../../types/permission.js'
import { buildPermissionContext, type PermissionRow } from './permission-context.js'

type LiveDb = ReturnType<typeof drizzle>

/** Redis 权限缓存 key：perm:{schema}:{userCode} */
export const permissionKey = (schema: string, userCode: string): string => `perm:${schema}:${userCode}`

/** Redis 全局权限版本 key：perm:version:{schema}；权限变更时 INCR，旧 JWT 失效 */
export const permissionVersionKey = (schema: string): string => `perm:version:${schema}`

/** 读取当前全局权限版本（默认 1） */
export async function getPermissionVersion(redis: RedisClientType, schema: string): Promise<number> {
  const raw = await redis.get(permissionVersionKey(schema))
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** 权限变更后递增全局版本（P2 管理界面写操作时调用），使旧 JWT/缓存失效 */
export async function bumpPermissionVersion(redis: RedisClientType, schema: string): Promise<number> {
  return redis.incr(permissionVersionKey(schema))
}

/** is_admin 短路上下文：插件层对 is_admin 直接放行，此处返回空权限占位 */
export const ALL_ACCESS_CONTEXT: PermissionContext = {
  menus: [],
  ctrls: {},
  dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
  permVersion: 1,
}

/** 管理员上下文：menus/ctrls 全量（用于 /me 下发前端全量菜单/按钮），dataScope 不限 */
export async function buildAdminContext(db: LiveDb): Promise<PermissionContext> {
  const [menuRows, ctrlRows] = await Promise.all([
    db.select({ menuCode: systemMenu.menuCode }).from(systemMenu).where(ne(systemMenu.systemType, 'B')),
    db.select({ menuCode: systemMenu.parentMenuCode, ctlCode: systemMenu.menuCode }).from(systemMenu).where(eq(systemMenu.systemType, 'B')),
  ])
  const ctrls: Record<string, string[]> = {}
  for (const c of ctrlRows) (ctrls[c.menuCode] ??= []).push(c.ctlCode)
  return { menus: menuRows.map((r) => r.menuCode), ctrls, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 }
}

/** 从 DB 解析用户的权限上下文（登录时调用一次，结果入缓存） */
export async function resolvePermissionContext(db: LiveDb, userCode: string, permVersion = 1): Promise<PermissionContext> {
  const userRows = await db.select({ isAdmin: users.isAdmin }).from(users).where(inArray(users.userCode, [userCode])).limit(1)
  const user = userRows[0]
  if (!user) return { menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion }
  if (user.isAdmin === 1) return { ...ALL_ACCESS_CONTEXT, permVersion }

  const profileRows = await db.select({ profileId: userProfile.profileId }).from(userProfile).where(inArray(userProfile.userCode, [userCode]))
  const profileIds = profileRows.map((r) => r.profileId)
  if (profileIds.length === 0) return { menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion }

  const [menuRows, ctrlRows, authRows] = await Promise.all([
    db
      .select({ menuCode: profileMenuPrivilege.menuCode, isHidden: profileMenuPrivilege.isHidden })
      .from(profileMenuPrivilege)
      .where(inArray(profileMenuPrivilege.profileId, profileIds)),
    db
      .select({
        menuCode: profileCtrlPrivilege.menuCode,
        ctlCode: profileCtrlPrivilege.menuCtlCode,
        isHidden: profileCtrlPrivilege.isHidden,
      })
      .from(profileCtrlPrivilege)
      .where(inArray(profileCtrlPrivilege.profileId, profileIds)),
    db
      .select({ authType: profileAuthorization.authType, authValues: profileAuthorization.authValues })
      .from(profileAuthorization)
      .where(inArray(profileAuthorization.profileId, profileIds)),
  ])

  const rows: PermissionRow[] = [
    ...menuRows.map((r) => ({ profileId: 0, menuCode: r.menuCode, menuHidden: r.isHidden, ctlCode: null, ctlHidden: null, authType: null, authValues: null })),
    ...ctrlRows.map((r) => ({ profileId: 0, menuCode: r.menuCode, menuHidden: null, ctlCode: r.ctlCode, ctlHidden: r.isHidden, authType: null, authValues: null })),
    ...authRows.map((r) => ({ profileId: 0, menuCode: null, menuHidden: null, ctlCode: null, ctlHidden: null, authType: r.authType, authValues: r.authValues })),
  ]

  return buildPermissionContext(rows, permVersion)
}

export async function loadPermissionContext(redis: RedisClientType, key: string): Promise<PermissionContext | null> {
  const raw = await redis.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PermissionContext
  } catch {
    return null
  }
}

export async function storePermissionContext(redis: RedisClientType, key: string, ctx: PermissionContext, ttlSec: number): Promise<void> {
  await redis.set(key, JSON.stringify(ctx), { EX: ttlSec })
}

export async function invalidatePermissionContext(redis: RedisClientType, key: string): Promise<void> {
  await redis.del(key)
}

/** Redis → DB 兜底的权限上下文获取（登录 / /me 用，非热路径） */
export async function getOrResolvePermissionContext(
  db: LiveDb,
  redis: RedisClientType,
  schema: string,
  userCode: string,
): Promise<PermissionContext> {
  const key = permissionKey(schema, userCode)
  const cached = await loadPermissionContext(redis, key)
  if (cached) return cached
  const version = await getPermissionVersion(redis, schema)
  const ctx = await resolvePermissionContext(db, userCode, version)
  await storePermissionContext(redis, key, ctx, PERMISSION_CACHE_TTL_SEC)
  return ctx
}
