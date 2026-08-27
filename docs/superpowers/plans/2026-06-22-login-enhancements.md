# Login Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make login case-insensitive, return distinct "user not found" vs "wrong password" messages, and polish the gantt login page UX (show/hide password, shake on error, entrance animation, Enter focus flow, error-clears-on-type, button shimmer).

**Architecture:** The case-insensitive fix lives in the backend (`auth.ts`) so every client (gantt, pbs-portal, mobile) benefits automatically. A `normalizeUserCode` helper is exported for unit testability. The frontend polish is self-contained in `login-page.tsx` — no store changes needed; a local `displayError` state shadows the store error and clears on typing. CSS keyframes go in `packages/ui/src/styles/globals.css` (the project-wide animation register).

**Tech Stack:** Fastify + Drizzle ORM (live-server) · React 19 + Zustand + Tailwind (gantt) · Playwright (e2e) · Vitest (unit)

## Global Constraints

- All new UI text in English (CLAUDE.md UI default language rule)
- No magic font sizes — use `text-xs / text-2xs / text-sm / text-base` etc. (§UI-Standard-Gate)
- No `text-[Npx]` or hardcoded `font-family` — hard gate blocks push
- Icon + text pairs use `flex items-center gap-1.5` or `gap-2`; icon `h-3.5 w-3.5` with `text-xs`, `h-4 w-4` with `text-sm`/`text-base`
- `BACKEND_VERSION` and `FRONTEND_VERSION` in `gantt/src/version.ts` must both be bumped (this PR touches both live-server and gantt)
- Run `npm run check:ui` from repo root before every frontend commit; hard violations must be 0
- Test IDs for new E2E cases: `Live-1104`, `Live-1105`, `Live-1106`, `Live-1107` (continuing from existing `Live-1103`)

---

### Task 1: Backend — `normalizeUserCode` + distinct error messages

**Files:**
- Modify: `live-server/src/routes/auth/auth.ts`
- Modify: `live-server/src/routes/auth/auth.test.ts`

**Interfaces:**
- Produces: `export function normalizeUserCode(code: string): string` — trim + lowercase, used by the route and re-exported for tests
- Produces: distinct 401 `message` strings: `"User not found. Check your username and try again."` and `"Incorrect password. Please try again."`

- [ ] **Step 1: Write the new failing test assertions**

  Open `live-server/src/routes/auth/auth.test.ts`.

  The two existing tests at the bottom currently only check `statusCode`. Add `message` assertions so they fail until the implementation provides distinct messages.

  Replace the final two `it` blocks (lines 88–99) with:

  ```ts
  it('rejects a wrong password with "Incorrect password" message', async () => {
    const app = await buildApp()
    const res = await login(app, 'TAYLOR', 'wrong-password')
    const body = res.json()
    expect(res.statusCode).toBe(401)
    expect(body.data).toBeNull()
    expect(body.message).toContain('Incorrect password')
  })

  it('rejects an unknown user code with "User not found" message', async () => {
    const app = await buildApp()
    const res = await login(app, 'Nobody', 'Our2027')
    const body = res.json()
    expect(res.statusCode).toBe(401)
    expect(body.message).toContain('User not found')
  })
  ```

- [ ] **Step 2: Run tests to confirm failures**

  ```bash
  cd live-server
  npx vitest run src/routes/auth/auth.test.ts --reporter=verbose
  ```

  Expected: the case-insensitive tests fail with `Cannot find module ./auth.js` (because `normalizeUserCode` is not yet exported), AND the message assertion tests fail.

