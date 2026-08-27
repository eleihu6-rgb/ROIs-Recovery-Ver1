import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, readHook, counts, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const HEADER_HEIGHT = 30
const ROW_HEIGHT = 43

interface RosterPanelRow {
  crewId: string
  seniority: string
}

interface RosterRecord {
  id: number
  crewId: string
}

/**
 * Right-click a roster row that is BOTH visible in the header canvas AND carries
 * a roster task, then click the given context-menu action. The header canvas only
 * paints ~9 rows at a time (438px at 1080p), so a crew at an arbitrary `rowIndex`
 * can be scrolled out of view and the right-click lands on the pairing pane.
 */
async function openRosterDialog(page: Page, action: 'Schedule Details' | 'Daily Task Calendar'): Promise<string> {
  const panelRows = await readHook<RosterPanelRow[]>(page, 'rosterPanel')
  expect(panelRows.length, 'roster panel rows loaded').toBeGreaterThan(0)
  const roster = await readHook<RosterRecord[]>(page, 'roster')

  const header = page.getByTestId('pane-header-canvas-roster-main')
  await expect(header).toBeVisible({ timeout: 15_000 })
  const box = await header.boundingBox()
  expect(box, 'roster header canvas').toBeTruthy()

  const visibleRows = Math.max(1, Math.floor((box!.height - HEADER_HEIGHT) / ROW_HEIGHT) - 1)
  const crewsWithTask = new Set(roster.filter((item) => item.id > 0).map((item) => item.crewId))
  const rowIndex = panelRows.findIndex((row, i) => i <= visibleRows && crewsWithTask.has(row.crewId))
  expect(rowIndex, 'a visible roster row carries a task').toBeGreaterThanOrEqual(0)

  const x = box!.x + Math.min(80, box!.width * 0.35)
  const y = box!.y + HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2
  await page.mouse.click(x, y, { button: 'right' })
  await page.getByRole('button', { name: action }).click()
  return panelRows[rowIndex].crewId
}

test.describe('Daily Task Calendar dialog', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1301 — right-click roster row opens Daily Task Calendar and month fetch is crew-scoped', async ({ page }) => {
    const crewId = await openRosterDialog(page, 'Daily Task Calendar')

    const dialog = page.getByTestId('daily-task-calendar-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog).toContainText(`Daily Task Calendar - ${crewId}`)
    await expect(dialog.getByTestId('daily-task-calendar-month')).toBeVisible()
    await expect(dialog.getByTestId('daily-task-calendar-tz-utc')).toBeVisible()
    await expect(dialog.getByTestId('daily-task-calendar-day').first()).toBeVisible({ timeout: 5_000 })
    const firstTask = dialog.getByTestId('daily-task-calendar-task').first()
    if (await firstTask.count()) {
      const before = await page.evaluate(() => window.__ganttTest!.selectedTaskIds())
      await firstTask.click()
      await expect(firstTask).toHaveAttribute('data-selected', 'true')
      await expect.poll(
        () => page.evaluate(() => window.__ganttTest!.selectedTaskIds()),
        { message: 'clicking a Daily Task Calendar block selects a roster task', timeout: 5_000 },
      ).not.toEqual(before)
    }

    let scopedRequestSeen = false
    await page.route('**/api/roster?**', async (route) => {
      const url = new URL(route.request().url())
      const crewIds = url.searchParams.get('crewIds') ?? ''
      const startDate = url.searchParams.get('startDate') ?? ''
      const endDate = url.searchParams.get('endDate') ?? ''
      scopedRequestSeen = crewIds === crewId
        && !crewIds.includes(',')
        && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
        && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    const prev = dialog.getByTestId('daily-task-calendar-prev')
    const next = dialog.getByTestId('daily-task-calendar-next')
    if (await prev.isEnabled()) await prev.click()
    else await next.click()
    await expect.poll(() => scopedRequestSeen, {
      message: 'period switch roster fetch should be scoped to selected crew with date-only RP params',
      timeout: 10_000,
    }).toBe(true)
  })

  test('Live-1302 — Daily Task Calendar closes on Escape and on overlay click like Crew Info', async ({ page }) => {
    const openDialog = async (): Promise<import('@playwright/test').Locator> => {
      await openRosterDialog(page, 'Daily Task Calendar')
      const dialog = page.getByTestId('daily-task-calendar-dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })
      return dialog
    }

    // Esc with no dropdown open must close the whole dialog.
    const dialog = await openDialog()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // Clicking the dimming overlay must also close it.
    const dialogAgain = await openDialog()
    await page.mouse.click(5, 5)
    await expect(dialogAgain).not.toBeVisible({ timeout: 5_000 })
  })

  test('Live-1303 — switching to the previous month does not duplicate tasks already in the loaded buffer', async ({ page, request }) => {
    // Same Live merge as Schedule Details: the pane roster holds the 7-day buffer before
    // the current RP; the previous month's RP fetch returns those days again. Without
    // dedup the calendar renders the same task block twice on a day cell.
    const token = await ganttApiLogin(request)
    const rpRes = await request.get(`${ganttApiUrl}/api/roster-periods`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(rpRes.ok(), 'roster-periods lookup').toBeTruthy()
    const rps = ((await rpRes.json()) as {
      data: { items: Array<{ rosterPeriod: string; rpStart: string; isCurrent: boolean }> }
    }).data.items
    const curIdx = rps.findIndex((rp) => rp.isCurrent)
    expect(curIdx, 'a current RP with a previous RP to step to').toBeGreaterThan(0)
    const prevStart = rps[curIdx - 1].rpStart

    const crewId = await openRosterDialog(page, 'Daily Task Calendar')
    const dialog = page.getByTestId('daily-task-calendar-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const prevFetch = page.waitForResponse(
      (res) => {
        if (!res.url().includes('/api/roster?') || !res.url().includes('crewIds=')) return false
        return new URL(res.url()).searchParams.get('startDate') === prevStart
      },
      { timeout: 20_000 },
    )
    await dialog.getByTestId('daily-task-calendar-prev').click()
    await prevFetch

    // The spinner stays up until the fetch's state update lands (setFetchedByKey runs
    // before loadingKey resets) — so waiting for it to clear guarantees the grid reflects
    // the fetched month, then every rendered task block must appear exactly once.
    await expect(dialog.locator('svg.animate-spin')).toHaveCount(0, { timeout: 10_000 })
    await expect
      .poll(async () => {
        const ids = await dialog.locator('[data-testid="daily-task-calendar-task"]').evaluateAll(
          (rows) => rows.map((r) => r.getAttribute('data-task-id')),
        )
        return ids.length - new Set(ids).size
      }, { message: 'Daily Task Calendar must not render the same task twice', timeout: 5_000 })
      .toBe(0)

    const ids = await dialog.locator('[data-testid="daily-task-calendar-task"]').evaluateAll(
      (rows) => rows.map((r) => r.getAttribute('data-task-id')),
    )
    expect(ids.length).toBe(new Set(ids).size)
    expect(crewId).toBeTruthy()
  })
})
