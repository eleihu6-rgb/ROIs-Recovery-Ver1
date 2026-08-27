/**
 * Pairing Division filter — global Filter dialog › Pairing tab › Division (P = Pilot/
 * flight crew, C = Cabin crew). The filter is server-side: GET /api/pairing applies
 * `eq(pairing.division, division)`, so a Pilot filter must yield only division-'P'
 * pairings and a Cabin filter only division-'C' pairings.
 *
 * `pairing.division` is the authoritative per-pairing Pilot/Cabin marker (a single
 * 'P'|'C' value). A pairing whose *composition* mixes pilot ranks (CA/FO) and cabin
 * ranks (IFD/FA) still carries one division and is included under that division — so
 * we assert on `division`, NOT on composition ranks. That both (a) matches what the
 * filter actually constrains and (b) honours "a pairing covering both pilot and cabin
 * is OK": such a pairing is never wrongly excluded, and the handful of data rows where
 * a division-'P' pairing carries a cabin rank don't produce false failures.
 *
 * Regression (the bug this guards): committing a draft that touched pairings reloaded
 * the Pairing pane via fetchPairings(dateRange) WITHOUT the active filter, pulling the
 * full unfiltered list while the filter chips kept showing — a Cabin pairing then
 * surfaced under the Pilot filter. The fix routes that reload through
 * reloadPairingsAfterCommit (filter-aware); `simulatePairingCommitReload` runs that
 * exact code so this test would have failed before the fix.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, pairingObjects } from '../../utils/gantt-hook'

declare global {
  interface Window {
    __ganttTest?: {
      applyPairingFilter: (f: { divisions?: string[] }) => Promise<void>
      simulatePairingCommitReload: () => Promise<void>
    }
  }
}

const divisionsOf = (rows: Array<Record<string, unknown>>): string[] =>
  rows.map((r) => r.division).filter((v): v is string => typeof v === 'string' && v !== '')

const distinct = (xs: string[]): string[] => [...new Set(xs)]

test.describe('Pairing Division Filter', () => {
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

  test('Live-1118 — Pilot filter shows only Pilot-division pairings — no Cabin pairings @smoke', async ({ page }) => {
    // Only meaningful when the loaded window actually contains both divisions.
    const present = distinct(divisionsOf(await pairingObjects(page)))
    test.skip(!present.includes('P'), `no Pilot (P) pairings in the loaded window ([${present}])`)

    await page.evaluate(() => window.__ganttTest!.applyPairingFilter({ divisions: ['P'] }))

    await expect.poll(async () => {
      const rows = await pairingObjects(page)
      return rows.length > 0 && rows.every((p) => p.division === 'P')
    }, { message: 'every loaded pairing is division P (no Cabin pairings leak through)' }).toBe(true)

    // Explicit "no Cabin" assertion the way the bug report framed it.
    expect(divisionsOf(await pairingObjects(page)), 'no division-C (Cabin) pairing present under Pilot filter')
      .not.toContain('C')

    // Match the Division chip by its exact title — a loose hasText:'P' would also catch
    // the "Open, Partial" coverage chip.
    const chip = dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Division: P"]')
    await expect(chip).toHaveCount(1)
  })

  test('Live-1119 — Cabin filter shows only Cabin-division pairings — no Pilot pairings', async ({ page }) => {
    const present = distinct(divisionsOf(await pairingObjects(page)))
    test.skip(!present.includes('C'), `no Cabin (C) pairings in the loaded window ([${present}])`)

    await page.evaluate(() => window.__ganttTest!.applyPairingFilter({ divisions: ['C'] }))

    await expect.poll(async () => {
      const rows = await pairingObjects(page)
      return rows.length > 0 && rows.every((p) => p.division === 'C')
    }, { message: 'every loaded pairing is division C (no Pilot pairings leak through)' }).toBe(true)

    expect(divisionsOf(await pairingObjects(page)), 'no division-P (Pilot) pairing present under Cabin filter')
      .not.toContain('P')
  })

  test('Live-1120 — draft-commit pairing reload keeps the division filter (Cabin pairing never resurfaces under Pilot)', async ({ page }) => {
    const present = distinct(divisionsOf(await pairingObjects(page)))
    test.skip(!present.includes('P') || !present.includes('C'),
      `regression needs both divisions in the window ([${present}])`)

    // Apply the Pilot filter and confirm the steady state is clean.
    await page.evaluate(() => window.__ganttTest!.applyPairingFilter({ divisions: ['P'] }))
    await expect.poll(async () => {
      const rows = await pairingObjects(page)
      return rows.length > 0 && rows.every((p) => p.division === 'P')
    }, { message: 'Pilot filter applied — only division P loaded' }).toBe(true)
    const filteredCount = (await counts(page)).pairing

    // Re-run the EXACT reload a pairing-op draft commit triggers. Before the fix this
    // dropped the filter and repopulated the pane with the full unfiltered list.
    await page.evaluate(() => window.__ganttTest!.simulatePairingCommitReload())

    await expect.poll(async () => {
      const rows = await pairingObjects(page)
      return rows.length > 0 && rows.every((p) => p.division === 'P')
    }, { message: 'after the post-commit reload the pane is STILL only division P' }).toBe(true)

    // The set must stay the filtered size, not balloon to the unfiltered total.
    expect(divisionsOf(await pairingObjects(page)), 'no Cabin pairing resurfaced after reload').not.toContain('C')
    expect((await counts(page)).pairing, 'reload did not silently revert to the unfiltered list')
      .toBeLessThanOrEqual(filteredCount)
  })
})
