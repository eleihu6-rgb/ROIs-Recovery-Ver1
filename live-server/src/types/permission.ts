// 权限上下文类型定义（live-server 权限控制系统）

/** 数据权限维度（auth_type 枚举） */
export const AUTH_DIMENSIONS = ['FILIALE', 'DIVISION', 'CREW_DEPARTMENT', 'RANK', 'FLEET'] as const

/** 数据权限范围：每个维度是白名单值数组，空数组 = 该维度不限 */
export interface DataScope {
  FILIALE: string[]
  DIVISION: string[]
  CREW_DEPARTMENT: string[]
  RANK: string[]
  FLEET: string[]
}

export const EMPTY_SCOPE: DataScope = {
  FILIALE: [],
  DIVISION: [],
  CREW_DEPARTMENT: [],
  RANK: [],
  FLEET: [],
}

/** 用户权限上下文：菜单可见性 + 按钮可用性 + 数据范围 */
export interface PermissionContext {
  /** 可见 menuCode 列表（含父路径） */
  menus: string[]
  /** menuCode → 可用 ctlCode 列表 */
  ctrls: Record<string, string[]>
  /** 数据权限白名单（维度内 OR、维度间 AND；空数组 = 不限） */
  dataScope: DataScope
  /** 权限版本号，权限变更后递增，用于失效旧会话缓存 */
  permVersion: number
}

/** 权限变更时的失效信号（配合 permVersion 使用） */
export const PERMISSION_CACHE_TTL_SEC = 60
export const PERMISSION_MEMORY_TTL_MS = 30_000
