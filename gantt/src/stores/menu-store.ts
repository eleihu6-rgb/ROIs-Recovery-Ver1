import { create } from 'zustand'
import { api } from '@/services/api'
import { MODULE_MENU, PAGE_MENU } from '@/config/menu-registry'
import { useAuthStore } from './auth-store'

export interface MenuNode {
  menuCode: string
  menuName: string
  parentMenuCode: string
  factoryName: string | null
  systemType: string
  idx: number | null
  hasAccess: boolean
  ctrls: string[]
}

interface MenuStore {
  nodes: MenuNode[] | null
  loaded: boolean
  /** 登录后拉取权限菜单树 */
  load: () => Promise<void>
  canAccessMenu: (menuCode?: string | null) => boolean
  canAccessModule: (module: string) => boolean
  canAccessPage: (pageId: string) => boolean
}

const isAdmin = (): boolean => useAuthStore.getState().user?.isAdmin === 1

export const useMenuStore = create<MenuStore>((set, get) => ({
  nodes: null,
  loaded: false,

  load: async () => {
    try {
      // http-client 拦截器已解包 data 信封 → 直接返回 { nodes }
      const data = await api.get('/api/auth/menus') as { nodes: MenuNode[] }
      set({ nodes: data.nodes ?? [], loaded: true })
    } catch {
      // 拉取失败时保持 nodes=null → canAccess* 放行（fail-open），不阻塞界面
      set({ nodes: null, loaded: true })
    }
  },

  canAccessMenu: (menuCode) => {
    if (isAdmin()) return true
    if (!menuCode) return true
    const { nodes } = get()
    if (!nodes) return true // 未加载 → 放行，避免阻塞
    const node = nodes.find((n) => n.menuCode === menuCode)
    return node ? node.hasAccess : false
  },

  canAccessModule: (module) => get().canAccessMenu(MODULE_MENU[module]),

  canAccessPage: (pageId) => get().canAccessMenu(PAGE_MENU[pageId]),
}))
