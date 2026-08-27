import { and, eq, isNotNull, ne } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { systemMenu } from '../../models/index.js'
import type { PermissionContext } from '../../types/permission.js'

/** api_uris 索引规则：一条规则对应一个菜单读接口或一个按钮动作接口 */
export interface ApiRule {
  pattern: string
  menuCode: string | null
  ctlCode: string | null
}

/** 403 权限失败码（区分菜单/按钮/会话失效/管理接口） */
export const PERMISSION_CODES = {
  MENU: 'PERM_MENU',
  CTRL: 'PERM_CTRL',
  STALE: 'SESSION_STALE',
  MANAGE: 'PERM_MANAGE',
} as const

/** 管理接口前缀：兜底门禁（未登记 api_uris 的 /api/admin/* 也拒绝，防绕过） */
const MANAGEMENT_PREFIX = '/api/admin/'

/**
 * 归一化请求路径：
 * - '/altair/live/api/x' / '/dev/live/api/x' → '/api/x'（去代理前缀）
 * - '/api/x' 保持原样
 */
export function normalizeApiPath(rawPath: string): string {
  const p = rawPath.split('?')[0]
  const m = p.match(/^\/[^/]+\/live(?=\/api\/)/i)
  return m ? p.slice(m[0].length) : p
}

/** 通配匹配：pattern 中 '*' 匹配任意字符序列（含 /） */
export function matchApiRule(rules: ApiRule[], path: string): ApiRule | null {
  for (const r of rules) {
    const escaped = r.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')
    if (new RegExp(`^${escaped}$`).test(path)) return r
  }
  return null
}

/** 启动时从 system_menu 加载菜单与按钮的 api_uris 索引（内存） */
export async function loadApiRules(db: NodePgDatabase<Record<string, unknown>>): Promise<ApiRule[]> {
  const menuRows = await db
    .select({ apiUris: systemMenu.apiUris, menuCode: systemMenu.menuCode })
    .from(systemMenu)
    .where(and(isNotNull(systemMenu.apiUris), ne(systemMenu.systemType, 'B')))
  const ctrlRows = await db
    .select({ apiUris: systemMenu.apiUris, menuCode: systemMenu.parentMenuCode, ctlCode: systemMenu.menuCode })
    .from(systemMenu)
    .where(and(isNotNull(systemMenu.apiUris), eq(systemMenu.systemType, 'B')))

  const rules: ApiRule[] = []
  for (const r of menuRows) for (const p of splitUris(r.apiUris)) rules.push({ pattern: p, menuCode: r.menuCode, ctlCode: null })
  for (const r of ctrlRows) for (const p of splitUris(r.apiUris)) rules.push({ pattern: p, menuCode: r.menuCode, ctlCode: r.ctlCode })
  return rules
}

function splitUris(s: string | null): string[] {
  return (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
}

export interface PermissionDecision {
  /** pass=true 放行；否则返回的 code/message 用于 403 响应 */
  pass: boolean
  code?: (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES]
  message?: string
}

/**
 * 鉴权判定（纯函数，可单测）：
 * - 命中 ctrl 规则 → 校验 ctx.ctrls[menuCode] 含 ctlCode
 * - 命中菜单规则 → 校验 ctx.menus 含 menuCode
 * - 未命中规则 → 放行（fail-open，防误伤）
 */
export function decidePermission(params: {
  isAdmin: number
  jwtPermVersion?: number
  path: string
  rules: ApiRule[]
  ctx: PermissionContext
}): PermissionDecision {
  if (params.isAdmin === 1) return { pass: true }
  if (typeof params.jwtPermVersion === 'number' && params.jwtPermVersion !== params.ctx.permVersion) {
    return { pass: false, code: PERMISSION_CODES.STALE, message: 'Permissions changed. Please login again.' }
  }
  const rule = matchApiRule(params.rules, normalizeApiPath(params.path))
  if (!rule) {
    // 兜底：未登记的管理接口也拒绝（非 admin 一律 403），防止绕过前端直调
    if (normalizeApiPath(params.path).startsWith(MANAGEMENT_PREFIX)) {
      return { pass: false, code: PERMISSION_CODES.MANAGE, message: 'Management access denied.' }
    }
    return { pass: true }
  }
  if (rule.ctlCode) {
    const allowed = rule.menuCode ? (params.ctx.ctrls[rule.menuCode] ?? []) : []
    if (!allowed.includes(rule.ctlCode)) {
      return { pass: false, code: PERMISSION_CODES.CTRL, message: 'No permission for this action.' }
    }
    return { pass: true }
  }
  if (rule.menuCode && !params.ctx.menus.includes(rule.menuCode)) {
    return { pass: false, code: PERMISSION_CODES.MENU, message: 'Menu not accessible.' }
  }
  return { pass: true }
}
