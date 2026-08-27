/**
 * Pairing Pane — dedicated server-side Sort dialog + chips.
 *
 * Mirrors the roster Universal Sorting UX: a Sort dialog lists all server-supported
 * pairing sort fields, applying drives pairing-store sortBy/sortOrder (the whole
 * dataset is ordered before paging), and the active non-default sort shows as a
 * removable chip. Assertions check the COMMITTED sort (__ganttTest.pairingSort())
 * and the resulting STORE order (__ganttTest.pairings()) — not mere visibility.
 *
 * Regression: previously mapPairings() force-sorted every response by sch-start-asc,
 * which silently overrode any other server sort. "Sch Start descending" below would
 * have stayed ascending under that bug — this test catches it.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, pairingObjects } from '../../utils/gantt-hook'

const startsOf = (rows: Array<Record<string, unknown>>): string[] =>
  rows.map((r) => r.start).filter((v): v is string => typeof v === 'string' && v !== '')

const fleetsOf = (rows: Array<Record<string, unknown>>): string[] =>
  rows.map((r) => r.fleet).filter((v): v is string => typeof v === 'string' && v !== '')

const isNonDecreasing = (xs: string[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1].localeCompare(v) <= 0)
const isNonIncreasing = (xs: string[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1].localeCompare(v) >= 0)

const pairingSort = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__ganttTest!.pairingSort())

test.describe('Pairing Sort', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectPairingPaneVisible()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded',
    }).toBeGreaterThan(1)
  })

  test('Live-1137 — sorts pairings server-side by Sch Start descending and shows a removable chip @smoke', async ({ page }) => {
    // Default committed sort + default store order (sch start ascending), no chip.
    expect(await pairingSort(page)).toEqual({ sortBy: 'schStrDtUtc', sortOrder: 'asc' })
    const defaultStarts = startsOf(await pairingObjects(page))
    expect(defaultStarts.length, 'pairings have start times').toBeGreaterThan(1)
    expect(isNonDecreasing(defaultStarts), `default order ascending: ${defaultStarts.slice(0, 5)}`).toBe(true)
    await expect(dashboard.pairingPane.getByTestId('pane-sort-chip'), 'no chip at default sort').toHaveCount(0)

    // Open the Pairing pane's Sort dialog and flip Sch Start to descending.
    await dashboard.pairingPane.getByTitle('Sort', { exact: true }).click()
    const dialog = page.getByTestId('sort-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('sort-selected-schStrDtUtc'), 'default field pre-selected').toContainText('1')
    await dialog.getByTestId('sort-order-desc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()

    // Committed sort flipped, store re-ordered descending (regression assertion).
    await expect.poll(() => pairingSort(page)).toEqual({ sortBy: 'schStrDtUtc', sortOrder: 'desc' })
    await expect.poll(async () => isNonIncreasing(startsOf(await pairingObjects(page))), {
      message: 'pairing store order is sch-start descending after Apply',
    }).toBe(true)

    // The active non-default sort is shown as a chip.
    const chip = dashboard.pairingPane.getByTestId('pane-sort-chip')
    await expect(chip).toHaveCount(1)
    await expect(chip).toContainText('Sch Start')
    await expect(chip).toContainText('↓')
  })

  test('Live-1138 — sorts by Fleet, then removing the chip reverts to default Sch Start order', async ({ page }) => {
    // Switch the sort field to Fleet (ascending).
    await dashboard.pairingPane.getByTitle('Sort', { exact: true }).click()
    const dialog = page.getByTestId('sort-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('sort-selected-schStrDtUtc').dblclick()      // remove default field
    await dialog.getByTestId('sort-available-fleet').dblclick()           // add Fleet (priority 1)
    await expect(dialog.getByTestId('sort-selected-fleet')).toContainText('1')
    await dialog.getByTestId('sort-order-asc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()

    await expect.poll(() => pairingSort(page)).toEqual({ sortBy: 'fleet', sortOrder: 'asc' })
    await expect.poll(async () => isNonDecreasing(fleetsOf(await pairingObjects(page))), {
      message: 'pairing store order is fleet ascending after Apply',
    }).toBe(true)

    const chip = dashboard.pairingPane.getByTestId('pane-sort-chip')
    await expect(chip).toContainText('Fleet')

    // Close the chip → revert to the default Sch Start ascending sort, chip disappears.
    await chip.getByRole('button').click()
    await expect.poll(() => pairingSort(page)).toEqual({ sortBy: 'schStrDtUtc', sortOrder: 'asc' })
    await expect(dashboard.pairingPane.getByTestId('pane-sort-chip')).toHaveCount(0)
    await expect.poll(async () => isNonDecreasing(startsOf(await pairingObjects(page))), {
      message: 'pairing store order reverts to sch-start ascending after chip removal',
    }).toBe(true)
  })
})
