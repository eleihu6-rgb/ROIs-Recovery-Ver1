/**
 * Per-pane filter entry: a funnel button in each pane's action cluster (top right)
 * opens the SAME global Filter dialog as the toolbar funnel, pre-switched to the
 * tab matching the pane (roster → Crew, pairing → Pairing, flight → Flight).
 * No matter the entry point, every tab stays freely selectable and Apply works.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, selectDropdownOption, applyFilter } from '../../utils/gantt-hook'

declare global {
  interface Window {
    __ganttTest?: {
      counts: () => { pairing: number }
      filters: () => { applied: null | { pairing: { bases: string[] } } }
      pairings: () => Array<{ base: string | null }>
    }
  }
}

test.describe('Pane filter button (global Filter dialog entry)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectPairingPaneVisible()
    await expect.poll(async () => page.evaluate(() => window.__ganttTest!.counts().pairing))
      .toBeGreaterThan(0)
  })

  test('Live-1153 — pairing pane funnel opens dialog on Pairing tab; apply filters pairings; all tabs selectable @smoke', async ({ page }) => {
    // Step 1: open from the pairing pane → dialog visible with Pairing tab active.
    await dashboard.pairingPane.getByTestId('pane-filter-button').click()
    const dialog = page.getByTestId('filter-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('filter-tab-pairing')).toHaveAttribute('data-active', 'true')
    await expect(dialog.getByTestId('filter-tab-crew')).toHaveAttribute('data-active', 'false')
    // Pairing-tab control rendered (not just the tab header highlighted).
    await expect(dialog.getByTestId('filter-pairing-base-trigger')).toBeVisible()

    // Step 2: entry point does not restrict options — Crew tab still reachable & editable.
    await dialog.getByTestId('filter-tab-crew').click()
    await expect(dialog.getByTestId('filter-crew-base-trigger')).toBeVisible()
    await dialog.getByTestId('filter-tab-pairing').click()

    // Step 3: select base=YEG on the Pairing tab and apply → data actually filtered.
    await selectDropdownOption(page, 'filter-pairing-base', 'YEG', 'pairing')
    await applyFilter(page)
    await expect
      .poll(async () => page.evaluate(() => window.__ganttTest!.filters().applied?.pairing.bases[0]))
      .toBe('YEG')
    const loaded = await page.evaluate(() => window.__ganttTest!.pairings())
    expect(loaded.length).toBeGreaterThan(0)
    expect(loaded.every((p) => p.base === 'YEG')).toBe(true)
    // Chip for the applied value shows on the pane strip (same as toolbar entry).
    await expect(
      dashboard.pairingPane.getByTestId('pane-filter-chip').filter({ hasText: 'YEG' }).first(),
    ).toBeVisible()
  })

  test('Live-1154 — roster pane funnel opens dialog on Crew tab', async ({ page }) => {
    await dashboard.rosterPane.getByTestId('pane-filter-button').click()
    const dialog = page.getByTestId('filter-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('filter-tab-crew')).toHaveAttribute('data-active', 'true')
    await expect(dialog.getByTestId('filter-crew-base-trigger')).toBeVisible()
    await dialog.getByTestId('filter-close').click()
    await expect(dialog).not.toBeVisible()
  })

  test('Live-1155 — flight pane funnel opens dialog on Flight tab', async ({ page }) => {
    await dashboard.addFlightPane()
    await dashboard.flightPane.getByTestId('pane-filter-button').click()
    const dialog = page.getByTestId('filter-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('filter-tab-flight')).toHaveAttribute('data-active', 'true')
    await expect(dialog.getByTestId('filter-flight-dep')).toBeVisible()
    await dialog.getByTestId('filter-close').click()
    await expect(dialog).not.toBeVisible()
  })
})
