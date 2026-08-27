import type { ReactNode } from 'react'
import { usePermission } from '@/hooks/use-permission'

interface PermissionGateProps {
  /** 菜单代码；为空 = 不限制菜单 */
  menuCode?: string
  /** 按钮代码；为空 = 只查菜单，非空 = 查菜单+按钮 */
  ctlCode?: string
  /** 无权限时渲染的替代内容（默认 null） */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * 按钮/元素权限门禁：无权限时不渲染 children（渲染 fallback）。
 * 用法：<PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_SAVE"><Button/></PermissionGate>
 */
export function PermissionGate({ menuCode, ctlCode, fallback = null, children }: PermissionGateProps): ReactNode {
  const { canAccessMenu, canAccessCtl } = usePermission()
  const allowed = canAccessMenu(menuCode) && (ctlCode ? canAccessCtl(menuCode ?? '', ctlCode) : true)
  return allowed ? <>{children}</> : <>{fallback}</>
}
