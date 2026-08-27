/**
 * Shared helpers for the Scenario top-nav dropdown (replaces the old inline
 * `module-nav-scenario` button + right-extending scenario tabs).
 *
 * Trigger testid `module-nav-scenario` is unchanged; it now opens a dropdown
 * instead of navigating directly, so reaching the management view takes a
 * second click on `scenario-nav-list`.
 */
import { type Page } from '@playwright/test'

/** Open the Scenario dropdown and go to the Scenario List (management) view. */
export async function gotoScenarioList(page: Page): Promise<void> {
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
}

/** Switch to an already-open scenario Gantt via the Scenarios submenu. */
export async function switchToOpenScenario(page: Page, module: string): Promise<void> {
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-scenarios-sub').click()
  await page.getByTestId(`scenario-nav-tab-${module}`).click()
}

/** Close an open scenario Gantt via the Scenarios submenu close (✕). */
export async function closeOpenScenario(page: Page, module: string): Promise<void> {
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-scenarios-sub').click()
  await page.getByTestId(`scenario-nav-close-${module}`).click()
}
