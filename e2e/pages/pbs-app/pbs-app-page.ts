/**
 * PBS App (Mobile) Page Object.
 * PBS App is a React Native + Expo app, tested via Expo web or simulator.
 * Shares auth with PBS Portal (same pbs-server backend).
 */
import { type Page, type Locator, expect } from '@playwright/test'

export class PbsAppPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Locators ────────────────────────────────────────────────────────

  get homeScreen(): Locator {
    return this.page.getByTestId('pbs-app-home')
  }

  get scheduleScreen(): Locator {
    return this.page.getByTestId('pbs-app-schedule')
  }

  get pairingDetail(): Locator {
    return this.page.getByTestId('pbs-app-pairing-detail')
  }

  get applyButton(): Locator {
    return this.page.getByTestId('pbs-app-apply-btn')
  }

  get backButton(): Locator {
    return this.page.getByTestId('pbs-app-back')
  }

  get settingsButton(): Locator {
    return this.page.getByTestId('pbs-app-settings')
  }

  get logoutButton(): Locator {
    return this.page.getByTestId('pbs-app-logout')
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.homeScreen.waitFor({ state: 'visible', timeout: 15_000 })
  }

  async navigateToSchedule(): Promise<void> {
    await this.scheduleScreen.click()
  }

  async openPairing(pairingId: string): Promise<void> {
    await this.page.getByTestId(`pairing-card-${pairingId}`).click()
  }

  async applyForPairing(): Promise<void> {
    await this.applyButton.click()
  }

  async goBack(): Promise<void> {
    await this.backButton.click()
  }

  async logout(): Promise<void> {
    await this.settingsButton.click()
    await this.logoutButton.click()
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  async expectLoaded(): Promise<void> {
    await expect(this.homeScreen).toBeVisible()
  }

  async expectPairingDetailVisible(pairingId: string): Promise<void> {
    await expect(this.pairingDetail).toBeVisible()
  }
}
