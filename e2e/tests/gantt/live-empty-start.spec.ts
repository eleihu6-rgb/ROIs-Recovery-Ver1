/**
 * Live view empty start + filter-driven data pull.
 *
 * Spec: docs/superpowers/specs/2026-06-03-gantt-live-empty-start-filter-pull-design.md
 * - No "Open Live View" pop-up; Live lands on an EMPTY gantt (no auto-load).
 * - No centered empty-state card either: an inline animated toolbar hint next to
 *   the funnel button guides the user to the Filter dialog.
 * - Apply Filters is the only data pull; empty filter = load-all via bootstrap.
 * - Default planning period = current month start → next month end.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, readHook, waitGanttReady, selectDropdownOption } from '../../utils/gantt-hook'

const pad = (n: number): string => String(n).padStart(2, '0')

/** First day of the current month as yyyy-MM-dd (UTC calendar). */
const currentMonthFirst = (): string => {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}

/** Last day of NEXT month as yyyy-MM-dd (UTC calendar). */
const nextMonthLast = (): string => {
  const d = new Date()
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`
}

const gotoLiveRaw = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('module-nav-live').click()
}

test.describe('Live empty start', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Live-1089 — Live opens empty: no setup pop-up, zero rows, inline toolbar hint @smoke', async ({ page }) => {
    await gotoLiveRaw(page)

    // 1. The old pop-up is gone — nothing to dismiss.
    await expect(page.getByTestId('live-setup-dialog')).toHaveCount(0)

    // 2. Inline toolbar hint (not a centered card) with exact guidance text,
    //    rendered inside the sub-toolbar next to the funnel button.
    const empty = page.getByTestId('live-empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No data loaded — apply filters to pull data')
    const inToolbar = page
      .locator('header')
      .filter({ has: page.getByTestId('filter-btn') })
      .getByTestId('live-empty-state')
    await expect(inToolbar).toHaveCount(1)

    // 3. Toolbar funnel attention animation present while empty.
    await expect(page.getByTestId('filter-attention-ring')).toBeVisible()

    // 4. Stores are truly empty — nothing was auto-loaded.
    const counts = await readHook<{ roster: number; pairing: number; flightLegs: number }>(page, 'counts')
    expect(counts.roster).toBe(0)
    expect(counts.pairing).toBe(0)
    expect(counts.flightLegs).toBe(0)
  })

  test('Live-1095 — selecting an RP does not auto-query; hint stays "No data loaded"', async ({ page }) => {
    await gotoLiveRaw(page)

    const empty = page.getByTestId('live-empty-state')
    await expect(empty).toBeVisible()

    // Select a second RP → the selection widens, but NO query fires (decoupled):
    // the empty-start hint stays "No data loaded" and the stores stay empty.
    await page.getByTestId('toolbar-rp-multiselect-trigger').click()
    const rp09 = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]').filter({ hasText: /2026RP09/ })
    await expect(rp09).toBeVisible({ timeout: 15_000 })
    await rp09.click()
    await page.keyboard.press('Escape')

    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No data loaded — apply filters to pull data')
    const counts = await readHook<{ roster: number; pairing: number }>(page, 'counts')
    expect(counts.roster).toBe(0)
    expect(counts.pairing).toBe(0)

    // Clicking the hint still opens the Filter dialog (the only pull path).
    await empty.click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
  })

  test('Live-1090 — default planning period covers the current roster period', async ({ page }) => {
    await gotoLiveRaw(page)
    // The toolbar RpMultiSelect defaults to the RP containing now() (±7d), so the default
    // window covers today. (Replaces the old "current month + next month" picker assertion.)
    await expect
      .poll(
        async () => {
          const dr = await readHook<{ start: string; end: string }>(page, 'dateRange')
          const now = Date.now()
          return new Date(dr.start).getTime() <= now && new Date(dr.end).getTime() >= now
        },
        { timeout: 15_000, message: 'default range does not cover today' },
      )
      .toBe(true)
  })

  test('Live-1091 — hint click opens Filter dialog; empty-filter Apply bootstraps load-all', async ({ page }) => {
    await gotoLiveRaw(page)

    // Step 1: toolbar hint → dialog
    await page.getByTestId('live-empty-state').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()

    // Step 2: Apply with no filters → load-all
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).not.toBeVisible()
    await expect(page.getByTestId('live-empty-state')).not.toBeVisible({ timeout: 60_000 })

    await waitGanttReady(page, 60_000)
    const counts = await readHook<{ roster: number }>(page, 'counts')
    expect(counts.roster).toBeGreaterThan(0)

    // Step 3: attention animation stops once the WHOLE apply commits — the ring is
    // gated on appliedFilters, which markApplied() sets only after the pairing/flight
    // fetches also finish, so poll rather than assert instantly after roster counts.
    await expect(page.getByTestId('filter-attention-ring')).toHaveCount(0, { timeout: 60_000 })
  })

  test('Live-1092 — filtered pull, then re-filter widens the crew set', async ({ page }) => {
    await gotoLiveRaw(page)
    await page.getByTestId('live-empty-state').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()

    // First pull: restrict crew by base (YEG exists in the demo DB).
    await selectDropdownOption(page, 'filter-crew-base', 'YEG', 'crew')
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('live-empty-state')).not.toBeVisible({ timeout: 60_000 })
    await waitGanttReady(page, 60_000)
    const filtered = await readHook<{ total: number; unfilteredTotal: number }>(page, 'crewTotals')
    expect(filtered.total).toBeGreaterThan(0)

    // Filter CORRECTNESS, not just counts: every loaded crew (with base records)
    // carries the filtered base among its date-effective bases.
    const filteredBases = await readHook<string[][]>(page, 'crewBases')
    const withRecords = filteredBases.filter((b) => b.length > 0)
    expect(withRecords.length).toBeGreaterThan(0)
    expect(withRecords.every((b) => b.includes('YEG'))).toBe(true)

    // Re-filter: clear all filters → Apply → crew set must widen.
    await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-reset').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).not.toBeVisible()
    await expect
      .poll(async () => (await readHook<{ total: number }>(page, 'crewTotals')).total, { timeout: 60_000 })
      .toBeGreaterThan(filtered.total)

    // The widened set is no longer single-base.
    await expect
      .poll(async () => {
        const bases = await readHook<string[][]>(page, 'crewBases')
        return bases.some((b) => b.length > 0 && !b.includes('YEG'))
      }, { timeout: 60_000 })
      .toBe(true)
  })

  test('Live-1093 — navigating away and back keeps loaded data (no empty state again)', async ({ page }) => {
    await gotoLiveRaw(page)
    await page.getByTestId('live-empty-state').click()
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('live-empty-state')).not.toBeVisible({ timeout: 60_000 })
    await waitGanttReady(page, 60_000)

    await page.getByTestId('module-nav-dashboard').click()
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('refresh-btn')).toBeVisible()
    await expect(page.getByTestId('live-empty-state')).toHaveCount(0)
    const counts = await readHook<{ roster: number }>(page, 'counts')
    expect(counts.roster).toBeGreaterThan(0)
  })
})
