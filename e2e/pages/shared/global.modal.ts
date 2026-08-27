/**
 * Shared Modal Page Object.
 * Common modal dialog interactions used across all 3 projects.
 */
import { type Page, type Locator, expect } from '@playwright/test'

export class SharedModalPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Generic modal container */
  get modal(): Locator {
    return this.page.getByRole('dialog')
  }

  /** Modal title */
  get modalTitle(): Locator {
    return this.modal.getByRole('heading')
  }

  /** Modal confirm button */
  get confirmButton(): Locator {
    return this.modal.getByTestId('modal-confirm')
  }

  /** Modal cancel button */
  get cancelButton(): Locator {
    return this.modal.getByTestId('modal-cancel')
  }

  /** Close button (X icon) */
  get closeButton(): Locator {
    return this.modal.getByTestId('modal-close')
  }

  async expectVisible(): Promise<void> {
    await expect(this.modal).toBeVisible()
  }

  async expectHidden(): Promise<void> {
    await expect(this.modal).toBeHidden()
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click()
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click()
  }

  async close(): Promise<void> {
    await this.closeButton.click()
  }
}
