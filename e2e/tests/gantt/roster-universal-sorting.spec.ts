/**
 * Universal Sorting dialog — multi-key sort, Seniority first.
 *
 * Drives the dialog (double-click to move criteria, Asc/Desc), then verifies the
 * DISPLAYED roster order via window.__ganttTest.rosterPanel() (store/render truth,
 * not pixels) and the committed criteria via __ganttTest.rosterSort(). Cross-checks
 * seniority against crew-store. Anti-illusion: asserts actual ordering, not visibility.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

/** Seniority values (display order), empties removed, as numbers. */
const seniorityNums = (panel: Array<{ seniority: string }>): number[] =>
  panel.map((r) => r.seniority).filter((s) => s !== '' && /^\d+(\.\d+)?$/.test(s)).map(Number)

const isNonDecreasing = (xs: number[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1] <= v)
const isNonIncreasing = (xs: number[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1] >= v)

test.describe('Universal Sorting', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('Live-1221 — sorts roster by Seniority ascending then descending @smoke', async ({ page }) => {
    // Open the sort dialog from the first roster pane's toolbar.
    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')
    await expect(dialog).toBeVisible()

    // Double-click SENIORITY in the available list -> moves to Selected with priority 1.
    await dialog.getByTestId('sort-available-seniority').dblclick()
    await expect(dialog.getByTestId('sort-selected-seniority')).toContainText('1')

    // Ascending (default) + Apply.
    await dialog.getByTestId('sort-order-asc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()

    // Committed criteria.
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort()))
      .toEqual([{ column: 'seniority', direction: 'asc' }])

    // Displayed order is non-decreasing by seniority, cross-checked vs crew-store.
    const [panelAsc, crew] = await page.evaluate(() => [
      window.__ganttTest!.rosterPanel(),
      window.__ganttTest!.crewSeniority(),
    ])
    const ascNums = seniorityNums(panelAsc)
    expect(ascNums.length, 'some crew have seniority').toBeGreaterThan(0)
    expect(isNonDecreasing(ascNums), `ascending order: ${ascNums.slice(0, 8)}`).toBe(true)
    const known = new Map(crew.map((c) => [c.crewId, c.seniorityNum]))
    for (const row of panelAsc) expect(known.has(row.crewId)).toBe(true)

    // Re-open, switch to Descending, Apply.
    await page.getByTitle('Sort', { exact: true }).first().click()
    await page.getByTestId('sort-order-desc').check()
    await page.getByTestId('sort-apply').click()
    await expect(page.getByTestId('sort-dialog')).toBeHidden()

    const panelDesc = await page.evaluate(() => window.__ganttTest!.rosterPanel())
    const descNums = seniorityNums(panelDesc)
    expect(isNonIncreasing(descNums), `descending order: ${descNums.slice(0, 8)}`).toBe(true)
  })

  test('Live-1222 — double-click moves a criterion back and clears the sort', async ({ page }) => {
    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')

    // Add then remove via double-click on each side.
    await dialog.getByTestId('sort-available-seniority').dblclick()
    await expect(dialog.getByTestId('sort-selected-seniority')).toBeVisible()
    await dialog.getByTestId('sort-selected-seniority').dblclick()
    await expect(dialog.getByTestId('sort-available-seniority')).toBeVisible()
    await expect(dialog.getByTestId('sort-selected-seniority')).toBeHidden()

    await dialog.getByTestId('sort-apply').click()
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort())).toEqual([])
  })
})
