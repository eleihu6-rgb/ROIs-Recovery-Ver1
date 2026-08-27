import { create } from 'zustand'
import { api, getLastActivityAt, resetActivity, setOnUnauthorized } from '@/services/api'

const STORAGE_KEY = 'rois-auth'

/** Session idle timeout: 1 hour (ms) */
const IDLE_TIMEOUT = 60 * 60 * 1000
/** Warning countdown before forced logout: 3 minutes (ms) */
const WARNING_DURATION = 3 * 60 * 1000
/** How often we check idle state (every 30s) */
const CHECK_INTERVAL = 30_000

interface AuthUser {
  userCode: string
  userName: string
  schema: string
  isAdmin: number
}

/** 权限上下文（登录 / /me 下发），P2 动态导航/按钮权限消费 */
export interface PermissionInfo {
  menus: string[]
  ctrls: Record<string, string[]>
  dataScope: {
    FILIALE: string[]
    DIVISION: string[]
    CREW_DEPARTMENT: string[]
    RANK: string[]
    FLEET: string[]
  }
}

interface AuthStore {
  /** Current authenticated user (null if not logged in) */
  user: AuthUser | null
  /** JWT token */
  token: string | null
  /** 登录时下发的权限上下文（菜单/按钮/数据范围） */
  permissions: PermissionInfo | null
  /** Whether login is in progress */
  loading: boolean
  /** Last login error message */
  error: string | null

  /** Whether the idle-timeout warning dialog is visible */
  showTimeoutWarning: boolean
  /** Timestamp when the warning will expire (forced logout) */
  warningExpiresAt: number | null

  /** Login with userCode + password */
  login: (userCode: string, password: string) => Promise<boolean>
  /** Complete Azure SSO login: exchange the SSO callback token for a session */
  completeSso: (token: string) => Promise<boolean>
  /** Logout and clear session */
  logout: () => void
  /** Restore session from sessionStorage (per-tab) */
  restore: () => Promise<boolean>

  /** Start idle-timeout monitoring (call after login/restore) */
  startIdleMonitor: () => void
  /** Stop idle-timeout monitoring */
  stopIdleMonitor: () => void
  /** User clicked "Stay Logged In" on the warning dialog */
  dismissWarning: () => void
}

let idleTimer: ReturnType<typeof setInterval> | null = null
let forceLogoutTimer: ReturnType<typeof setTimeout> | null = null

export const useAuthStore = create<AuthStore>((set, get) => {
  // Register 401 handler — when backend rejects token, force logout
  setOnUnauthorized(() => {
    const { user } = get()
    if (user) get().logout()
  })

  return {
  user: null,
  token: null,
  permissions: null,
  loading: false,
  error: null,
  showTimeoutWarning: false,
  warningExpiresAt: null,

  login: async (userCode, password) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post('/api/auth/login', { userCode, password })
      const data = res as unknown as {
        token: string
        userCode: string
        userName: string
        schema: string
        isAdmin: number
        menus?: string[]
        ctrls?: Record<string, string[]>
        dataScope?: PermissionInfo['dataScope']
      }
      const user: AuthUser = { userCode: data.userCode, userName: data.userName, schema: data.schema, isAdmin: data.isAdmin ?? 0 }
      const token = data.token
      const permissions: PermissionInfo = {
        menus: data.menus ?? [],
        ctrls: data.ctrls ?? {},
        dataScope: data.dataScope ?? { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      }

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }))
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      resetActivity()

      set({ user, token, permissions, loading: false, error: null })
      get().startIdleMonitor()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      set({ loading: false, error: message })
      return false
    }
  },

  completeSso: async (token) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post('/api/auth/sso/callback', { token })
      const data = res as unknown as {
        token: string
        userCode: string
        userName: string
        schema: string
        isAdmin: number
        menus?: string[]
        ctrls?: Record<string, string[]>
        dataScope?: PermissionInfo['dataScope']
      }
      const user: AuthUser = { userCode: data.userCode, userName: data.userName, schema: data.schema, isAdmin: data.isAdmin ?? 0 }
      const permissions: PermissionInfo = {
        menus: data.menus ?? [],
        ctrls: data.ctrls ?? {},
        dataScope: data.dataScope ?? { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      }

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token: data.token }))
      api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
      resetActivity()

      set({ user, token: data.token, permissions, loading: false, error: null })
      get().startIdleMonitor()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SSO login failed'
      set({ loading: false, error: message })
      return false
    }
  },

  logout: () => {
    const hasServerSession = Boolean(get().token)
    get().stopIdleMonitor()
    if (hasServerSession) {
      void api.delete('/api/auth/session').catch(() => undefined)
    }
    sessionStorage.removeItem(STORAGE_KEY)
    delete api.defaults.headers.common['Authorization']
    set({ user: null, token: null, permissions: null, error: null, showTimeoutWarning: false, warningExpiresAt: null })
  },

  restore: async () => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return false

    try {
      const { user, token } = JSON.parse(stored) as { user: AuthUser; token: string }
      if (!user || !token) return false

      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      const res = await api.get('/api/auth/me')
      const data = res as unknown as {
        user: { userCode: string; userName: string; schema: string; isAdmin: number }
        menus?: string[]
        ctrls?: Record<string, string[]>
        dataScope?: PermissionInfo['dataScope']
      }
      const me = data.user
      const freshUser: AuthUser = { userCode: me.userCode, userName: me.userName, schema: me.schema, isAdmin: me.isAdmin ?? 0 }
      const permissions: PermissionInfo = {
        menus: data.menus ?? [],
        ctrls: data.ctrls ?? {},
        dataScope: data.dataScope ?? { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      }
      resetActivity()
      set({ user: freshUser, token, permissions })
      get().startIdleMonitor()
      return true
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
      delete api.defaults.headers.common['Authorization']
      return false
    }
  },

  startIdleMonitor: () => {
    // Clear any existing timer
    get().stopIdleMonitor()

    idleTimer = setInterval(() => {
      const { user, showTimeoutWarning } = get()
      if (!user || showTimeoutWarning) return

      const idleMs = Date.now() - getLastActivityAt()
      if (idleMs >= IDLE_TIMEOUT) {
        // Show warning, start 3-minute forced logout countdown
        const expiresAt = Date.now() + WARNING_DURATION
        set({ showTimeoutWarning: true, warningExpiresAt: expiresAt })

        forceLogoutTimer = setTimeout(() => {
          get().logout()
        }, WARNING_DURATION)
      }
    }, CHECK_INTERVAL)
  },

  stopIdleMonitor: () => {
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null }
    if (forceLogoutTimer) { clearTimeout(forceLogoutTimer); forceLogoutTimer = null }
  },

  dismissWarning: () => {
    // User chose to stay — reset activity and hide warning
    if (forceLogoutTimer) { clearTimeout(forceLogoutTimer); forceLogoutTimer = null }
    resetActivity()
    set({ showTimeoutWarning: false, warningExpiresAt: null })
  },
}})
