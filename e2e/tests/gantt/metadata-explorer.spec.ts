/**
 * Metadata DB Explorer — E2E tests
 *
 * Covers the "Metadata" section in the Data tab sidebar:
 *   data-tree-item-metadata.live   → f8 schema browser
 *   data-tree-item-metadata.scenario → scenario schema browser
 *
 * Test IDs: Meta-5201 to Meta-5206
 *
 * §No-Illusion: every assertion checks concrete content, not just visibility.
 * Auth: seedGanttAuth injects rois-auth into sessionStorage before first goto.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Metadata DB Explorer', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    // Navigate to Data tab
    await page.getByTestId('module-nav-data').click()
    await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
    // Open the Metadata > Live (f8) view; tables load as sub-items in the shell sidebar
    await page.getByTestId('data-tree-item-metadata.live').click()
    // Wait for at least one f8 table to appear in the sidebar
    await page.locator('[data-testid^="metadata-table-f8-"]').first().waitFor({ state: 'visible', timeout: 15_000 })
  })

  // ─────────────────────────────────────────────────────────────
  // Meta-5201 — Sidebar loads: f8 schema heading + table list
  // ─────────────────────────────────────────────────────────────
  test('Meta-5201: Metadata sidebar loads f8 schema with at least one table and row counts', async ({ page }) => {
    // Tables are now in the shell sidebar as sub-items under the Live (f8) header
    const firstTable = page.locator('[data-testid^="metadata-table-f8-"]').first()
    await expect(firstTable).toBeVisible({ timeout: 10_000 })

    // The table entry text must include at least one digit (its row count)
    const text = await firstTable.textContent()
    expect(text, 'table button should include a row count digit').toMatch(/\d/)
  })

  // ─────────────────────────────────────────────────────────────
  // Meta-5202 — Selecting a table shows filter row, no results yet
  // ─────────────────────────────────────────────────────────────
  test('Meta-5202: Selecting a table shows filter row but no results by default', async ({ page }) => {
    // Click the first available table (now in shell sidebar)
    const firstTable = page.locator('[data-testid^="metadata-table-f8-"]').first()
    await firstTable.click()

    // Filter row (column filter inputs) must appear — columns were loaded
    await expect(page.getByTestId('metadata-filter-row')).toBeVisible({ timeout: 10_000 })

    // No results should show until the user clicks Run
    await expect(page.getByTestId('metadata-empty-state')).toBeVisible()
    await expect(page.getByTestId('metadata-results-table')).not.toBeVisible()
  })

  // ─────────────────────────────────────────────────────────────
  // Meta-5203 — Run Query returns rows and hides empty-state
  // ─────────────────────────────────────────────────────────────
  test('Meta-5203: Run Query on the base table returns data rows', async ({ page }) => {
    // The `base` table in the f8 schema is small and always populated
    await page.getByTestId('metadata-table-f8-base').click()
    await expect(page.getByTestId('metadata-filter-row')).toBeVisible({ timeout: 10_000 })

    // Run without any filter
    await page.getByTestId('metadata-run-btn').click()

    // Results table must appear
    await expect(page.getByTestId('metadata-results-table')).toBeVisible({ timeout: 10_000 })

    // At least one data row must be present (§No-Illusion: count not just visibility)
    const rows = page.getByTestId('metadata-results-table').locator('tbody tr')
    const count = await rows.count()
    expect(count, 'base table should have at least 1 row').toBeGreaterThan(0)

    // Empty state must be gone
    await expect(page.getByTestId('metadata-empty-state')).not.toBeVisible()
  })

  // ─────────────────────────────────────────────────────────────
  // Meta-5204 — Clear resets view back to empty state
  // ─────────────────────────────────────────────────────────────
  test('Meta-5204: Clear resets results and shows empty state again', async ({ page }) => {
    await page.getByTestId('metadata-table-f8-base').click()
    await expect(page.getByTestId('metadata-filter-row')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('metadata-run-btn').click()
    await expect(page.getByTestId('metadata-results-table')).toBeVisible({ timeout: 10_000 })

    // Clicking Clear must reset the view
    await page.getByTestId('metadata-clear-btn').click()

    await expect(page.getByTestId('metadata-empty-state')).toBeVisible()
    await expect(page.getByTestId('metadata-results-table')).not.toBeVisible()
  })

  // ─────────────────────────────────────────────────────────────
  // Meta-5205 — Column filter narrows results
  // ─────────────────────────────────────────────────────────────
  test('Meta-5205: Entering a column filter value and running narrows or matches results', async ({ page }) => {
    // Use base table (small, deterministic)
    await page.getByTestId('metadata-table-f8-base').click()
    await expect(page.getByTestId('metadata-filter-row')).toBeVisible({ timeout: 10_000 })

    // Run unfiltered first to get baseline
    await page.getByTestId('metadata-run-btn').click()
    await expect(page.getByTestId('metadata-results-table')).toBeVisible({ timeout: 10_000 })
    const baselineRows = await page.getByTestId('metadata-results-table').locator('tbody tr').count()

    // Now pick the first column filter input and type a value that exists in the data
    // Use the is_deleted column which exists on most tables and 0 is always valid
    const isDeletedFilter = page.getByTestId('metadata-filter-col-is_deleted')
    // Only interact if the filter input is present for this table
    const filterVisible = await isDeletedFilter.isVisible()
    if (filterVisible) {
      await isDeletedFilter.fill('0')
      await page.getByTestId('metadata-run-btn').click()
      await expect(page.getByTestId('metadata-results-table')).toBeVisible({ timeout: 10_000 })

      const filteredRows = await page.getByTestId('metadata-results-table').locator('tbody tr').count()
      // Filtered count must be <= total (filter can match all but never exceeds)
      expect(filteredRows, 'filtered row count should not exceed unfiltered total').toBeLessThanOrEqual(baselineRows)
      // Must return at least 1 row (base table has at least 1 active record)
      expect(filteredRows, 'filter should return at least 1 row').toBeGreaterThan(0)
    } else {
      // Table has no is_deleted column — just verify unfiltered result is non-empty
      expect(baselineRows, 'base table should have at least 1 row').toBeGreaterThan(0)
    }
  })

  // ─────────────────────────────────────────────────────────────
  // Meta-5206 — Rows-per-page select defaults to 200
  // ─────────────────────────────────────────────────────────────
  test('Meta-5206: Rows-per-page selector is visible and defaults to 200', async ({ page }) => {
    // Click the first available table (now in shell sidebar)
    const firstTable = page.locator('[data-testid^="metadata-table-f8-"]').first()
    await firstTable.click()

    // Wait for filter row to confirm table is selected
    await expect(page.getByTestId('metadata-filter-row')).toBeVisible({ timeout: 10_000 })

    // Now the rows-per-page select will exist in the DOM
    const rowsSelect = page.getByTestId('metadata-rows-select')
    await expect(rowsSelect).toBeVisible({ timeout: 10_000 })
    await expect(rowsSelect).toHaveValue('200')
  })
})
