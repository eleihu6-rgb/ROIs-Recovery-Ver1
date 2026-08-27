import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, openFilter, applyFilter } from '../../utils/gantt-hook'

/**
 * Pairing pane Coverage badge — Coverage-driven matched/total funnel.
 *
 * Aligns the Pairing pane title badge with the Roster pane: when the Coverage filter
 * narrows (strict subset of all 4 states), the plain `≡ total` badge becomes the
 * `▼ matched/total` funnel, where `matched` is the count of LOADED pairing rows whose
 * coverage is in the selection (client-side; climbs as pages stream).
 *
 * Default is now ALL_COVERAGE (open+partial+full+over) → no narrowing → plain total.
 * Narrowing (e.g. to Open+Partial only) activates the funnel.
 *
 * §Stale-Test: Live-1111 and Live-1112 were rewritten when the default coverage changed
 * from ['open','partial'] (old default that showed funnel by default) to ALL_COVERAGE
 * (new default that shows plain total by default, funnel only on explicit narrowing).
 */

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

type Coverage = 'open' | 'partial' | 'full' | 'over'
type PairingRow = { id: string; label: string }
type Totals = { total: number; unfilteredTotal: number }

/** Mirror of classifyCoverage(): empty comp → full; fill 0 → open; fill > plan → over; isFull → full; else partial. */
const coverageOf = (p: {
  composition?: { fill?: number; plan?: number }[]
  isFull?: boolean
}): Coverage => {
  const comp = p.composition ?? []
  if (comp.length === 0) return 'full'
  const totalFill = comp.reduce((s, c) => s + (c.fill ?? 0), 0)
  if (totalFill === 0) return 'open'
  const totalPlan = comp.reduce((s, c) => s + (c.plan ?? 0), 0)
  if (totalFill > totalPlan) return 'over'
  return p.isFull ? 'full' : 'partial'
}

const coverageMap = async (request: APIRequestContext, token: string): Promise<Map<string, Coverage>> => {
  const res = await request.get(
    `${GANTT_API}/api/pairing?startDate=2026-05-01&endDate=2026-07-31&pageSize=5000`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.ok(), `pairing list ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as {
    data: { items: { id: number; composition?: { fill?: number; plan?: number }[]; isFull?: boolean }[] }
  }
  const m = new Map<string, Coverage>()
  for (const p of json.data.items) m.set(String(p.id), coverageOf(p))
  return m
}

/** Poll the rendered panel order until it stabilises (loaded + sorted), then return it. */
const waitStableOrder = async (page: Page): Promise<PairingRow[]> => {
  let prev = ''
  await expect
    .poll(
      async () => {
        const cur = JSON.stringify(await readHook<PairingRow[]>(page, 'pairingPanelOrder'))
        const stable = cur === prev && cur !== '[]'
        prev = cur
        return stable
      },
      { timeout: 30_000, intervals: [600] },
    )
    .toBe(true)
  return readHook<PairingRow[]>(page, 'pairingPanelOrder')
}

test.describe('Pairing pane Coverage badge (matched/total funnel)', () => {
  let dashboard: GanttDashboardPage
  let token: string
  let cov: Map<string, Coverage>

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    token = await seedGanttAuth(page, request)
    cov = await coverageMap(request, token)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)
  })

  test('Live-1111 — default Coverage (all states) shows plain total badge, no funnel', async ({ page }) => {
    // Default is ALL_COVERAGE → pairingCoverageNarrowed() = false → plain total shown
    const totals = await readHook<Totals>(page, 'pairingTotals')
    expect(totals.unfilteredTotal).toBeGreaterThan(0)

    const pairing = page.getByTestId('pairing-pane').first()
    // Plain total badge visible with the server's unfiltered total
    await expect(pairing.getByTestId('pane-total-count')).toHaveText(String(totals.unfilteredTotal))
    // No funnel badge — before the fix this test asserted the opposite (funnel was default)
    await expect(pairing.getByTestId('pane-filtered-count')).toHaveCount(0)
  })

  test('Live-1112 — narrowing Coverage to Open+Partial activates the funnel badge @smoke', async ({ page }) => {
    const totals = await readHook<Totals>(page, 'pairingTotals')
    test.skip(totals.unfilteredTotal === 0, 'no pairings in date range')

    // Narrow coverage to Open + Partial by deselecting Full and Over from the default all-selected state
    await openFilter(page, 'pairing')
    await page.getByTestId('filter-pairing-coverage-full').click()
    await page.getByTestId('filter-pairing-coverage-over').click()
    await applyFilter(page)

    const pairing = page.getByTestId('pairing-pane').first()
    // Funnel badge appears in "matched/total" format — coverage filter activated the funnel mode
    const badge = pairing.getByTestId('pane-filtered-count')
    await expect(badge).toBeVisible({ timeout: 5_000 })
    // Text must be "N/M" format (N = open|partial matches, M = unfiltered total)
    const badgeText = await badge.textContent() ?? ''
    expect(badgeText).toMatch(/^\d+\/\d+$/)
    const [numerator, denominator] = badgeText.split('/').map(Number)
    expect(numerator).toBeGreaterThan(0)
    expect(numerator).toBeLessThanOrEqual(denominator)
    // Plain-total badge is gone
    await expect(pairing.getByTestId('pane-total-count')).toHaveCount(0)
  })
})
