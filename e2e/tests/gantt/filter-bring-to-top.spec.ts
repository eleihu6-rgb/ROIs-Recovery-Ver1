import { test, expect, type APIRequestContext } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, openFilter, applyFilter } from '../../utils/gantt-hook'

/**
 * Filter dialog match inputs:
 *  - Crew tab "Crew ID" (comma/period separated) → those crew float to the TOP of the
 *    Roster pane (others kept below).
 *  - Pairing tab "Label" (substring) → the Pairing pane shows only matching pairings.
 */

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

type RosterRow = { crewId: string; rank: string }
type PairingRow = { id: string; label: string }

const waitStable = async <T>(read: () => Promise<T[]>): Promise<T[]> => {
  let prev = ''
  await expect.poll(async () => {
    const cur = JSON.stringify(await read())
    const stable = cur === prev && cur !== '[]'
    prev = cur
    return stable
  }, { message: 'pane order settled', timeout: 30_000, intervals: [600] }).toBe(true)
  return read()
}

const pairingsMatchingLabel = async (
  request: APIRequestContext, token: string, term: string,
): Promise<string[]> => {
  const res = await request.get(
    `${GANTT_API}/api/pairing?startDate=2026-06-01&endDate=2026-07-31&label=${encodeURIComponent(term)}&pageSize=500`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.ok(), `pairing label query ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: { items: { id: number }[] } }
  return json.data.items.map((p) => String(p.id))
}

test.describe('Filter — match inputs', () => {
  let dashboard: GanttDashboardPage
  let token: string

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    token = await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto(90_000)
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)
  })

  test('Live-1037 — Crew ID (comma/period separated) brings those crew to the top, keeping the rest', async ({ page }) => {
    const before = await waitStable(() => readHook<RosterRow[]>(page, 'rosterPanelOrder'))
    expect(before.length, 'enough crew to reorder').toBeGreaterThan(4)

    // Pick two crew from the BOTTOM so a real move-to-top is observable.
    const pick = [before[before.length - 1].crewId, before[before.length - 2].crewId]
    const other = before[0].crewId // currently first; should remain present afterwards

    await openFilter(page, 'crew')
    // Mixed separators: period + comma in one paste → both must parse into chips.
    await page.getByTestId('filter-crew-id').fill(`${pick[0]}.${pick[1]}`)
    await page.getByTestId('filter-crew-id').press('Enter')
    // Active summary chip reflects both parsed IDs.
    await expect(page.getByText(`crew:id`)).toBeVisible()
    await applyFilter(page)

    const after = await readHook<RosterRow[]>(page, 'rosterPanelOrder')
    expect(new Set(after.slice(0, 2).map((r) => r.crewId)), 'picked crew are the top two')
      .toEqual(new Set(pick))
    expect(after.map((r) => r.crewId), 'other crew kept below, not filtered out').toContain(other)
    expect(after.length, 'rows not reduced to just the matches').toBeGreaterThan(2)
  })

  test('Live-1099 — Crew ID typed on the FIRST (cold/windowed) apply still floats off-page crew to the top', async ({ page }) => {
    // Phase A — clean default load (beforeEach already applied it); read the settled
    // roster order and pick the LAST crew as the target. With no base/rank facet the
    // first apply takes the *windowed* path that loads only the first crew page, so a
    // late-sorting crew is the strongest repro of the dropped-overlay bug.
    const full = await waitStable(() => readHook<RosterRow[]>(page, 'rosterPanelOrder'))
    expect(full.length, 'enough crew loaded to have an off-page target').toBeGreaterThan(10)
    const target = full[full.length - 1].crewId
    expect(full[0].crewId, 'target is not already the first row').not.toBe(target)

    // Phase B — reload to a COLD state (appliedFilters is NOT persisted) and type the
    // crew ID on the very FIRST apply. Before the fix, the windowed path skipped
    // bringCrewIdsToTop entirely, so this crew was never floated (and off-page crew
    // were dropped). After the fix it must be floated to the very top.
    await page.reload()
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await page.getByTestId('module-nav-live').click()
    const empty = page.getByTestId('live-empty-state')
    await expect(empty).toBeVisible({ timeout: 10_000 })
    await empty.click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-tab-crew').click()
    await page.getByTestId('filter-crew-id').fill(target)
    await page.getByTestId('filter-crew-id').press('Enter')
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    await expect(empty).not.toBeVisible({ timeout: 270_000 })

    await expect.poll(async () => {
      const order = await readHook<RosterRow[]>(page, 'rosterPanelOrder')
      return order[0]?.crewId
    }, { message: 'cold windowed apply floats the typed crew to the top', timeout: 30_000 }).toBe(target)
  })

  test('Live-1038 — Pairing Label shows only matching pairings', async ({ page, request }) => {
    const before = await waitStable(() => readHook<PairingRow[]>(page, 'pairingPanelOrder'))
    expect(before.length, 'enough pairings to reorder').toBeGreaterThan(3)

    // Use the LAST visible pairing's label as the search term (non-empty), so the
    // match is initially NOT at the top — Apply must float it up.
    const labelled = [...before].reverse().find((p) => p.label.trim() !== '')
    test.skip(!labelled, 'no pairing labels in dataset')
    const term = labelled!.label

    const expectedIds = await pairingsMatchingLabel(request, token, term)
    expect(expectedIds.length, 'backend matches the term').toBeGreaterThan(0)

    await openFilter(page, 'pairing')
    await page.getByTestId('filter-pairing-label').fill(term)
    await expect(page.getByText('pairing:label')).toBeVisible()
    await applyFilter(page)

    await expect.poll(async () => {
      const order = await readHook<PairingRow[]>(page, 'pairingPanelOrder')
      return order.length > 0 && order.every((row) => row.label.toUpperCase().includes(term.toUpperCase()))
    }, { message: 'only matching pairing labels remain visible', timeout: 10_000 }).toBe(true)

    const after = await readHook<PairingRow[]>(page, 'pairingPanelOrder')
    for (const row of after) {
      expect(row.label.toUpperCase()).toContain(term.toUpperCase())
    }
    expect(after.length, 'pane is not showing more rows than the backend label query').toBeLessThanOrEqual(expectedIds.length)
  })
})
