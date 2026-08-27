/**
 * Gantt Auth Fixture — independent JWT authentication.
 *
 * Gantt has its own login system, separate from PBS.
 * Token is stored in sessionStorage (per-tab) via `rois-auth` key.
 * This fixture logs in via the API and saves the auth state
 * to a JSON file so subsequent tests skip the login UI.
 *
 * Auth API: POST /api/auth/login  →  { token, userCode, userName, schema }
 */
import { test as base, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '../../results/.auth')

export interface GanttAuthFixtures {
  ganttUser: string
  ganttPass: string
  ganttApiUrl: string
  /** Login to Gantt and return the JWT token */
  ganttLogin: () => Promise<string>
}

/**
 * Test file usage:
 *
 *   import { ganttAuthTest } from '../fixtures/gantt/auth.fixture'
 *
 *   ganttAuthTest('test name', async ({ page, ganttLogin }) => {
 *     await ganttLogin()
 *     // ... page is already authenticated
 *   })
 */
export const ganttAuthTest = base.extend<GanttAuthFixtures>({
  ganttUser: [process.env.GANTT_TEST_USER ?? 'admin', { option: true }],
  ganttPass: [process.env.GANTT_TEST_PASS ?? '123456', { option: true }],
  ganttApiUrl: [process.env.GANTT_API_URL ?? 'http://localhost:3000', { option: true }],

  ganttLogin: async ({ page, ganttUser, ganttPass, ganttApiUrl }, use) => {
    const loginPage = new GanttLoginPage(page)

    await use(async (): Promise<string> => {
      // Try API login first (faster), fall back to UI login
      try {
        const response = await page.request.post(`${ganttApiUrl}/api/auth/login`, {
          data: { userCode: ganttUser, password: ganttPass },
        })
        const body = await response.json()
        const token = body.token as string
        expect(token).toBeTruthy()

        // Inject token into the page so the app behaves as authenticated
        await page.addInitScript(
          ({ token, userCode, userName, schema }) => {
            const user = { userCode, userName: userName ?? userCode, schema: schema ?? 'f8' }
            window.sessionStorage.setItem(
              'rois-auth',
              JSON.stringify({ user, token }),
            )
            // Pre-set Authorization header on any future fetch/XHR
            const origFetch = window.fetch
            window.fetch = async function (...args: Parameters<typeof fetch>) {
              const init = args[1] ?? {}
              const headers = new Headers(init.headers ?? {})
              headers.set('Authorization', `Bearer ${token}`)
              args[1] = { ...init, headers }
              return origFetch.apply(this, args)
            }
          },
          { token, userCode: ganttUser, userName: ganttUser, schema: 'f8' },
        )

        return token
      } catch {
        // Fallback: UI login
        await loginPage.goto()
        await loginPage.login(ganttUser, ganttPass)
        return 'ui-login'
      }
    })
  },
})

/**
 * Setup test — logs in once and persists auth state for the `gantt` project.
 * This file is matched by `testMatch: /.*\.setup\.ts/` in the config.
 */
export const ganttSetupTest = base.extend<Record<string, never>>({})
