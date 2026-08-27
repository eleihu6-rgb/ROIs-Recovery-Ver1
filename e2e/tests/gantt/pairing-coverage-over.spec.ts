import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, openFilter, applyFilter } from '../../utils/gantt-hook'
import { coverageOf, type Coverage } from '../../utils/coverage'

/**
 * Pairing Coverage — `over` state (spec 2026-06-11-pairing-coverage-over-state).
 * Adds a 4th coverage state for OVER-staffed pairings (a rank slot with fill > plan,
 * no shortage) to the Coverage filter, with a chip and bring-to-top float identical
 * to open/partial/full. Precedence is shortage-wins: over-on-one-rank + short-on-another
 * classifies as partial, not over.
 *
 * Regression baseline: before this change "Over" was not a selectable coverage option.
 */

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

type PairingRow = { id: string; label: string }

const coverageMap = async (request: APIRequestContext, token: string): Promise<Map<string, Coverage>> => {
  const res = await request.get(
    `${GANTT_API}/api/pairing?startDate=2026-05-01&endDate=2026-07-31&pageSize=5000`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.ok(), `pairing list ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: { items: { id: number; composition?: { plan?: number; fill?: number }[] }[] } }
  const m = new Map<string, Coverage>()
  for (const p of json.data.items) m.set(String(p.id), coverageOf(p))
  return m
}

const waitStable = async (read: () => Promise<PairingRow[]>): Promise<PairingRow[]> => {
  let prev = ''
  await expect.poll(async () => {
    const cur = JSON.stringify(await read())
    const stable = cur === prev && cur !== '[]'
    prev = cur
    return stable
  }, { timeout: 30_000, intervals: [600] }).toBe(true)
  return read()
}

/** The Coverage chip in the condition strip has title `Coverage: <value>`. */
const coverageChip = (page: Page) =>
  page.locator('[data-testid="pane-filter-chip"][title^="Coverage:"]')

/** From default (Open+Partial), set the coverage pills to EXACTLY the given states. */
const selectOnlyCoverage = async (page: Page, want: Coverage[]): Promise<void> => {
  const all: Coverage[] = ['open', 'partial', 'full', 'over']
  const def: Coverage[] = ['open', 'partial'] // pills active when the dialog opens
  for (const state of all) {
    const shouldBeOn = want.includes(state)
    const isOn = def.includes(state)
    if (shouldBeOn !== isOn) await page.getByTestId(`filter-pairing-coverage-${state}`).click()
  }
}

test.describe('Pairing Coverage — Over state', () => {
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

  test('Live-1273 — Over is a selectable coverage option and renders an "Over" chip', async ({ page }) => {
    await waitStable(() => readHook<PairingRow[]>(page, 'pairingPanelOrder'))

    await openFilter(page, 'pairing')
    // Regression core: the Over pill exists (it did not before this feature).
    await expect(page.getByTestId('filter-pairing-coverage-over')).toBeVisible()

    await selectOnlyCoverage(page, ['over'])
    await applyFilter(page)

    // The condition-strip Coverage chip now reads "Over".
    await expect(coverageChip(page)).toBeVisible()
    await expect(coverageChip(page)).toHaveAttribute('title', 'Coverage: Over')
  })

  test('Live-1115 — selecting only Over floats over-staffed pairings to the top', async ({ page }) => {
    await waitStable(() => readHook<PairingRow[]>(page, 'pairingPanelOrder'))

    const loaded = (await readHook<PairingRow[]>(page, 'pairingPanelOrder')).filter((r) => cov.has(r.id))
    const overCount = loaded.filter((r) => cov.get(r.id) === 'over').length
    const nonOverCount = loaded.filter((r) => cov.get(r.id) !== 'over').length
    test.skip(overCount === 0 || nonOverCount === 0, 'need both over-staffed and non-over pairings loaded')

    await openFilter(page, 'pairing')
    await selectOnlyCoverage(page, ['over'])
    await applyFilter(page)

    const order = (await readHook<PairingRow[]>(page, 'pairingPanelOrder')).filter((r) => cov.has(r.id))
    const lastOverIdx = Math.max(...order.map((r, i) => (cov.get(r.id) === 'over' ? i : -1)))
    const firstNonOverIdx = Math.min(...order.map((r, i) => (cov.get(r.id) !== 'over' ? i : Number.MAX_SAFE_INTEGER)))
    expect(lastOverIdx, 'over-staffed pairings floated above non-over after selecting Over').toBeLessThan(firstNonOverIdx)
  })

  test('Live-1116 — mixed over+short pairing classifies as Partial, not Over (shortage wins)', async ({ request }) => {
    // Pure backend-data assertion of the precedence rule via the shared classifier.
    const res = await request.get(
      `${GANTT_API}/api/pairing?startDate=2026-05-01&endDate=2026-07-31&pageSize=5000`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.ok()).toBeTruthy()
    const json = (await res.json()) as {
      data: { items: { id: number; composition?: { plan?: number; fill?: number }[] }[] }
    }
    const mixed = json.data.items.find((p) => {
      const comp = p.composition ?? []
      return comp.some((c) => (c.fill ?? 0) > (c.plan ?? 0)) && comp.some((c) => (c.fill ?? 0) < (c.plan ?? 0))
    })
    test.skip(!mixed, 'no over-on-one-rank + short-on-another pairing in the dataset')
    expect(coverageOf(mixed!), 'shortage wins: a still-short pairing is partial even with surplus').toBe('partial')
  })

  test('Live-1117 — selecting all four coverage states clears the narrowing chip', async ({ page }) => {
    await waitStable(() => readHook<PairingRow[]>(page, 'pairingPanelOrder'))

    await openFilter(page, 'pairing')
    await selectOnlyCoverage(page, ['open', 'partial', 'full', 'over'])
    await applyFilter(page)

    // All four selected = no narrowing → no Coverage chip in the condition strip.
    await expect(coverageChip(page)).toHaveCount(0)
  })
})
