/**
 * Flight Navi — a table navigator over the Gantt's flights with filters and one-click
 * navigation to a flight's pairings (PTNs), crew (Roster), and detail card (COF).
 *
 * Assertions follow §No-Illusion: filters are proven by the actual rows that remain (right
 * present, wrong absent), and the navi actions by the real store effect — the brought-to-top
 * "found" ids exposed via window.__ganttTest.foundIds(pane) — not by "no error shown".
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, addFlightPane, readHook } from '../../utils/gantt-hook'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

const foundIds = (page: Page, pane: 'pairing' | 'roster-main'): Promise<string[]> =>
  page.evaluate((p) => {
    const api = window.__ganttTest as unknown as { foundIds: (x: string) => string[] }
    return api.foundIds(p)
  }, pane)

const formatEnglishDate = (ymd: string): string => {
  const [year, month, day] = ymd.split('-').map(Number)
  return `${MONTH_SHORT[month - 1]} ${day}, ${year}`
}

const formatEnglishMonth = (ymd: string): string => {
  const [year, month] = ymd.split('-').map(Number)
  return `${MONTH_LONG[month - 1]} ${year}`
}

const openNavi = async (page: Page): Promise<void> => {
  await page.getByTestId('flight-navi-button').click()
  await expect(page.getByTestId('flight-navi-dialog')).toBeVisible()
  // Wait until the navi table has fetched + rendered its own flight set.
  await expect.poll(() => page.locator('[data-testid^="flight-navi-row-"]').count(), {
    timeout: 30_000,
    message: 'flight navi never listed any flights',
  }).toBeGreaterThan(0)
}

/** Resolve the flight id from a row testid, e.g. "flight-navi-row-123" → "123". */
const idOf = async (rowLocatorTestId: string): Promise<string> => rowLocatorTestId.split('-').pop() ?? ''

