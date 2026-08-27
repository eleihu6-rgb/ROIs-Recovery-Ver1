import { AUTH_DIMENSIONS, EMPTY_SCOPE, type DataScope, type PermissionContext } from '../../types/permission.js'

/** 解析用的统一权限行：menu/ctrl/auth 三类来源扁平为一行 */
export interface PermissionRow {
  profileId: number
  menuCode: string | null
  menuHidden: string | null
  ctlCode: string | null
  ctlHidden: string | null
  authType: string | null
  authValues: unknown | null
}

/**
 * 把多角色的权限行合并为权限上下文（并集）：
 * - menus：任意档案 is_hidden != 'Y' 的 menuCode
 * - ctrls：任意档案 is_hidden != 'Y' 的 (menuCode, ctlCode)
 * - dataScope：任意档案的 auth_values jsonb 数组合并（去重保序）
 * 未配置的维度 = 空数组（不限）。
 */
export function buildPermissionContext(rows: PermissionRow[], permVersion = 1): PermissionContext {
  const menus = new Set<string>()
  const ctrls: Record<string, Set<string>> = {}
  // 注意：不能用 { ...EMPTY_SCOPE } —— 浅拷贝会共享数组引用，push 会污染 EMPTY_SCOPE 常量
  const dataScope: DataScope = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }
  const seen: Record<string, Set<string>> = {}

  for (const r of rows) {
    if (r.menuCode && r.menuHidden !== 'Y') menus.add(r.menuCode)
    if (r.ctlCode && r.ctlHidden !== 'Y' && r.menuCode) {
      ;(ctrls[r.menuCode] ??= new Set()).add(r.ctlCode)
    }
    if (
      r.authType
      && AUTH_DIMENSIONS.includes(r.authType as (typeof AUTH_DIMENSIONS)[number])
      && Array.isArray(r.authValues)
    ) {
      const dim = r.authType as keyof DataScope
      seen[dim] ??= new Set()
      for (const v of r.authValues) {
        if (typeof v === 'string' && v && !seen[dim].has(v)) {
          seen[dim].add(v)
          dataScope[dim].push(v)
        }
      }
    }
  }

  return {
    menus: [...menus],
    ctrls: Object.fromEntries(Object.entries(ctrls).map(([k, s]) => [k, [...s]])),
    dataScope,
    permVersion,
  }
}
