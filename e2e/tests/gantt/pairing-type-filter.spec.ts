/**
 * Pairing Type filter — global Filter dialog › Pairing tab › Type (assignment code).
 *
 * The filter is server-side with true OR semantics (inArray on pairing.assignment),
 * and the Type dropdown is populated from the assignment codes that actually exist on
 * pairings (GET /api/pairing/types) — not the full assignment dictionary, which in this
 * dataset doesn't match the pairing rows.
 *
 * Anti-illusion: the demo dataset is uniform (one pairing type), so selecting that type
 * can't prove narrowing on its own. We therefore prove the server-side WHERE directly —
 * filtering by an absent code yields 0 pairings — then prove the dropdown→Apply→chip
 * wiring with the real present type. The OR/narrowing-by-selection path runs whenever the
 * dataset has ≥2 types.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, pairingObjects, openFilter } from '../../utils/gantt-hook'

const assignmentsOf = (rows: Array<Record<string, unknown>>): string[] =>
  rows.map((r) => r.assignment).filter((v): v is string => typeof v === 'string' && v !== '')

const distinct = (xs: string[]): string[] => [...new Set(xs)]

test.describe('Pairing Type Filter', () => {
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

  test('Live-1139 — Type filters server-side and wires a removable chip @smoke', async ({ page }) => {
    const present = distinct(assignmentsOf(await pairingObjects(page)))
    expect(present.length, 'loaded pairings expose assignment codes').toBeGreaterThan(0)
    const target = present[0]

    // (a) Server-side proof — filtering by a code ABSENT from the data narrows to 0.
    await page.evaluate(() => window.__ganttTest!.applyPairingFilter({ assignments: ['__NO_SUCH_TYPE__'] }))
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'an absent assignment code filters every pairing out (server-side WHERE works)',
    }).toBe(0)
    // reset back to all
    await page.evaluate(() => window.__ganttTest!.applyPairingFilter({ assignments: [] }))
    await expect.poll(async () => (await counts(page)).pairing).toBeGreaterThan(1)

    // (b) UI wiring — pick a real present type from the dropdown and Apply.
    await openFilter(page, 'pairing')
    const dialog = page.getByTestId('filter-dialog')
    await dialog.getByTestId('filter-pairing-type-trigger').click()
    await dialog.getByTestId(`filter-pairing-type-opt-${target}`).click()
    await dialog.getByTestId('filter-apply').click()
    await expect(dialog).toBeHidden()

    await expect.poll(async () => {
      const rows = await pairingObjects(page)
      return rows.length > 0 && rows.every((p) => p.assignment === target)
    }, { message: `all loaded pairings are type ${target}` }).toBe(true)

    const chip = dashboard.pairingPane.getByTestId('pane-filter-chip').filter({ hasText: target })
    await expect(chip).toHaveCount(1)
    await expect(chip).toHaveAttribute('title', `Type: ${target}`)

    // Removing the chip clears the type filter.
    await chip.getByRole('button').click()
    await expect(dashboard.pairingPane.getByTestId('pane-filter-chip').filter({ hasText: target })).toHaveCount(0)
  })

  test('Live-1140 — Type is true multi-value OR across selected codes; removing a chip narrows it', async ({ page }) => {
    const types = distinct(assignmentsOf(await pairingObjects(page)))
    test.skip(types.length < 2, `dataset has only ${types.length} pairing type(s) ([${types}]); OR needs ≥2`)
    const [a, b] = types

    await openFilter(page, 'pairing')
    const dialog = page.getByTestId('filter-dialog')
    await dialog.getByTestId('filter-pairing-type-trigger').click()
    await dialog.getByTestId(`filter-pairing-type-opt-${a}`).click()
    await dialog.getByTestId(`filter-pairing-type-opt-${b}`).click()
    await dialog.getByTestId('filter-apply').click()
    await expect(dialog).toBeHidden()

    await expect.poll(async () => {
      const got = distinct(assignmentsOf(await pairingObjects(page)))
      return got.length > 0 && got.every((t) => t === a || t === b)
    }, { message: `loaded set ⊆ {${a}, ${b}}` }).toBe(true)
    expect(distinct(assignmentsOf(await pairingObjects(page))), 'both types present in OR result')
      .toEqual(expect.arrayContaining([a, b]))

    const chips = dashboard.pairingPane.getByTestId('pane-filter-chip')
    await chips.filter({ hasText: a }).getByRole('button').click()
    await expect.poll(async () => {
      const got = distinct(assignmentsOf(await pairingObjects(page)))
      return got.length > 0 && got.every((t) => t === b)
    }, { message: `after removing ${a}, loaded set is only ${b}` }).toBe(true)
  })
})
