/**
 * Flight pane — Fleet filter dropdown must offer the newly seeded fleet types
 * (A380, B787, 737 — see 142-flight-schedule-seed-generator) alongside existing ones,
 * plus the SSIM variant codes added by the ET SSIM reload (788/789 = B787 family,
 * 738/73W = 737 family; 7M8 pre-existed — see load-ssim-flights.mjs in the same skill).
 *
 * Real UI login (`admin`, the one is_admin=1 account on this DB — bypasses dataScope
 * narrowing, see gantt/src/hooks/use-scoped-options.ts; the docs list Ryan as admin but
 * this local mirror's `users` row for Ryan has is_admin=0, so Ryan's dropdown is narrowed
 * by his FLEET dataScope and isn't the right account for testing the full reference list)
 * + real click through Filter -> Flight tab -> Fleet dropdown, asserting on the
 * actually-rendered option rows (not store state) — see §Simulate-User. Options come from
 * `fleet` reference table via gantt/src/stores/reference-store.ts listFleets(), not from
 * loaded flight rows, so this passes regardless of the currently-applied date range/filters.
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'
import { openLiveView, openFilter } from '../../utils/gantt-hook'

const USER = TEST_ACCOUNTS.admin

test.describe('Flight pane — Fleet filter (142-flight-schedule-seed-generator)', () => {
  test('Live-1708 — Fleet dropdown lists A380/B787/737 and the ET SSIM variant codes 788/789/738/73W @smoke', async ({ page }) => {
    const login = new GanttLoginPage(page)
    await login.goto()
    await login.login(USER.userCode, USER.password)
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await openLiveView(page)

    await openFilter(page, 'flight')
    await page.getByTestId('filter-flight-fleet-trigger').click()

    // A380/B787/737 from the original 142 seed; 788/789/738/73W from the ET SSIM reload.
    for (const fleet of ['A380', 'B787', '737', '788', '789', '738', '73W']) {
      await expect(
        page.locator(`[data-testid="filter-flight-fleet-opt-${fleet}"]`),
        `Fleet dropdown offers newly seeded ${fleet}`,
      ).toBeVisible({ timeout: 10_000 })
    }

    // Sanity: a pre-existing fleet is still present too — this seed only adds options,
    // it doesn't replace the reference list.
    await expect(page.locator('[data-testid="filter-flight-fleet-opt-7M8"]')).toBeVisible()
  })
})
