/**
 * PBS Auth Fixture — shared JWT authentication for PBS Portal & PBS App.
 *
 * PBS Portal and PBS App share the same backend (pbs-server) and auth system.
 * Token is stored in localStorage via `auth-token` key.
 * This fixture logs in via the API and saves the auth state
 * to a JSON file so subsequent tests skip the login UI.
 *
 * Auth API: GET /auth/password-public-key, then encrypted POST /auth/session.
 */
import { test as base, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { loginToPbsApi } from '../../utils/pbs/auth'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface PbsAuthFixtures {
  pbsUser: string
  pbsPass: string
  pbsApiUrl: string
  /** Login to PBS and return the JWT token */
  pbsLogin: () => Promise<string>
}

/**
 * Test file usage:
 *
 *   import { pbsAuthTest } from '../fixtures/pbs/auth.fixture'
 *
 *   pbsAuthTest('test name', async ({ page, pbsLogin }) => {
 *     await pbsLogin()
 *     // ... page is already authenticated
 *   })
 */
export const pbsAuthTest = base.extend<PbsAuthFixtures>({
  pbsUser: [process.env.PBS_TEST_USER ?? 'admin', { option: true }],
  pbsPass: [process.env.PBS_TEST_PASS ?? '123456', { option: true }],
  pbsApiUrl: [process.env.PBS_API_URL ?? 'http://localhost:3002', { option: true }],

  pbsLogin: async ({ page, pbsUser, pbsPass, pbsApiUrl }, use) => {
    const loginPage = new PbsLoginPage(page)

    await use(async (): Promise<string> => {
      // Try API login first (faster), fall back to UI login
      try {
        const { token } = await loginToPbsApi(page.request, pbsApiUrl, pbsUser, pbsPass)
        expect(token).toBeTruthy()

        // Inject token into the page so the app behaves as authenticated
        await page.addInitScript(
          ({ token }) => {
            window.localStorage.setItem('auth-token', token)
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
          { token },
        )

        return token
      } catch {
        // Fallback: UI login
        await loginPage.goto()
        await loginPage.login(pbsUser, pbsPass)
        return 'ui-login'
      }
    })
  },
})