- [ ] **Step 3: Implement `normalizeUserCode` and fix the route**

  Replace the entire body of `live-server/src/routes/auth/auth.ts` with:

  ```ts
  import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
  import { z } from 'zod'
  import { eq } from 'drizzle-orm'
  import bcrypt from 'bcryptjs'
  import jwt from 'jsonwebtoken'
  import { env } from '../../config/index.js'
  import { users } from '../../models/system/users.js'

  const SCHEMA = 'f8' // TODO: derive from request or multi-tenant config

  const loginSchema = z.object({
    userCode: z.string().min(1),
    password: z.string().min(1),
  })

  interface JwtPayload {
    userCode: string
    userName: string
    schema: string
    isAdmin: number
  }

  /** Normalize user code: trim whitespace and lowercase for case-insensitive lookup. */
  export function normalizeUserCode(code: string): string {
    return code.trim().toLowerCase()
  }

  const ok = (reply: FastifyReply, data: unknown) =>
    reply.send({ code: 200, data, message: 'ok' })

  const fail = (reply: FastifyReply, code: number, message: string) =>
    reply.status(code).send({ code, data: null, message })

  export default async function authRoutes(fastify: FastifyInstance) {
    /**
     * POST /api/auth/login
     * Body: { userCode, password }
     * Returns: { token, userCode, userName, schema }
     */
    fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = loginSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, 'userCode and password are required')

      const { userCode, password } = parsed.data
      const normalized = normalizeUserCode(userCode)

      const result = await fastify.db
        .select()
        .from(users)
        .where(eq(users.userCode, normalized))
        .limit(1)

      const user = result[0]
      if (!user) return fail(reply, 401, 'User not found. Check your username and try again.')

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) return fail(reply, 401, 'Incorrect password. Please try again.')

      const payload: JwtPayload = {
        userCode: user.userCode,
        userName: user.userName,
        schema: SCHEMA,
        isAdmin: user.isAdmin,
      }
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' })

      return ok(reply, {
        token,
        userCode: user.userCode,
        userName: user.userName,
        schema: SCHEMA,
        isAdmin: user.isAdmin,
      })
    })

    /**
     * GET /api/auth/me
     * Header: Authorization: Bearer <token>
     * Returns current user info from JWT
     */
    fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) return fail(reply, 401, 'Not authenticated')

      try {
        const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as JwtPayload
        return ok(reply, {
          userCode: payload.userCode,
          userName: payload.userName,
          schema: payload.schema,
          isAdmin: payload.isAdmin,
        })
      } catch {
        return fail(reply, 401, 'Token expired or invalid')
      }
    })
  }
  ```

- [ ] **Step 4: Run all auth tests — must pass**

  ```bash
  cd live-server
  npx vitest run src/routes/auth/auth.test.ts --reporter=verbose
  ```

  Expected: **all tests PASS** — 7 tests including 4 case-insensitive variants, wrong-password message, and user-not-found message.

- [ ] **Step 5: Commit**

  ```bash
  git add live-server/src/routes/auth/auth.ts live-server/src/routes/auth/auth.test.ts
  git commit -m "fix(auth): case-insensitive login + distinct user-not-found/wrong-password messages"
  ```

---

### Task 2: Login page CSS keyframes

**Files:**
- Modify: `packages/ui/src/styles/globals.css`

**Interfaces:**
- Produces: `@keyframes login-shake` — 6-step horizontal micro-shake, 320 ms
- Produces: `@keyframes login-card-in` — fade-in + 8 px upward slide, used by the card entrance

- [ ] **Step 1: Append keyframes to globals.css**

  At the very end of `packages/ui/src/styles/globals.css`, append:

  ```css
  /* =========================================================================
     Login page animations
     ========================================================================= */
  @keyframes login-shake {
    0%,  100% { transform: translateX(0);   }
    15%        { transform: translateX(-4px); }
    30%        { transform: translateX(4px);  }
    45%        { transform: translateX(-4px); }
    60%        { transform: translateX(4px);  }
    75%        { transform: translateX(-4px); }
    90%        { transform: translateX(2px);  }
  }

  @keyframes login-card-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0);   }
  }

  @media (prefers-reduced-motion: reduce) {
    .login-shake     { animation: none !important; }
    .login-card-in   { animation: none !important; }
  }
  ```

