import { useAuthStore } from '@/stores/auth-store'
import type { PermissionInfo } from '@/stores/auth-store'

export type ScopeDimension = keyof PermissionInfo['dataScope']

/** 纯函数：按 dataScope 判定值是否在范围内（维度内 OR；未配置维度=不限；admin 全放行） */
export function isValueInScope(params: {
  isAdmin: boolean
  scope: PermissionInfo['dataScope'] | undefined
  dim: ScopeDimension
  value: string
}): boolean {
  if (params.isAdmin) return true
  const allowed = params.scope?.[params.dim] ?? []
  return allowed.length === 0 || allowed.includes(params.value)
}

/** 纯函数：过滤 SelectOption 列表 */
export function filterOptionsByScope<T extends { value: string }>(
  isAdmin: boolean,
  scope: PermissionInfo['dataScope'] | undefined,
  dim: ScopeDimension,
  options: T[],
): T[] {
  return options.filter((o) => isValueInScope({ isAdmin, scope, dim, value: o.value }))
}

/**
 * 查询界面可选项收窄 hook：按当前用户 dataScope（登录/me 时下发）过滤下拉选项。
 * - 仅收窄可选项，不强制过滤实际加载数据（Gantt 数据加载不设数据权限）
 */
export const useScopedOptions = (): {
  inScope: (dim: ScopeDimension, value: string) => boolean
  filterOptions: <T extends { value: string }>(dim: ScopeDimension, options: T[]) => T[]
} => {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === 1)
  const permissions = useAuthStore((s) => s.permissions)

  const inScope = (dim: ScopeDimension, value: string): boolean =>
    isValueInScope({ isAdmin, scope: permissions?.dataScope, dim, value })

  const filterOptions = <T extends { value: string }>(dim: ScopeDimension, options: T[]): T[] =>
    filterOptionsByScope(isAdmin, permissions?.dataScope, dim, options)

  return { inScope, filterOptions }
}
