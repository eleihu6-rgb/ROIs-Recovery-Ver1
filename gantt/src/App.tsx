import { Component, type ReactNode, useEffect, useState } from 'react'
import { I18nProvider } from '@rois/ui'
import { AppShell } from '@/components/shell/app-shell'
import { LoginPage } from '@/components/auth/login-page'
import { SessionTimeoutDialog } from '@/components/auth/session-timeout-dialog'
import { useThemeStore } from '@/stores/theme-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRankActingStore } from '@/stores/rank-acting-store'
import { maybeReloadForChunkLoadError } from '@/utils/chunk-load-recovery'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }

  componentDidCatch(error: Error) {
    maybeReloadForChunkLoadError(error, { buildId: __APP_VERSION__ })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: 20, color: 'red' }}>Render Error</h1>
          <pre style={{ background: '#f5f5f5', padding: 16, whiteSpace: 'pre-wrap' }}>
            {this.state.error}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

function AuthenticatedApp() {
  // Suppress browser native context menu over canvas areas and custom popup menus.
  // Capture phase on window — fires before any React or DOM bubble-phase handler.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target) return
      if (
        target.tagName === 'CANVAS' ||
        target.closest?.('[data-gantt-area]')
      ) {
        e.preventDefault()
      }
    }
    window.addEventListener('contextmenu', handler, true)
    return () => window.removeEventListener('contextmenu', handler, true)
  }, [])

  return <AppShell />
}

function App() {
  const user = useAuthStore((s) => s.user)
  const restore = useAuthStore((s) => s.restore)
  const completeSso = useAuthStore((s) => s.completeSso)
  const [restoring, setRestoring] = useState(true)

  const loadTheme = useThemeStore((s) => s.loadFromStorage)
  useEffect(() => { loadTheme() }, [loadTheme])

  // One-time fetch of rank_acting for the active schema. Used by the drag-drop
  // pre-check (validateAssignment). Idempotent — re-runs on schema change.
  useEffect(() => {
    if (user?.schema) {
      void useRankActingStore.getState().loadForFiliale(user.schema)
    }
  }, [user?.schema])

  // 启动时若 URL 带 Azure SSO 回调 token，先在 loading 阶段完成登录再渲染，
  // 避免「先闪现登录页、再跳首页」（回归见 e2e/tests/gantt/auth/sso-login.spec.ts）。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    async function boot() {
      await restore()
      if (token && !useAuthStore.getState().token) {
        await completeSso(token)
      }
      // 消费后清除 URL 里的 token，避免留在浏览器历史 / 刷新时重复登录
      if (params.has('token')) {
        history.replaceState({}, '', window.location.pathname)
      }
      setRestoring(false)
    }
    boot()
  }, [restore, completeSso])

  if (restoring) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <I18nProvider>
      <ErrorBoundary>
        {user ? (
          <>
            <AuthenticatedApp />
            <SessionTimeoutDialog />
          </>
        ) : (
          <LoginPage />
        )}
      </ErrorBoundary>
    </I18nProvider>
  )
}

export default App
