/**
 * Rank-scoped pairing coverage: Rank=CA + Open/Partial must hide pairings whose
 * CA seats are full even when FO (or another rank) is still short.
 *
 * Note: __ganttTest.pairings() returns the store (all loaded). Visible rows are
 * pairingPanelOrder — assert against that order.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  seedGanttAuth,
  openFilter,
  applyFilter,
  selectDropdownOption,
  readHook,
  counts,
} from '../../utils/gantt-hook'

type CompSlot = { rank: string | null; plan: number; fill: number }
type PairingRow = { id: number; composition: CompSlot[] }
type OrderRow = { id: string; label: string }

const visiblePairings = async (page: Page): Promise<PairingRow[]> => {
  const order = await readHook<OrderRow[]>(page, 'pairingPanelOrder')
  const all = await readHook<PairingRow[]>(page, 'pairings')
  const byId = new Map(all.map((p) => [String(p.id), p]))
  return order.map((r) => byId.get(r.id)).filter((p): p is PairingRow => !!p)
}

const caSlots = (p: PairingRow): CompSlot[] =>
  (p.composition ?? []).filter((s) => s.rank === 'CA')

const caNeedsCrew = (p: PairingRow): boolean =>
  caSlots(p).some((s) => s.fill < s.plan)

test.describe('Pairing rank-scoped coverage', () => {
  test('Live-1510 — Rank=CA + Open/Partial hides CA-filled pairings (even if FO short)', async ({
    page,
    request,
  }) => {
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)

    // Default coverage is already Open+Partial — only add Rank=CA.
    await openFilter(page, 'pairing')
    const hasCa = await optionVisible(page, 'filter-pairing-rank', 'CA')
    test.skip(!hasCa, 'rank option CA is not visible')

    await selectDropdownOption(page, 'filter-pairing-rank', 'CA', 'pairing')
    await applyFilter(page)

    await expect(dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Rank: CA"]')).toHaveCount(1)
    await expect(
      dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Coverage: Open, Partial"]'),
    ).toHaveCount(1)

    await expect
      .poll(async () => (await visiblePairings(page)).length, { timeout: 30_000 })
      .toBeGreaterThan(0)

    const visible = await visiblePairings(page)
    const withCa = visible.filter((p) => caSlots(p).length > 0)
    test.skip(withCa.length === 0, 'no visible pairings with CA composition slots')

    // Every visible pairing with CA must still need CA crew.
    for (const p of withCa) {
      expect(
        caNeedsCrew(p),
        `pairing ${p.id} has CA filled but is still visible under Rank=CA + Open/Partial`,
      ).toBe(true)
    }

    // Positive: at least one short-CA row is shown (filter is not empty/wrong).
    expect(withCa.some(caNeedsCrew)).toBe(true)

    // Regression proof when data has CA-full/FO-short in the store: those ids must not be visible.
    const all = await readHook<PairingRow[]>(page, 'pairings')
    const caFullInStore = all.filter(
      (p) => caSlots(p).length > 0 && caSlots(p).every((s) => s.fill >= s.plan),
    )
    const visibleIds = new Set(visible.map((p) => String(p.id)))
    for (const p of caFullInStore) {
      expect(
        visibleIds.has(String(p.id)),
        `CA-full pairing ${p.id} must be hard-hidden when Rank=CA + Open/Partial`,
      ).toBe(false)
    }

    // Badge numerator = visible panel rows (client hard filter), not server store.total.
    const order = await readHook<OrderRow[]>(page, 'pairingPanelOrder')
    const totals = await readHook<{ total: number; unfilteredTotal: number }>(page, 'pairingTotals')
    const title = dashboard.pairingPane.getByTestId('pane-title-section')
    const funnel = title.getByTestId('pane-filtered-count')
    await expect(funnel).toHaveText(`${order.length}/${totals.unfilteredTotal}`)
    // Exactly one amber filter-count badge — no secondary matchedTotal (server facet 162).
    await expect(title.locator('.text-amber-400')).toHaveCount(1)
    if (totals.total !== order.length) {
      await expect(title.getByText(String(totals.total), { exact: true })).toHaveCount(0)
    }
  })
})

const optionVisible = async (page: Page, testId: string, value: string): Promise<boolean> => {
  await page.getByTestId(`${testId}-trigger`).click()
  const visible = await page.getByTestId(`${testId}-opt-${value}`).isVisible({ timeout: 2_000 }).catch(() => false)
  await page.getByTestId('filter-tab-pairing').click()
  return visible
}
