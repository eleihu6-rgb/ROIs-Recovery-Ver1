/**
 * PBS Portal Dashboard Page Object — matches the real post-login landing
 * (pbs-portal/src/features/dashboard/pages/dashboard-page.tsx + the shared
 * top-nav in pbs-portal/src/app/layout/dashboard-top-nav.tsx).
 *
 * Routes are protected: an unauthenticated visit to /dashboard bounces to
 * /login?redirect=… . All paths are base-relative (resolve under /pbs/).
 */
import { type Page, type Locator, expect } from '@playwright/test'

export class PbsPortalDashboardPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Locators ────────────────────────────────────────────────────────

  get layout(): Locator {
    return this.page.getByTestId('dashboard-layout')
  }

  get topNav(): Locator {
    return this.page.getByTestId('dashboard-top-nav')
  }

  get logoutButton(): Locator {
    return this.page.getByRole('button', { name: 'Log out' })
  }

  get logoutConfirmHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Log out of ROIS Crew?' })
  }

  /** The confirm button inside the logout modal (label "Log Out", distinct from the trigger). */
  get logoutConfirmButton(): Locator {
    return this.page.locator('button').filter({ hasText: /^Log Out$/ })
  }

  /** A top-nav section link by its visible label, e.g. 'Pairing'. */
  navLink(label: string): Locator {
    return this.topNav.getByRole('link', { name: label, exact: true })
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.page.goto('dashboard')
    await expect(this.layout).toBeVisible({ timeout: 15_000 })
  }

  async logout(): Promise<void> {
    await this.logoutButton.click()
    await expect(this.logoutConfirmHeading).toBeVisible()
    await this.logoutConfirmButton.click()
    await this.page.waitForURL(/\/login$/, { timeout: 10_000 })
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  async expectLoaded(): Promise<void> {
    await expect(this.layout).toBeVisible()
    await expect(this.topNav).toBeVisible()
  }
}
