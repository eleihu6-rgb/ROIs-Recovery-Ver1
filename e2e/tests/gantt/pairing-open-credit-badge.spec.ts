import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Pairing pane — open/partial coverage total credit badge (HH:MM) + "Main" title removal.
 *
 * Feature:
 *   1. Next to the pairing count badge, show the TOTAL credit (HH:MM) of the still-uncovered
 *      pairings — but ONLY when the Coverage filter narrows to Open and/or Partial. The credit
 *      comes from each pairing's own credit (the Cred column), summed.
 *   2. To save space the pane titles dropped the redundant "Main": "Roster Main" → "Roster",
 *      "Pairing Main" → "Pairing".
 *
 * The badge under test is rendered by the REAL pairing pane component and asserted in the real
 * DOM (the credit value is cross-checked against __ganttTest.pairingOpenCredit(), the same math
 * the badge renders — a true value regression, not just a format check). Coverage is set through
 * the in-app filter store via the repo's standard `applyPairingFilter` test hook (the same setup
 * mechanism the other pairing-filter specs use); this is a view filter, not a business write.
 */

type Totals = { total: number; unfilteredTotal: number }
type Coverage = 'open' | 'partial' | 'full' | 'over'

const ALL_COVERAGE: Coverage[] = ['open', 'partial', 'full', 'over']

const setCoverage = (page: Page, coverage: Coverage[]): Promise<void> =>
  page.evaluate((cov) => (window as unknown as {
    __ganttTest: { applyPairingFilter: (f: { coverage: string[] }) => Promise<void> }
  }).__ganttTest.applyPairingFilter({ coverage: cov }), coverage)

test.describe('Pairing pane open-credit badge + Main-title removal', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)
  })

  test('Live-1295 — pane titles drop "Main" (Roster / Pairing)', async () => {
    // The main panes are titled "Roster" and "Pairing" — the redundant "Main" suffix is gone.
    const rosterTitle = dashboard.rosterPane.getByTestId('pane-title-section').first()
    const pairingTitle = dashboard.pairingPane.getByTestId('pane-title-section').first()
    // Generous timeout absorbs the cold first-load pane mount (panes settle after nav).
    await expect(rosterTitle).toContainText('Roster', { timeout: 15_000 })
    await expect(rosterTitle).not.toContainText('Main')
    await expect(pairingTitle).toContainText('Pairing', { timeout: 15_000 })
    await expect(pairingTitle).not.toContainText('Main')
  })

  test('Live-1296 — default Coverage (Open+Partial) shows the credit badge (HH:MM = sum of those pairings) @smoke', async ({ page }) => {
    const totals = await readHook<Totals>(page, 'pairingTotals')
    test.skip(totals.unfilteredTotal === 0, 'no pairings in date range')

    // The pairing pane defaults to Open+Partial coverage (matches the screenshot's active
    // "Open, Partial" chip), so the open-credit badge is shown out of the box.
    const badge = dashboard.pairingPane.getByTestId('pane-open-credit')
    await expect(badge).toBeVisible({ timeout: 5_000 })

    // Badge text is HH:MM (the project's credit format; hours may exceed 2 digits).
    const badgeText = (await badge.textContent() ?? '').trim()
    expect(badgeText).toMatch(/^\d{2,}:\d{2}$/)

    // The badge equals the hook's computed open/partial credit (same math) — a value regression.
    const expected = await readHook<string | null>(page, 'pairingOpenCredit')
    expect(expected).not.toBeNull()
    expect(badgeText).toBe(expected)

    // Sanity: there ARE open/partial pairings loaded, so credit must be non-zero minutes.
    const [hh, mm] = badgeText.split(':').map(Number)
    expect(hh * 60 + mm).toBeGreaterThan(0)
  })

  test('Live-1297 — widening Coverage to include Full hides the badge', async ({ page }) => {
    const totals = await readHook<Totals>(page, 'pairingTotals')
    test.skip(totals.unfilteredTotal === 0, 'no pairings in date range')

    // Default (Open+Partial) → badge present.
    await expect(dashboard.pairingPane.getByTestId('pane-open-credit')).toBeVisible({ timeout: 5_000 })

    // Widen to all four states → selection contains Full/Over → no longer an open/partial
    // subset → the badge disappears (and the hook returns null).
    await setCoverage(page, ALL_COVERAGE)
    await expect(dashboard.pairingPane.getByTestId('pane-open-credit')).toHaveCount(0)
    expect(await readHook<string | null>(page, 'pairingOpenCredit')).toBeNull()
  })

  test('Live-1298 — Open-only credit ≤ Open+Partial credit (Partial pairings only add)', async ({ page }) => {
    const totals = await readHook<Totals>(page, 'pairingTotals')
    test.skip(totals.unfilteredTotal === 0, 'no pairings in date range')

    await setCoverage(page, ['open', 'partial'])
    await expect(dashboard.pairingPane.getByTestId('pane-open-credit')).toBeVisible({ timeout: 5_000 })
    const openPartial = await readHook<string | null>(page, 'pairingOpenCredit')

    await setCoverage(page, ['open'])
    await expect(dashboard.pairingPane.getByTestId('pane-open-credit')).toBeVisible()
    const openOnly = await readHook<string | null>(page, 'pairingOpenCredit')

    const toMin = (s: string | null) => { const [h, m] = (s ?? '0:0').split(':').map(Number); return h * 60 + m }
    expect(toMin(openOnly)).toBeLessThanOrEqual(toMin(openPartial))
  })
})
