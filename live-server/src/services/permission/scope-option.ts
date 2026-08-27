import type { RedisClientType } from 'redis'
import type { drizzle } from 'drizzle-orm/node-postgres'
import type { AuthPayload } from '../../services/auth/session-auth.js'
import { getOrResolvePermissionContext } from './permission-service.js'
import type { DataScope } from '../../types/permission.js'

type LiveDb = ReturnType<typeof drizzle>

export const NO_SCOPE: DataScope = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }

/** 维度白名单判定：空数组 = 不限；否则精确匹配 */
export function isInScope(scope: DataScope, dim: keyof DataScope, value: string): boolean {
  const allowed = scope[dim]
  return allowed.length === 0 || allowed.includes(value)
}

/** 按某维度过滤列表（查询界面/选择器数据源收窄用） */
export function filterByScope<T>(items: T[], scope: DataScope, dim: keyof DataScope, getValue: (item: T) => string): T[] {
  return items.filter((item) => isInScope(scope, dim, getValue(item)))
}

/**
 * 解析请求级 dataScope：未登录或 is_admin 返回空（不限）。
 * 选项类接口在返回前用它收窄数据源。仅收窄下拉数据源，不强制过滤实际数据。
 */
export async function resolveRequestDataScope(
  db: LiveDb,
  redis: RedisClientType,
  authUser: AuthPayload | undefined,
): Promise<DataScope> {
  if (!authUser || authUser.isAdmin === 1) return { ...NO_SCOPE }
  const ctx = await getOrResolvePermissionContext(db, redis, authUser.schema, authUser.userCode)
  return ctx.dataScope
}
