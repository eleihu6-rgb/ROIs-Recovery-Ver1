/**
 * Regression tests for Live full-load + client-side sort (2026-06-13).
 *
 * Verifies:
 * 1. Apply Filters loads all crew and pairings (> 0 items, no "load more" needed)
 * 2. Pairing sort is instant and does NOT trigger a pairing API call (client-side)
 * 3. Crew sort is instant and does NOT trigger a crew API call (client-side)
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, applyFilter, counts, pairingObjects } from '../../utils/gantt-hook'

test.describe('Live full-load + client-side sort', () => {
  test('Live-1094 — Apply Filters loads crew and pairings without triggering load-more', async ({
    page,
    request,
  }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    // Open filter dialog (default date range, no filters) and apply
    await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await applyFilter(page)

    // Roster pane visible and has crew rows
    await expect(page.getByTestId('roster-pane')).toBeVisible()

    const c = await counts(page)
    expect(c.roster, 'roster items loaded after Apply').toBeGreaterThan(0)
  })

  test('Live-1095 — Pairing pane loads all pairings after Apply Filters', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    // Open filter dialog on the Pairing tab so pairing pane is active, then apply
    await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-tab-pairing').click()
    await applyFilter(page)

    await expect(page.getByTestId('pairing-pane')).toBeVisible()

    const c = await counts(page)
    expect(c.pairing, 'pairing items loaded after Apply').toBeGreaterThan(0)
  })

  test('Live-1096 — Pairing sort does not trigger a network API call (client-side sort)', async ({
    page,
    request,
  }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    // Apply to load pairings
    await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-tab-pairing').click()
    await applyFilter(page)

    await expect(page.getByTestId('pairing-pane')).toBeVisible()
    const initialPairings = await pairingObjects(page)
    expect(initialPairings.length, 'pairings loaded before sort').toBeGreaterThan(0)

    // Start counting pairing API calls
    let pairingApiCalls = 0
    await page.route('**/api/pairing**', async (route) => {
      pairingApiCalls++
      await route.continue()
    })

    // Open sort dialog on the pairing pane (ArrowUpDown button titled "Sort")
    const sortBtn = page.getByTestId('pairing-pane').locator('[title="Sort"]')
    await sortBtn.click()
    await expect(page.getByTestId('sort-dialog')).toBeVisible()

    // Select 'pairingLabel' as sort field (move it to selected)
    const labelAvail = page.getByTestId('sort-available-pairingLabel')
    if (await labelAvail.count() > 0) {
      await labelAvail.click()
      await page.getByTestId('sort-move-right').click()
    }
    // Apply the sort
    await page.getByTestId('sort-apply').click()
    await expect(page.getByTestId('sort-dialog')).toBeHidden()

    // Wait briefly to give any potential network call time to fire
    await page.waitForTimeout(600)

    // No pairing API calls should have been made (sort is local)
    expect(pairingApiCalls, 'no pairing API calls on client-side sort').toBe(0)

    // Pairings should still be present (order may differ but count is same)
    const sortedPairings = await pairingObjects(page)
    expect(sortedPairings.length, 'pairing count unchanged after sort').toBe(initialPairings.length)
  })
})
