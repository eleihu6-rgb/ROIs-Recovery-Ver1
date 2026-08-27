/**
 * Gantt Login Page Object.
 *
 * Gantt has an independent auth system:
 * - Endpoint: POST /api/auth/login
 * - Storage: sessionStorage key `rois-auth`
 * - Token format: Bearer JWT
 */
import { type Page, type Locator, expect } from '@playwright/test'

export class GanttLoginPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Locators ────────────────────────────────────────────────────────

  get userCodeInput(): Locator {
    return this.page.getByTestId('login-user-code')
  }

  get passwordInput(): Locator {
    return this.page.getByTestId('login-password')
  }

  get signInButton(): Locator {
    return this.page.getByTestId('login-sign-in')
  }

  get errorMessage(): Locator {
    return this.page.getByTestId('login-error')
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'ROIS' })
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.heading.waitFor({ state: 'visible' })
  }

  async login(userCode: string, password: string): Promise<void> {
    await this.userCodeInput.click()
    await this.userCodeInput.fill(userCode)
    await this.passwordInput.click()
    await this.passwordInput.fill(password)
    await this.signInButton.click()
    // Wait for the login page to disappear (redirect to gantt)
    await expect(this.heading).not.toBeVisible({ timeout: 10_000 })
  }

  async expectError(message: string): Promise<void> {
    await expect(this.errorMessage).toContainText(message)
  }

  async expectVisible(): Promise<void> {
    await expect(this.heading).toBeVisible()
  }
}
