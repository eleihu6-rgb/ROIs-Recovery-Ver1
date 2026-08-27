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
  pairingId: number | null
  start: string | null
  dutySeq: number | null
  assignmentGroup: string
  dutyActCreditedMinutes: string | null
  actCreditedMinutes: string | null
  schCreditedMinutes: string | null
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

test.describe('Schedule Details dialog', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1300 — right-click roster row opens Schedule Details for that crew', async ({ page }) => {
    const crewId = await openRosterDialog(page, 'Schedule Details')

    const dialog = page.getByTestId('schedule-details-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog).toContainText(`Schedule Details - ${crewId}`)
    await expect(dialog.getByTestId('schedule-details-rp')).toBeVisible()
    await expect(dialog.getByTestId('schedule-details-tz-utc')).toBeVisible()
    await dialog.getByTestId('schedule-details-crew').click()
    await dialog.getByTestId('schedule-details-crew-search').fill(crewId)
    await expect(dialog.getByTestId('schedule-details-crew-option').first()).toContainText(crewId)
    await page.keyboard.press('Escape')
    await expect(
      dialog.getByTestId('schedule-details-row').first().or(dialog.getByTestId('schedule-details-empty')),
    ).toBeVisible({ timeout: 5_000 })
    const firstRow = dialog.getByTestId('schedule-details-row').first()
    if (await firstRow.count()) {
      await expect(firstRow).not.toContainText(/Flight\s+\d+/)
      const before = await page.evaluate(() => window.__ganttTest!.selectedTaskIds())
      await firstRow.click()
      await expect(firstRow).toHaveAttribute('data-selected', 'true')
      await expect.poll(
        () => page.evaluate(() => window.__ganttTest!.selectedTaskIds()),
        { message: 'clicking a Schedule Details row selects a roster task', timeout: 5_000 },
      ).not.toEqual(before)
    }
  })

  test('Live-1302 — Schedule Details closes on Escape and on overlay click like Crew Info', async ({ page }) => {
    const openDialog = async (): Promise<import('@playwright/test').Locator> => {
      await openRosterDialog(page, 'Schedule Details')
      const dialog = page.getByTestId('schedule-details-dialog')
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

  test('Live-1303 — switching to the previous RP does not duplicate tasks already in the loaded buffer', async ({ page, request }) => {
    // Regression: Live Schedule Details merges the pane roster (which holds the 7-day
    // buffer before the current RP) with the per-RP fetch. The previous month's RP starts
    // before that buffer, so the fetch fires and the overlap days used to render twice.
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

    const crewId = await openRosterDialog(page, 'Schedule Details')
    const dialog = page.getByTestId('schedule-details-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // The dialog's per-RP fetch for the previous month (the roster pane never issues a
    // getView with this start date — the gantt window starts 7 days before the current RP).
    const prevFetch = page.waitForResponse(
      (res) => {
        if (!res.url().includes('/api/roster?') || !res.url().includes('crewIds=')) return false
        return new URL(res.url()).searchParams.get('startDate') === prevStart
      },
      { timeout: 20_000 },
    )
    await dialog.getByTestId('schedule-details-rp-prev').click()
    await prevFetch

    // Wait for the fetch to settle, then every rendered task must appear exactly once.
    await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 10_000 })
    await expect
      .poll(async () => {
        const ids = await dialog.locator('[data-testid="schedule-details-row"]').evaluateAll(
          (rows) => rows.map((r) => r.getAttribute('data-task-id')),
        )
        return ids.length - new Set(ids).size
      }, { message: 'Schedule Details must not render the same task twice', timeout: 5_000 })
      .toBe(0)

    const ids = await dialog.locator('[data-testid="schedule-details-row"]').evaluateAll(
      (rows) => rows.map((r) => r.getAttribute('data-task-id')),
    )
    expect(ids.length).toBe(new Set(ids).size)
    expect(crewId).toBeTruthy()
  })

  test('Live-1304 — display timezone defaults to the crew base, falling back to the toolbar', async ({ page, request }) => {
    const token = await ganttApiLogin(request)
    const crewId = await openRosterDialog(page, 'Schedule Details')
    const dialog = page.getByTestId('schedule-details-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Crew's base (crew_base → panelBase) and the timezone options the dialog matches it
    // against — both read-only preconditions; the UI still drives the actual selection.
    const crewRes = await request.get(
      `${ganttApiUrl}/api/crew?crewIds=${encodeURIComponent(crewId)}&page=1&pageSize=1&view=gantt-panel`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(crewRes.ok(), 'crew base lookup').toBeTruthy()
    const crewBody = (await crewRes.json()) as { data: { items: Array<{ panelBase: string | null }> } }
    const base = crewBody.data.items[0]?.panelBase ?? null

    const tzRes = await request.get(`${ganttApiUrl}/api/base/timezone-options`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(tzRes.ok(), 'timezone-options lookup').toBeTruthy()
    const tzBody = (await tzRes.json()) as { data: Array<{ airport: string; zoneId: string }> }
    const resolvable = base != null && tzBody.data.some((opt) => opt.airport === base)

    // Fresh Playwright context → toolbar default is UTC, so the fallback label is 'Gantt TZ'.
    const expected = resolvable ? base : 'Gantt TZ'
    await expect
      .poll(() => dialog.getByTestId('schedule-details-tz-display').textContent(), {
        message: 'display timezone defaults to the crew base airport',
        timeout: 10_000,
      })
      .toBe(expected)
  })

  test('Live-1305 — a multi-duty pairing renders as one aggregated row with summed credit', async ({ page, request }) => {
    const token = await ganttApiLogin(request)
    const rpRes = await request.get(`${ganttApiUrl}/api/roster-periods`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(rpRes.ok(), 'roster-periods lookup').toBeTruthy()
    const rps = ((await rpRes.json()) as {
      data: { items: Array<{ rpStart: string; rpEnd: string; isCurrent: boolean }> }
    }).data.items
    const current = rps.find((rp) => rp.isCurrent)
    expect(current, 'current RP').toBeTruthy()

    // Find a crew with a multi-duty pairing whose duties all start comfortably INSIDE the
    // current RP (≥2 days from both boundaries). The dialog filters the RP by the crew's
    // base display timezone, which can shift a near-boundary start by up to ±14h; a pairing
    // in the interior renders in the RP regardless of the crew's base.
    const dayShift = (dateStr: string, days: number): string => {
      const d = new Date(`${dateStr}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + days)
      return d.toISOString().slice(0, 10)
    }
    const safeStart = dayShift(current!.rpStart, 2)
    const safeEnd = dayShift(current!.rpEnd, -2)

    // The progressive load paints the first window fast and appends the rest in the
    // background. Wait until the roster count is stable so the full pairing window is
    // present before we pick a pairing to assert against.
    await expect
      .poll(async () => {
        const current = (await readHook<RosterRecord[]>(page, 'roster')).length
        await page.waitForTimeout(1_000)
        const after = (await readHook<RosterRecord[]>(page, 'roster')).length
        return current === after && current > 0
      }, { message: 'roster fully loaded', timeout: 90_000 })
      .toBe(true)

    const roster = await readHook<RosterRecord[]>(page, 'roster')
    const inInterior = roster.filter((r) =>
      r.pairingId != null && r.start != null
      && r.start.slice(0, 10) >= safeStart && r.start.slice(0, 10) <= safeEnd,
    )
    const byPair = new Map<string, RosterRecord[]>()
    for (const r of inInterior) {
      const key = `${r.crewId}|${r.pairingId}`
      byPair.set(key, [...(byPair.get(key) ?? []), r])
    }
    // Prefer a pairing whose ENTIRE roster is inside the interior, so every duty the dialog
    // renders is accounted for in the expected credit.
    const interiorIds = new Set(inInterior.map((r) => r.id))
    const multi = [...byPair.entries()]
      .filter(([, items]) => items.length >= 2)
      .find(([, items]) => roster.filter((r) => r.id > 0 && items[0].crewId === r.crewId && r.pairingId === items[0].pairingId)
        .every((r) => interiorIds.has(r.id)))
      ?? [...byPair.entries()].find(([, items]) => items.length >= 2)
    expect(multi, 'a crew with a multi-duty pairing in the current RP').toBeTruthy()
    const crewId = multi![0].split('|')[0]
    const pairingId = Number(multi![0].split('|')[1])
    const crewItems = multi![1]

    // Expected credit = sum over distinct duties (duty-level credit counts once per dutySeq).
    const dutyCredits = new Map<string, number>()
    for (const r of crewItems) {
      const dutyKey = `${r.pairingId}|${r.dutySeq ?? ''}`
      if (dutyCredits.has(dutyKey)) continue
      const raw = r.dutyActCreditedMinutes ?? r.actCreditedMinutes ?? r.schCreditedMinutes
      const n = raw != null && raw !== '' ? Number(raw) : 0
      dutyCredits.set(dutyKey, Number.isFinite(n) ? n : 0)
    }
    const expectedMinutes = [...dutyCredits.values()].reduce((a, b) => a + b, 0)
    const expectedCredit = `${Math.floor(expectedMinutes / 60)}:${String(expectedMinutes % 60).padStart(2, '0')}`

    await openRosterDialog(page, 'Schedule Details')
    const dialog = page.getByTestId('schedule-details-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByTestId('schedule-details-crew').click()
    await dialog.getByTestId('schedule-details-crew-search').fill(crewId)
    await dialog.getByTestId('schedule-details-crew-option').first().click()
    await expect(dialog.getByTestId('schedule-details-crew')).toContainText(crewId)

    // Exactly one row carries the pairing (leading cell id == pairingId) and its credit is summed.
    await expect(dialog.getByTestId('schedule-details-row').first()).toBeVisible({ timeout: 5_000 })
    const rows = await dialog.locator('[data-testid="schedule-details-row"]').evaluateAll(
      (trs) => trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'))
        return {
          type: cells[0]?.textContent ?? '',
          credit: cells[3]?.textContent ?? '',
          pairing: cells[5]?.textContent ?? '',
        }
      }),
    )
    const matching = rows.filter((row) => row.pairing.split(' · ')[0] === String(pairingId))
    expect(matching, 'pairing appears exactly once').toHaveLength(1)
    expect(matching[0].type).toBe(crewItems[0].assignmentGroup)
    expect(matching[0].credit).toBe(expectedCredit)
  })
})
