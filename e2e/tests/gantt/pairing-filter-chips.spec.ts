/**
 * Pairing/Flight condition chips for the GLOBAL filter (base/fleet/… applied via the
 * Filter dialog). Regression for the bug where a snapshot filtering pairings by base=YEG
 * showed the filtered count badge (321/1943) but NO chip on the Pairing pane: chips were
 * read only from pairing-query sessions (whose filters are always {}), and the roster-only
 * globalFilterChips mechanism was never wired into the pairing/flight panes.
 * Truth via DOM chips + __ganttTest.filters().applied + loaded-object fields.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, flightObjects, waitGanttReady } from '../../utils/gantt-hook'

declare global {
  interface Window {
    __ganttTest?: {
      counts: () => { pairing: number; flightLegs: number }
      filters: () => { applied: null | { pairing: { bases: string[]; fleets: string[] }; flight: { depArps: string[] } } }
      pairings: () => Array<{ base: string | null; fleet: string | null }>
      applyPairingFilter: (f: { bases?: string[]; fleets?: string[] }) => Promise<void>
      applyFlightFilter: (f: { depArps?: string[] }) => Promise<void>
    }
  }
}

test.describe('Pairing global-filter chips', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectPairingPaneVisible()
    await expect.poll(async () => page.evaluate(() => window.__ganttTest!.counts().pairing))
      .toBeGreaterThan(0)
  })

  test('Live-1121 — applying base + fleet shows a chip per value on the pairing pane; × removes it @smoke', async ({ page }) => {
    const pairingChips = dashboard.pairingPane.getByTestId('pane-filter-chip')

    // No global filter yet -> no chips on the pairing pane.
    await expect(pairingChips).toHaveCount(0)

    // Apply base=YEG + fleet=737 through the real apply pipeline (filter-store -> applyGanttFilters).
    await page.evaluate(() => window.__ganttTest!.applyPairingFilter({ bases: ['YEG'], fleets: ['737'] }))
    await expect
      .poll(async () => page.evaluate(() => window.__ganttTest!.filters().applied?.pairing.bases[0]))
      .toBe('YEG')

    // One chip per filter value appears on the pairing pane strip.
    await expect(pairingChips.filter({ hasText: 'YEG' }).first()).toBeVisible()
    await expect(pairingChips.filter({ hasText: '737' }).first()).toBeVisible()

    // Data truth: the loaded pairings actually match the chip values (not just a badge).
    const loaded = await page.evaluate(() => window.__ganttTest!.pairings())
    expect(loaded.length).toBeGreaterThan(0)
    expect(loaded.every((p) => p.base === 'YEG' && p.fleet === '737')).toBe(true)

    // Remove the YEG (base) chip -> base dropped from the applied filter, chip gone, fleet kept.
    await pairingChips.filter({ hasText: 'YEG' }).first().getByRole('button').click()
    await expect
      .poll(async () => page.evaluate(() => window.__ganttTest!.filters().applied?.pairing.bases.length ?? 0))
      .toBe(0)
    await expect(pairingChips.filter({ hasText: 'YEG' })).toHaveCount(0)
    await expect(pairingChips.filter({ hasText: '737' }).first()).toBeVisible()
  })

  test('Live-1122 — flight pane shows a chip for the applied flight filter; × removes it', async ({ page }) => {
    await dashboard.addFlightPane()
    const flightChips = dashboard.flightPane.getByTestId('pane-filter-chip')
    await expect(flightChips).toHaveCount(0)

    // Rule 1 (filter-test-rules.md): YYZ is the confirmed demo-dataset flight dep airport.
    // Original test used 'YEG' which has no confirmed flights — chip would appear (store mutation)
    // but data verification would vacuously pass on an empty result set (§No-Illusion).
    const DEP = 'YYZ'

    // Apply depArp via the real store-hook pipeline (triggers server reload).
    await page.evaluate((dep) => window.__ganttTest!.applyFlightFilter({ depArps: [dep] }), DEP)
    await expect
      .poll(async () => page.evaluate(() => window.__ganttTest!.filters().applied?.flight.depArps[0]))
      .toBe(DEP)

    // UI: chip visible on the flight pane strip.
    await expect(flightChips.filter({ hasText: DEP }).first()).toBeVisible()

    // Rule 2 (filter-test-rules.md): verify actual data — wait for server reload then
    // assert every loaded flight leg departs from the filtered airport.
    await waitGanttReady(page)
    const legs = await flightObjects(page)
    expect(legs.length, `flights departing ${DEP} must be present`).toBeGreaterThan(0)
    expect(
      legs.every((f) => f.depArp === DEP),
      `every loaded flight leg must have depArp === ${DEP}`,
    ).toBe(true)

    // Remove the chip -> filter cleared, chip gone.
    await flightChips.filter({ hasText: DEP }).first().getByRole('button').click()
    await expect
      .poll(async () => page.evaluate(() => window.__ganttTest!.filters().applied?.flight.depArps.length ?? 0))
      .toBe(0)
    await expect(flightChips).toHaveCount(0)
  })
})