- [ ] **Step 2: Verify UI standard gate passes**

  ```bash
  npm run check:ui
  ```

  Expected: 0 hard violations.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/styles/globals.css
  git commit -m "style(login): add login-shake and login-card-in keyframes"
  ```

---

### Task 3: Login page UX enhancements

**Files:**
- Modify: `gantt/src/components/auth/login-page.tsx`

**Interfaces:**
- Consumes: `login-shake`, `login-card-in` keyframes from Task 2 globals.css
- Consumes: `useAuthStore` — `login`, `loading`, `error` (existing)
- Produces: `data-testid="login-show-hide"` — the Eye/EyeOff toggle button (consumed by Task 4 E2E)

- [ ] **Step 1: Replace login-page.tsx with the enhanced version**

  Write the following complete file to `gantt/src/components/auth/login-page.tsx`:

  ```tsx
  import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react'
  import { useAuthStore } from '@/stores/auth-store'
  import { Loader2, Eye, EyeOff } from 'lucide-react'
  import { publicConfigService } from '@/services/public-config-service'

  import flairCover from '@/assets/images/login-cover.png'
  import flairLogo from '@/assets/images/logo/f8-transparent.png'

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
        setDefaultAirline('F8')
      })
    }, [])

    // Autofill sync (Safari/Firefox don't fire onChange on autofill)
    useEffect(() => {
      const sync = () => {
        const form = formRef.current
        if (!form) return
        const u = (form.elements.namedItem('username') as HTMLInputElement | null)?.value
        const p = (form.elements.namedItem('password') as HTMLInputElement | null)?.value
        if (u) setUserCode((cur) => cur || u)
        if (p) setPassword((cur) => cur || p)
      }
      const t = window.setTimeout(sync, 250)
      return () => window.clearTimeout(t)
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
      const form = e.currentTarget
      const u = ((form.elements.namedItem('username') as HTMLInputElement | null)?.value ?? userCode).trim()
      const p = (form.elements.namedItem('password') as HTMLInputElement | null)?.value ?? password
      if (!u || !p || loading) return
      await login(u, p)
    }, [userCode, password, login, loading])

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

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
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
                  name="username"
                  type="text"
                  value={userCode}
                  onChange={handleUsernameChange}
                  onKeyDown={handleUsernameKeyDown}
                  placeholder="e.g. Ryan"
                  autoFocus
                  autoComplete="username"
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
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={handlePasswordChange}
                    placeholder="Enter password"
                    autoComplete="current-password"
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
            </form>

            <div className="my-4 border-t border-white/10" />

            <p className="text-2xs leading-relaxed text-white/45">
              Usernames are not case-sensitive.{' '}
              Test password:{' '}
              <span className="font-mono text-white/65">Our2027</span>
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
            Crew Scheduling System
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
          © 2026 ROIS · Crew Resource Optimization
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: Run UI standard gate**

  ```bash
  npm run check:ui
  ```

  Expected: 0 hard violations. (The `fontSize: '72px'` inline style on the `h1` is pre-existing — it is not a Tailwind class so the checker does not flag it.)

- [ ] **Step 3: Commit**

  ```bash
  git add gantt/src/components/auth/login-page.tsx
  git commit -m "feat(login): show/hide password, shake on error, entrance animation, Enter focus flow, clear-on-retype"
  ```

---

### Task 4: E2E test updates

**Files:**
- Modify: `e2e/tests/gantt/login-page-redesign.spec.ts`

**Interfaces:**
- Consumes: `data-testid="login-show-hide"` from Task 3
- Consumes: `GanttLoginPage.expectError(message)` from `e2e/pages/gantt/gantt-login-page.ts` (existing helper)
- Consumes: `TEST_ACCOUNTS.sameer` from `e2e/utils/test-data.ts` (already added in the Sameer fix)

