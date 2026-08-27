/**
 * Gantt Auth Setup — logs in once and persists auth state.
 *
 * This file is matched by `testMatch: /.*\.setup\.ts/` in Playwright config.
 * It runs before all other Gantt tests and saves the authenticated state
 * to a JSON file for reuse.
 *
 * Auth isolation: Gantt uses its own JWT system (sessionStorage: rois-auth).
 * This does NOT share state with PBS auth.
 */
import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.join(__dirname, '../../results/.auth/gantt-admin.json')

const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

setup('authenticate as Gantt admin', async ({ page, request }) => {
  // Login via API to get token
  const response = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`)
  }

  const body = await response.json() as {
    data: { token: string; userCode: string; userName: string; schema: string; isAdmin?: number }
  }
  const auth = body.data
  const token = auth.token

  // Navigate to the app first
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')

  // Inject auth into sessionStorage via evaluate
  await page.evaluate(
    ({ token, userCode, userName, schema, isAdmin }) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode, userName, schema, isAdmin: isAdmin ?? 0 },
          token,
        }),
      )
    },
    { token, userCode: auth.userCode, userName: auth.userName, schema: auth.schema, isAdmin: auth.isAdmin },
  )

  // Reload to apply auth state
  await page.reload()
  await page.waitForLoadState('networkidle')

  // Verify we're logged in (login page should NOT be visible)
  const loginButton = page.getByTestId('login-sign-in')
  const isLoggedIn = await loginButton.isVisible().catch(() => false)

  if (isLoggedIn) {
    throw new Error('Auth injection failed - still on login page')
  }

  // Save cookies (if any) and localStorage state
  await page.context().storageState({ path: AUTH_FILE })
})
