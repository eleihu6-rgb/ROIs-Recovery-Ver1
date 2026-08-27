import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react'
import { useCredentialAutofillSync } from '@rois/ui'
import { useAuthStore } from '@/stores/auth-store'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { publicConfigService } from '@/services/public-config-service'
import { LIVE_API_BASE, SSO_LOGIN_URL } from '@/config/api-paths'

import flairCover from '@/assets/images/login-cover.png'
import flairLogo from '@/assets/images/logo/f8-transparent.png'

const ALTAIR_USER_CODE_FIELD = 'altairUserCode'
const ALTAIR_PASSWORD_FIELD = 'altairPassword'
const ALTAIR_LOGIN_ACTION = `${LIVE_API_BASE}/api/auth/login`

export const LoginPage = () => {
  const [userCode, setUserCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [defaultAirline, setDefaultAirline] = useState<string | null>(null)
  // Local error display — mirrors store error but clears immediately on retype
  const [displayError, setDisplayError] = useState<string | null>(null)
  const shakeRef = useRef<HTMLDivElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const storeError = useAuthStore((s) => s.error)
  const [ssoSubmitting, setSsoSubmitting] = useState(false)

  // Azure SSO 回调错误展示。`?token=` 的登录完成已上提到 App 启动阶段
  // （App.tsx boot 完成 completeSso，避免「先闪现登录页、再跳首页」）；
  // 登录页只在 SSO 失败（`?sso_error=`）时出现并展示原因。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ssoError = params.get('sso_error')
    if (ssoError) {
      setDisplayError(ssoError === 'user_not_found'
        ? 'This account is not linked. Contact your administrator.'
        : 'SSO sign-in failed. Please try again.')
    }
  }, [])

  useCredentialAutofillSync({
    formRef,
    fields: [
      { name: ALTAIR_USER_CODE_FIELD, value: userCode, onValueChange: setUserCode },
      { name: ALTAIR_PASSWORD_FIELD, value: password, onValueChange: setPassword },
    ],
  })

  // Sync store error → displayError and trigger shake
  useEffect(() => {
    if (!storeError) return
    setDisplayError(storeError)
    const el = shakeRef.current
    if (!el) return
    el.style.animation = 'none'
    // Force reflow so the animation restarts even if same error fires twice
    void el.offsetHeight
    el.style.animation = 'login-shake 320ms ease'
  }, [storeError])

  useEffect(() => {
    publicConfigService.fetch().then((config) => {
      setDefaultAirline(config.airline)
    }).catch(() => {
      setDefaultAirline(null)
    })
  }, [])

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserCode(e.target.value)
    setDisplayError(null)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
    setDisplayError(null)
  }

  // On Enter in username field: advance focus to password if it's empty
  const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !password) {
      e.preventDefault()
      passwordRef.current?.focus()
    }
  }

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const u = userCode.trim()
    const p = password
    if (!u || !p || loading) return
    await login(u, p)
  }, [userCode, password, login, loading])

  const handleSsoSubmit = () => {
    if (ssoSubmitting) return
    setDisplayError(null)
    setSsoSubmitting(true)
    window.location.assign(SSO_LOGIN_URL)
  }

  const canSubmit = userCode.trim().length > 0 && password.trim().length > 0 && !loading

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden"
      style={{ '--login-accent': '#4ade80' } as React.CSSProperties}
    >
      {/* Cover photo */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${flairCover})` }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.58) 100%)',
        }}
      />

      {/* Customer logo */}
      <div className="absolute right-9 top-7 z-10">
        <img
          src={flairLogo}
          alt={defaultAirline ?? 'Airline'}
          className="h-11 w-auto"
          style={{
            filter: 'invert(1) brightness(1.15) drop-shadow(0 1px 8px rgba(0,0,0,0.45))',
            opacity: 0.9,
          }}
        />
      </div>

      {/* Login card — entrance animation + shake wrapper */}
      <div
        className="absolute right-9 top-24 z-10 w-[310px] rounded-xl p-6"
        style={{
          background: 'rgba(0,0,0,0.08)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
          animation: 'login-card-in 280ms ease-out both',
        }}
      >
        {/* Shake wrapper — only the form content shakes, not the whole card */}
        <div ref={shakeRef}>
          <p className="text-sm font-bold text-white">Sign in</p>
          <p className="mb-5 mt-1 text-2xs text-white/60">Enter your credentials to continue</p>

          <form
            ref={formRef}
            id="altair-login-form"
            name="altair-login-form"
            action={ALTAIR_LOGIN_ACTION}
            autoComplete="on"
            method="post"
            onSubmit={handleSubmit}
            className="space-y-3"
          >
            {/* User Name */}
            <div>
              <label
                htmlFor="login-username"
                className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.14em] text-white/60"
              >
                User Name
              </label>
              <input
                id="login-username"
                name={ALTAIR_USER_CODE_FIELD}
                type="text"
                autoComplete="section-altair username"
                value={userCode}
                onChange={handleUsernameChange}
                onKeyDown={handleUsernameKeyDown}
                placeholder="e.g. Ryan"
                autoFocus
                data-testid="login-user-code"
                className="h-9 w-full rounded-lg border border-white/20 bg-white/8 pl-3 pr-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-white/35"
              />
            </div>

            {/* Password with show/hide toggle */}
            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.14em] text-white/60"
              >
                Password
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="login-password"
                  name={ALTAIR_PASSWORD_FIELD}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="section-altair current-password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Enter password"
                  data-testid="login-password"
                  className="h-9 w-full rounded-lg border border-white/20 bg-white/8 pl-3 pr-9 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-white/35"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  data-testid="login-show-hide"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword
                    ? <EyeOff className="h-3.5 w-3.5 shrink-0" />
                    : <Eye className="h-3.5 w-3.5 shrink-0" />
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {displayError && (
              <div
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.3)' }}
                data-testid="login-error"
              >
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                <span className="text-2xs font-medium text-red-300">{displayError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              data-testid="login-sign-in"
              className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:pointer-events-none disabled:opacity-40"
              style={{ background: '#16a34a' }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
            <button
              type="button"
              onClick={handleSsoSubmit}
              disabled={ssoSubmitting}
              data-testid="login-sso"
              className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/25 text-sm font-semibold text-white transition-colors hover:border-white/50 disabled:pointer-events-none disabled:opacity-40"
            >
              {ssoSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                'SSO Login'
              )}
            </button>
          </form>

          <div className="my-4 border-t border-white/10" />

          <p className="text-2xs leading-relaxed text-white/45">
            Usernames are not case-sensitive.
          </p>
        </div>
      </div>

      {/* ROIS wordmark */}
      <div className="absolute bottom-12 left-12 z-10">
        <div
          className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.28em]"
          style={{ color: 'var(--login-accent)' }}
        >
          <span
            className="inline-block h-0.5 w-6 rounded"
            style={{ background: 'var(--login-accent)' }}
          />
          Altair
        </div>
        <h1
          className="font-bold leading-none tracking-tight text-white"
          style={{ fontSize: '72px', textShadow: '0 2px 24px rgba(0,0,0,0.3)' }}
        >
          ROIS<span style={{ color: 'var(--login-accent)' }}>.</span>
        </h1>
        <p className="mt-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white/50">
          Intelligent Crew Resource Optimization
        </p>
      </div>

      {/* Footer */}
      <div className="absolute bottom-5 right-9 z-10 text-2xs tracking-[0.06em] text-white/25">
        © 2026 ROIS · Altair
      </div>
    </div>
  )
}
