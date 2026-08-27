/**
 * Data Tab — Roster Period page: display, filter, edit, and add.
 *
 * Uses the Data-5101..5106 ID block (Roster Period is a new entity).
 *
 * §No-Illusion: every assertion checks specific text/counts, not bare visibility.
 * No delete test — deleting production reference data is too risky in E2E.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const openRosterPeriodPage = async (page: Page) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('data-tree-item-basic.roster-period').click()
  await page.getByTestId('data-section-roster_period').waitFor({ state: 'visible', timeout: 10_000 })
}

test.describe('Data Tab — Roster Period page', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Data-5101 — table loads with roster period data', async ({ page }) => {
    await openRosterPeriodPage(page)

    // Section container must be visible.
    await expect(page.getByTestId('data-section-roster_period')).toBeVisible()

    // Grid must be visible.
    const grid = page.getByTestId('data-grid-roster_period')
    await expect(grid).toBeVisible()

    // At least one RP code cell matching the pattern YYYY​RPnn (e.g. "2026RP01").
    const rpCells = grid.locator('[data-testid="data-cell-roster_period-rosterPeriod"]')
    await expect
      .poll(() => rpCells.count(), { timeout: 10_000, message: 'roster_period grid must have rows' })
      .toBeGreaterThan(0)

    const firstCellText = (await rpCells.first().textContent())?.trim() ?? ''
    expect(firstCellText, 'RP code must match YYYYRPNN pattern').toMatch(/\d{4}RP\d{2}/)

    // Row-count badge (font-mono span in the section header) must show a number > 0.
    const badge = page.getByTestId('data-section-roster_period').locator('span.font-mono')
    await expect(badge).toBeVisible()
    const badgeText = (await badge.first().textContent())?.trim() ?? '0'
    expect(Number(badgeText), 'row count badge must be > 0').toBeGreaterThan(0)
  })

  test('Data-5102 — filter by year 2026 shows only 2026 roster periods (≤ 12 rows)', async ({ page }) => {
    await openRosterPeriodPage(page)

    const grid = page.getByTestId('data-grid-roster_period')
    const rosterPeriodSection = page.getByTestId('data-section-roster_period')

    // Wait for initial rows before filtering.
    await expect
      .poll(() => grid.locator('tbody tr').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)

    // Select Year = 2026 (Radix UI combobox — click trigger then option).
    await rosterPeriodSection.getByTestId('data-filter-year').click()
    await page.locator('[data-radix-popper-content-wrapper]').getByText('2026').click()
    await rosterPeriodSection.getByTestId('data-filter-search').click()

    // Wait for the grid to refresh (row set may change).
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    const rpCells = grid.locator('[data-testid="data-cell-roster_period-rosterPeriod"]')
    await expect
      .poll(() => rpCells.count(), { timeout: 10_000, message: 'year filter must return rows' })
      .toBeGreaterThan(0)

    // Every visible RP code must start with "2026".
    const allTexts = await rpCells.allTextContents()
    for (const text of allTexts) {
      expect(text.trim(), `RP code "${text}" must contain "2026" when year filter is 2026`).toContain('2026')
    }

    // A single year can have at most 12 periods (one per month).
    expect(allTexts.length, 'year 2026 must have at most 12 roster periods').toBeLessThanOrEqual(12)
  })

  test('Data-5103 — clearing the year filter restores all rows including other years', async ({ page }) => {
    await openRosterPeriodPage(page)

    const grid = page.getByTestId('data-grid-roster_period')
    const rosterPeriodSection = page.getByTestId('data-section-roster_period')

    // Wait for initial rows.
    await expect
      .poll(() => grid.locator('tbody tr').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)

    // Apply year filter first (Radix UI combobox — click trigger then option).
    await rosterPeriodSection.getByTestId('data-filter-year').click()
    await page.locator('[data-radix-popper-content-wrapper]').getByText('2026').click()
    await rosterPeriodSection.getByTestId('data-filter-search').click()
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // Clear the filter.
    await rosterPeriodSection.getByTestId('data-filter-clear').click()
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // After clearing, rows from multiple years should be present.
    const rpCells = grid.locator('[data-testid="data-cell-roster_period-rosterPeriod"]')
    await expect
      .poll(() => rpCells.count(), { timeout: 10_000, message: 'cleared filter must restore rows' })
      .toBeGreaterThan(0)

    // Look for at least one RP code that is NOT "2026" (proves multi-year data is back).
    const allTexts = await rpCells.allTextContents()
    const hasOtherYear = allTexts.some((t) => !/^2026/.test(t.trim()))
    expect(
      hasOtherYear,
      `After clearing year filter, expected at least one non-2026 RP code. Got: ${allTexts.join(', ')}`,
    ).toBeTruthy()
  })

  test('Data-5104 — edit dialog opens and shows expected editable fields', async ({ page }) => {
    await openRosterPeriodPage(page)

    const grid = page.getByTestId('data-grid-roster_period')

    // Wait for Edit buttons to appear.
    const firstEditBtn = grid.locator('[data-testid^="data-edit-row-"]').first()
    await expect(firstEditBtn).toBeVisible({ timeout: 10_000 })

    await firstEditBtn.click()

    const dialog = page.getByTestId('data-edit-dialog-roster_period')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Required editable fields must all be present.
    await expect(page.getByTestId('data-edit-field-lockStatus')).toBeVisible()
    await expect(page.getByTestId('data-edit-field-rosterPublicationDate')).toBeVisible()
    await expect(page.getByTestId('data-edit-field-rpStart')).toBeVisible()

    // Close without saving.
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })
  })

  test('Data-5105 — add dialog opens with an empty RP code field', async ({ page }) => {
    await openRosterPeriodPage(page)

    // Click the Add button for the roster_period section.
    await page.getByTestId('data-section-add-roster_period').click()

    const dialog = page.getByTestId('data-edit-dialog-roster_period')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Dialog title must mention "Add Roster Period".
    await expect(dialog).toContainText('Add Roster Period')

    // The rosterPeriod (RP code) field must be empty on a new record.
    const rpField = page.getByTestId('data-edit-field-rosterPeriod')
    await expect(rpField).toBeVisible()
    await expect(rpField).toHaveValue('')

    // Close without saving.
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })
  })

  test('Data-5106 — roster period page does not expose PBS period config', async ({ page }) => {
    await openRosterPeriodPage(page)

    await expect(page.getByTestId('data-section-roster_period')).toBeVisible()
    await expect(page.getByTestId('data-section-roster_period_config')).toHaveCount(0)
    await expect(page.getByTestId('data-grid-roster_period_config')).toHaveCount(0)
  })
})
