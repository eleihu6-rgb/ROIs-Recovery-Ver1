import { useAuthStore } from '@/stores/auth-store'
import type { PermissionInfo } from '@/stores/auth-store'

/**
 * 权限判定纯函数（可单测）：
 * - isAdmin → 全放行
 * - menuCode 为空/undefined → 不限菜单
 * - ctlCode 为空 → 只查菜单；非空 → 查 (menuCode, ctlCode)
 */
export function evaluatePermission(params: {
  isAdmin: boolean
  menus: string[]
  ctrls: Record<string, string[]>
  menuCode?: string | null
  ctlCode?: string | null
}): boolean {
  if (params.isAdmin) return true
  if (!params.menuCode) return true
  if (!params.menus.includes(params.menuCode)) return false
  if (params.ctlCode) return (params.ctrls[params.menuCode] ?? []).includes(params.ctlCode)
  return true
}

/**
 * 按钮/元素权限 hook：读 auth-store 的 permissions（登录/me 时下发）。
 * canAccessMenu(menuCode) / canAccessCtl(menuCode, ctlCode)。
 */
export const usePermission = (): {
  canAccessMenu: (menuCode?: string | null) => boolean
  canAccessCtl: (menuCode: string, ctlCode: string) => boolean
} => {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === 1)
  const permissions = useAuthStore((s) => s.permissions)

  const canAccessMenu = (menuCode?: string | null): boolean =>
    evaluatePermission({
      isAdmin,
      menus: permissions?.menus ?? [],
      ctrls: permissions?.ctrls ?? {},
      menuCode,
    })

  const canAccessCtl = (menuCode: string, ctlCode: string): boolean =>
    evaluatePermission({
      isAdmin,
      menus: permissions?.menus ?? [],
      ctrls: permissions?.ctrls ?? {},
      menuCode,
      ctlCode,
    })

  return { canAccessMenu, canAccessCtl }
}

export type { PermissionInfo }
