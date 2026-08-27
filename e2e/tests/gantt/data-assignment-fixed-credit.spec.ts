/**
 * Data tab → Basic Assignment — the new `fixed_credit_min` column.
 *
 * A `fixed_credit_min` column was added to the assignment table (fixed credit hours per
 * assignment, in minutes; migration 2026-06-15-assignment-add-fixed-credit.sql). It must
 * surface in the gantt Data-tab Assignment grid (registry + Drizzle model + grid). This
 * asserts the column header renders AND specific cells carry the imported values:
 *   ASBY = 240 (4:00), VAC = 240, FC = 420 (7:00), AL = 0, DO = — (NULL, no fixed credit).
 *
 * §No-Illusion: checks concrete cell values served live from the DB, not bare visibility.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const openAssignmentPage = async (page: Page) => {
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-tree-item-basic.assignment').click()
  await page.getByTestId('data-section-assignment').waitFor({ state: 'visible', timeout: 10_000 })
}

test('Data-5031 — Assignment grid shows the fixed_credit_min column with imported values', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await openAssignmentPage(page)

  const grid = page.getByTestId('data-grid-assignment')
  await expect.poll(() => grid.locator('tbody tr').count(), { timeout: 10_000 }).toBeGreaterThan(1)

  // The new column header is present (label "Fixed Credit (min)").
  await expect(grid.getByTestId('data-grid-header-assignment-fixedCreditMin')).toContainText('Fixed Credit')

  // Read code + fixed-credit columns row-aligned (same DOM order), then assert per code.
  const codes = await grid.locator('[data-testid="data-cell-assignment-assignment"]').allTextContents()
  const fixed = await grid.locator('[data-testid="data-cell-assignment-fixedCreditMin"]').allTextContents()
  expect(codes.length).toBe(fixed.length)
  const fixedOf = (code: string) => {
    const i = codes.findIndex((c) => c.trim() === code)
    expect(i, `row for ${code} must be present`).toBeGreaterThanOrEqual(0)
    return fixed[i].trim()
  }

  // Imported fixed credits (minutes).
  expect(fixedOf('ASBY')).toBe('240') // Airport Standby 4:00 — existing code, credit updated only
  expect(fixedOf('VAC')).toBe('240') // 4:00 — newly inserted
  expect(fixedOf('FC')).toBe('420') // 7:00
  expect(fixedOf('AL')).toBe('0') // Annual Leave 0:00
  // DO was NOT in the import list → NULL fixed credit → rendered as the empty marker.
  expect(['—', '-', '']).toContain(fixedOf('DO'))
})