test.describe('Flight Navi', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    // Flight pane hosts the Navi button; opening it also loads the flight set on the Gantt.
    await addFlightPane(page)
  })

  test('Live-1064 — opens and lists flights with a count line @smoke', async ({ page }) => {
    await openNavi(page)
    // The table is row-windowed, so the DOM holds only the visible slice — the count line
    // (filtered of total) is the source of truth for "how many flights".
    const visible = await page.locator('[data-testid^="flight-navi-row-"]').count()
    expect(visible).toBeGreaterThan(0)
    await expect(page.getByTestId('flight-navi-count')).toContainText(/\d+ of \d+ flights/)

    // Date range defaults to the Gantt's current open period.
    const range = await readHook<{ start: string; end: string }>(page, 'dateRange')
    const startDate = range.start.slice(0, 10)
    const endDate = range.end.slice(0, 10)
    const startPicker = page.getByTestId('flight-navi-date-start')
    const endPicker = page.getByTestId('flight-navi-date-end')
    await expect(startPicker).toContainText(formatEnglishDate(startDate))
    await expect(endPicker).toContainText(formatEnglishDate(endDate))
    await expect(page.locator('input[type="date"]')).toHaveCount(0)

    await startPicker.click()
    await expect(page.getByText(formatEnglishMonth(startDate), { exact: true })).toBeVisible()
    const startIso = page.getByRole('textbox', { name: /flight navi date range start iso value/i })
    await expect(startIso).toBeVisible()
    await expect(startIso).toHaveAttribute('type', 'text')
    await expect(startIso).toHaveValue(startDate)
  })

  test('Live-1065 — is a non-modal navigator — no dimming overlay hides the panes (regression)', async ({ page }) => {
    // Regression: Flight Navi was a modal AppDialog, so a full-screen bg-black/25 overlay
    // dimmed and covered the roster/pairing panes — the user clicked Roster/PTNs but could
    // not SEE the navigated crew/pairings float to the top. A navigator must be non-modal.
    await openNavi(page)
    // No dimming overlay must exist while the navigator is open.
    await expect(page.locator('.fixed.inset-0.bg-black\\/25')).toHaveCount(0)
    // The dialog and the panes behind it are both visible at once.
    await expect(page.getByTestId('flight-navi-dialog')).toBeVisible()
    await expect(page.getByTestId('roster-pane')).toBeVisible()
    await expect(page.getByTestId('pairing-pane')).toBeVisible()
    // Non-modal means the rest of the app is NOT aria-hidden behind the dialog.
    const appHidden = await page.locator('body [aria-hidden="true"]').filter({ has: page.getByTestId('roster-pane') }).count()
    expect(appHidden).toBe(0)
  })

  test('Live-1066 — DEP filter narrows to matching departures only', async ({ page }) => {
    await openNavi(page)
    // Take the departure airport of the first row as the filter target.
    const firstId = await idOf((await page.locator('[data-testid^="flight-navi-row-"]').first().getAttribute('data-testid')) ?? '')
    const dep = (await page.getByTestId(`navi-dep-${firstId}`).innerText()).trim()
    expect(dep).not.toEqual('')

    await page.getByTestId('flight-navi-dep').fill(dep)

    // Every visible row must depart from `dep`; assert across all rendered DEP cells.
    await expect.poll(async () => {
      const cells = await page.locator('[data-testid^="navi-dep-"]').allInnerTexts()
      return cells.length > 0 && cells.every((c) => c.trim().toUpperCase() === dep.toUpperCase())
    }, { message: 'rows with a different DEP survived the filter' }).toBe(true)
  })

  test('Live-1265 — fizz "-ARR" shows arrivals into that airport', async ({ page }) => {
    await openNavi(page)
    const firstId = await idOf((await page.locator('[data-testid^="flight-navi-row-"]').first().getAttribute('data-testid')) ?? '')
    const arr = (await page.getByTestId(`navi-arr-${firstId}`).innerText()).trim()
    expect(arr).not.toEqual('')

    await page.getByTestId('flight-navi-fizz').fill(`-${arr}`)

    await expect.poll(async () => {
      const cells = await page.locator('[data-testid^="navi-arr-"]').allInnerTexts()
      return cells.length > 0 && cells.every((c) => c.trim().toUpperCase() === arr.toUpperCase())
    }, { message: 'a flight not arriving into the airport survived the -ARR fizz' }).toBe(true)
  })

  test('Live-1067 — FLT Reg dropdown narrows to a single registration', async ({ page }) => {
    await openNavi(page)
    const select = page.getByTestId('flight-navi-reg')
    // Pick the first real registration option (index 0 is the "FLT Reg" placeholder).
    const reg = await select.locator('option').nth(1).getAttribute('value')
    test.skip(!reg, 'no aircraft registration available in the loaded flights')
    await select.selectOption(reg as string)

    await expect.poll(async () => {
      const cells = await page.locator('[data-testid^="navi-reg-"]').allInnerTexts()
      return cells.length > 0 && cells.every((c) => c.trim() === reg)
    }, { message: 'a flight with a different registration survived the FLT Reg filter' }).toBe(true)
  })

  test('Live-1068 — COF cell opens the flight detail dialog', async ({ page }) => {
    await openNavi(page)
    const firstId = await idOf((await page.locator('[data-testid^="flight-navi-row-"]').first().getAttribute('data-testid')) ?? '')
    await page.getByTestId(`navi-cof-${firstId}`).click()
    await expect(page.getByTestId('flight-detail-dialog')).toBeVisible()
  })

  test('Live-1069 — PTNs cell brings the flight\'s pairings to the top of the pairing pane', async ({ page }) => {
    await openNavi(page)
    // Filter to pairing-covered flights so every rendered row has an enabled PTNs cell
    // (deterministic under row-windowing — the first visible cell is always clickable).
    await page.getByTestId('flight-navi-toggle-pc').click()
    const ptns = page.locator('[data-testid^="navi-ptns-"]:not([disabled])')
    await expect.poll(() => ptns.count(), { timeout: 15_000 }).toBeGreaterThan(0)

    await ptns.first().click()

    // Real store effect: the pairings are recorded as "found" and floated to the pane top.
    // Poll because the float + canvas redraw (publishing the row order) is async.
    await expect.poll(async () => {
      const found = await foundIds(page, 'pairing')
      if (found.length === 0) return false
      const order = await readHook<Array<{ id: string; label: string }>>(page, 'pairingPanelOrder')
      return order.length > 0 && found.includes(order[0]?.id)
    }, { timeout: 15_000, message: 'the flight\'s pairing was not floated to the top of the pairing pane' }).toBe(true)
  })

  test('Live-1070 — Roster cell brings the flight\'s crew to the top of the roster pane', async ({ page }) => {
    await openNavi(page)
    // Filter to roster-covered flights so every rendered row has an enabled Roster cell.
    await page.getByTestId('flight-navi-toggle-rc').click()
    const rosterCells = page.locator('[data-testid^="navi-roster-"]:not([disabled])')
    await expect.poll(() => rosterCells.count(), { timeout: 15_000 }).toBeGreaterThan(0)

    await rosterCells.first().click()

    // Crew are fetched + appended, recorded as "found", and floated to the roster top.
    // Assert the requirement directly: the flight's crew occupy the TOP rows of the roster
    // pane (not just one of them). Poll because the append + canvas redraw is async.
    await expect.poll(async () => {
      const found = await foundIds(page, 'roster-main')
      if (found.length === 0) return false
      const order = await readHook<Array<{ crewId: string; rank: string }>>(page, 'rosterPanelOrder')
      const topRows = order.slice(0, found.length).map((r) => r.crewId)
      return topRows.length === found.length && topRows.every((id) => found.includes(id))
    }, { timeout: 15_000, message: 'the flight\'s crew were not floated to the top of the roster pane' }).toBe(true)
  })
})
