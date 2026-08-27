/**
 * PBS Login Page Object — matches the real pbs-portal login page
 * (pbs-portal/src/features/auth/pages/login-page.tsx).
 *
 * Auth contract:
 *   - GET /api/auth/password-public-key
 *   - POST /api/auth/session  { userCode, encryptedPassword, encryption }
 *   - server returns a {code,data} envelope; the portal unwraps it (request.ts)
 *   - token is stored in sessionStorage under 'pbs-portal.auth.token'
 *   - success → redirect to /dashboard (or the ?redirect= target)
 *
 * The login form has NO data-testid attributes, so locators use the page's
 * accessible names (aria-label / role / sr-only heading) — the stable contract.
 */
import { type Page, type Locator, expect } from '@playwright/test'

export const PBS_AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

export class PbsLoginPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Locators ────────────────────────────────────────────────────────

  get userCodeInput(): Locator {
    return this.page.getByLabel('User Code')
  }

  get passwordInput(): Locator {
    return this.page.getByLabel('Password')
  }

  get signInButton(): Locator {
    return this.page.getByRole('button', { name: 'Sign In' })
  }

  get ssoButton(): Locator {
    return this.page.getByRole('button', { name: 'SSO Login' })
  }

  /** sr-only <h1>Sign in</h1> — present in the a11y tree even though visually hidden. */
  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Sign in' })
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  /** Navigate to the login route (base-relative; resolves under /pbs/). */
  async goto(): Promise<void> {
    await this.page.goto('login')
    await expect(this.signInButton).toBeVisible({ timeout: 15_000 })
  }

  async login(userCode: string, password: string): Promise<void> {
    await this.userCodeInput.click()
    await this.userCodeInput.fill(userCode)
    await this.passwordInput.click()
    await this.passwordInput.fill(password)
    await this.signInButton.click()
  }

  /**
   * Log out via the real dashboard UI (dashboard-top-nav.tsx): click the "Log out"
   * icon button, confirm in the "Log out of ROIS Crew?" dialog, and wait to land
   * back on the login form. Used by the crew-bid simulation so each crew visibly
   * logs out before the next logs in. Best-effort — if the control isn't present
   * (already logged out), it resolves without throwing.
   */
  async logout(): Promise<void> {
    const trigger = this.page.getByRole('button', { name: 'Log out' })
    if (!(await trigger.count())) return
    await trigger.first().click()
    await this.page.getByRole('button', { name: 'Log Out', exact: true }).click()
    await expect(this.signInButton).toBeVisible({ timeout: 15_000 })
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  /** The login form is mounted and interactive. */
  async expectVisible(): Promise<void> {
    await expect(this.signInButton).toBeVisible()
    await expect(this.userCodeInput).toBeVisible()
    await expect(this.passwordInput).toBeVisible()
  }

  /**
   * A login error is surfaced (no testid → match by text).
   *
   * NOTE: the portal currently renders the raw axios message ("Request failed
   * with status code 401") rather than the server's friendly envelope message
   * ("Invalid user code or password"). The default matcher accepts either, so
   * this test stays honest today and still passes if the team improves the
   * error mapping. See docs/handoff for the flagged UX gap.
   */
  async expectError(
    message: string | RegExp = /invalid user code or password|status code 401/i,
  ): Promise<void> {
    await expect(this.page.getByText(message)).toBeVisible({ timeout: 10_000 })
  }
}