- [ ] **Step 1: Update `login-page-redesign.spec.ts`**

  Replace the entire file with:

  ```ts
  /**
   * Login page redesign — validates full-bleed layout, auth behaviour, and UX enhancements.
   *
   * Covers:
   *  - New label "User Name" visible (not "User Code")
   *  - Login card rendered top-right, ROIS wordmark bottom-left
   *  - Ryan / Our2027 successfully authenticates
   *  - Session written to sessionStorage after login
   *  - Case-insensitive: lowercase "ryan" also logs in
   *  - Unknown user shows "User not found" message
   *  - Wrong password shows "Incorrect password" message
   *  - Error clears when user starts retyping
   *  - Show/hide password toggle changes input type
   */
  import { test, expect } from '@playwright/test'
  import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
  import { TEST_ACCOUNTS } from '../../utils/test-data'

  const USER = TEST_ACCOUNTS.ryan

  test.describe('Login page redesign', () => {
    test('Live-1272 — login page shows "User Name" label and ROIS wordmark', async ({ page }) => {
      const loginPage = new GanttLoginPage(page)
      await loginPage.goto()

      await expect(page.getByText('User Name', { exact: false })).toBeVisible()
      await expect(page.getByText('User Code', { exact: false })).not.toBeVisible()
      await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible()
      await expect(page.getByTestId('login-sign-in')).toBeDisabled()
    })

    test('Live-1102 — Ryan logs in with Our2027 and reaches the gantt shell', async ({ page }) => {
      const loginPage = new GanttLoginPage(page)
      await loginPage.goto()

      await page.getByTestId('login-user-code').fill(USER.userCode)
      await page.getByTestId('login-password').fill(USER.password)
      await expect(page.getByTestId('login-sign-in')).toBeEnabled()
      await page.getByTestId('login-sign-in').click()

      await expect(page.getByRole('heading', { name: 'ROIS' })).not.toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

      const stored = await page.evaluate(() => window.sessionStorage.getItem('rois-auth'))
      expect(stored, 'rois-auth session written').not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.user.userCode, 'logged-in user is Ryan').toBe(USER.userCode)
    })

    test('Live-1103 — wrong password shows "Incorrect password" message', async ({ page }) => {
      const loginPage = new GanttLoginPage(page)
      await loginPage.goto()

      await page.getByTestId('login-user-code').fill('Ryan')
      await page.getByTestId('login-password').fill('wrongpassword')
      await page.getByTestId('login-sign-in').click()

      await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 8_000 })
      await expect(page.getByTestId('login-error')).toContainText('Incorrect password')
      await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible()
    })

    test('Live-1104 — unknown user shows "User not found" message', async ({ page }) => {
      const loginPage = new GanttLoginPage(page)
      await loginPage.goto()

      await page.getByTestId('login-user-code').fill('NoSuchUser99')
      await page.getByTestId('login-password').fill('Our2027')
      await page.getByTestId('login-sign-in').click()

      await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 8_000 })
      await expect(page.getByTestId('login-error')).toContainText('User not found')
    })

    test('Live-1105 — lowercase "ryan" logs in (case-insensitive)', async ({ page }) => {
      const loginPage = new GanttLoginPage(page)
      await loginPage.goto()

      await page.getByTestId('login-user-code').fill('ryan')
      await page.getByTestId('login-password').fill(USER.password)
      await page.getByTestId('login-sign-in').click()

      await expect(page.getByRole('heading', { name: 'ROIS' })).not.toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
    })

    test('Live-1106 — show/hide toggle changes password input type', async ({ page }) => {
      const loginPage = new GanttLoginPage(page)
      await loginPage.goto()

      const passwordInput = page.getByTestId('login-password')
      const toggle = page.getByTestId('login-show-hide')

      // Default: hidden
      await expect(passwordInput).toHaveAttribute('type', 'password')

      // Click to show
      await toggle.click()
      await expect(passwordInput).toHaveAttribute('type', 'text')

      // Click to hide again
      await toggle.click()
      await expect(passwordInput).toHaveAttribute('type', 'password')
    })

    test('Live-1107 — error banner clears when user starts retyping', async ({ page }) => {
      const loginPage = new GanttLoginPage(page)
      await loginPage.goto()

      // Cause an error
      await page.getByTestId('login-user-code').fill('Ryan')
      await page.getByTestId('login-password').fill('wrongpassword')
      await page.getByTestId('login-sign-in').click()
      await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 8_000 })

      // Start retyping — error must disappear
      await page.getByTestId('login-password').fill('O')
      await expect(page.getByTestId('login-error')).not.toBeVisible()
    })
  })
  ```

- [ ] **Step 2: Run the E2E tests**

  ```bash
  npx playwright test e2e/tests/gantt/login-page-redesign.spec.ts --reporter=list
  ```

  Expected: all 7 tests PASS. If the gantt app is not already running, start it first:
  ```bash
  cd gantt && npm run dev
  ```
  and in a separate terminal start live-server:
  ```bash
  cd live-server && npm run dev
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add e2e/tests/gantt/login-page-redesign.spec.ts
  git commit -m "test(login): case-insensitive + distinct errors + show/hide + clear-on-retype E2E"
  ```

---

### Task 5: Version bump

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump BACKEND_VERSION and FRONTEND_VERSION**

  In `gantt/src/version.ts`, change:
  - `BACKEND_VERSION = 159` → `BACKEND_VERSION = 160`
  - `FRONTEND_VERSION = 305` → `FRONTEND_VERSION = 306`

  Update the comment on each line:
  ```ts
  export const BACKEND_VERSION = 160  // auth: case-insensitive login + distinct user-not-found/wrong-password messages
  export const FRONTEND_VERSION = 306  // login UX: show/hide password, shake on error, entrance animation, Enter focus flow, clear-on-retype
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add gantt/src/version.ts
  git commit -m "chore(version): B160/F306 — login enhancements (case-insensitive auth + UX polish)"
  ```
