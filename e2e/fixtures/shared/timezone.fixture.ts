/**
 * Shared timezone fixture utilities.
 * Used by both Gantt and PBS test suites.
 */
import { type Page } from '@playwright/test'

/**
 * Set the timezone to a specific IANA zone via the UI.
 * Assumes a timezone switcher component with data-testid="timezone-switcher".
 */
export async function setTimezone(page: Page, timezone: string): Promise<void> {
  await page.getByTestId('timezone-switcher').click()
  await page.getByRole('option', { name: timezone }).click()
  await page.waitForTimeout(500)
}

/**
 * Verify the current timezone display in the UI.
 */
export async function getTimezone(page: Page): Promise<string> {
  const element = page.getByTestId('timezone-display')
  return element.textContent() ?? ''
}
