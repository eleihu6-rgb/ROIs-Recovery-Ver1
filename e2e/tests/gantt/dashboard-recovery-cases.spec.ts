/**
 * Dashboard "Overview" — Disruption Cases + Shift Handover + quick-link to Live.
 *
 * Covers the three dashboard features Ryan asked for:
 *   1. Shift Handover ("crew-control shift book") — recent entries from the shared
 *      crew_control_handover table, plus an Add-entry form that persists.
 *   2. Disruption Cases — the 4 validated recovery cases with concerned
 *      crew / result / cost spread, sorted soonest-window-first (point 7).
 *   3. Quick-link — "Open in Live" drives the EXISTING global filters (pairing:id,
 *      crew:id, flight:fltNum) and zooms the gantt onto the case window.
 *
 * §Simulate-User: every outcome is produced by a real click/typing on the real UI
 * (never an API-injection shortcut for the operation under test). §No-Illusion: the
 * gantt-side assertions read the same store truth the Canvas renders from
 * (foundIds / pairings / zoom window), not bare pixel presence.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'
import fs from 'node:fs'
import path from 'node:path'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { rightClickFlight, type FlightProbe } from '../../utils/pairing-build'

// Soonest window first (matches disruption-cases-panel sort): case-4, case-3, case-1, case-2.
const EXPECTED_CASE_ORDER = ['open-case-case-4', 'open-case-case-3', 'open-case-case-1', 'open-case-case-2']
const CASE4_NOTE = 'Case 4 — Ad hoc new flight: ET895 on 17 Sep 2026 (ADD–BJM, flight 159578) is the prepared unpaired entry point. Search 17–25 Sep; build a base-return pairing first, then review Standby Crew, Available Crew or Move-up. Build saves the pairing; roster changes require Preview → Apply → Save. Cases 1–3 remain protected.'

async function screenshot(page: Page, name: string, fullPage = true) {
  const base = path.resolve('../docs/assets/screenshots/gantt', name)
  fs.mkdirSync(path.dirname(base), { recursive: true })
  let version = 1
  while (fs.existsSync(`${base}-Ver${version}.png`)) version++
  await page.screenshot({ path: `${base}-Ver${version}.png`, fullPage })
}

// Case 3 (Rule 8004, pairing 152227, ET452/ET453, 2026-09-17T12:00Z → 09-19T18:00Z).
const CASE3_PAIRING = 152227
const CASE3_WINDOW_HOURS =
  (Date.parse('2026-09-19T18:00:00Z') - Date.parse('2026-09-17T12:00:00Z')) / 3_600_000 // 54h

/** Land on the Dashboard Overview page (default module) and wait for it to paint. */
const gotoDashboard = async (page: Page): Promise<void> => {
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
    timeout: 30_000,
  })
  const dashNav = page.getByTestId('module-nav-dashboard')
  if (await dashNav.isVisible().catch(() => false)) await dashNav.click()
  await expect(page.getByTestId('dashboard-view')).toBeVisible({ timeout: 15_000 })
}

test.describe('Dashboard — disruption cases & shift handover', () => {
  test('shows the four disruption cases soonest-first, with crew/result/cost, plus seeded handover entries', async ({
    page,
    request,
  }) => {
    await seedGanttAuth(page, request)
    await gotoDashboard(page)

    // ── Disruption Cases panel ──────────────────────────────────────────────
    await expect(page.getByText('Disruption Cases', { exact: true })).toBeVisible()

    // All four cases render an "Open in Live" quick-link.
    const openButtons = page.locator('[data-testid^="open-case-"]')
    await expect(openButtons).toHaveCount(4)

    // Sorted soonest-window-first (point 7): case-4, case-3, case-1, then case-2.
    const order = await openButtons.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')),
    )
    expect(order).toEqual(EXPECTED_CASE_ORDER)

    await expect(page.getByRole('columnheader', { name: 'Disruption cause', exact: true })).toBeVisible()
    for (const [id, cause] of [['case-1', 'Crew sick leave'], ['case-2', 'Flight delay'], ['case-3', 'Aircraft fleet change'], ['case-4', 'Ad hoc new flight']]) {
      await expect(page.locator('tr', { has: page.getByTestId(`open-case-${id}`) })).toContainText(cause)
    }
    const case4 = page.locator('tr', { has: page.getByTestId('open-case-case-4') })
    await expect(case4).toContainText('Build pairing first')
    await expect(case4).toContainText('Unassigned')
    await expect(case4).not.toContainText('Rule null')

    // Case-specific detail visible (concerned crew, pairing, rule).
    await expect(page.getByText('152227', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('L3002', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Rule 8004', { exact: false }).first()).toBeVisible()

    // Expand a case to reveal its options brief + flight list (click the row, not the button).
    await page.locator('tr', { has: page.getByTestId('open-case-case-3') }).click()
    await expect(page.getByText('Recovery options brief', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('ET452', { exact: false }).first()).toBeVisible()

    // ── Shift Handover panel (seeded entries) ───────────────────────────────
    await expect(page.getByText('Shift Handover', { exact: true })).toBeVisible()
    const list = page.getByTestId('handover-list')
    await expect(list).toBeVisible({ timeout: 15_000 })
    // Seeded rows (DASH_HANDOVER_SEED): authors + a severity badge.
    await expect(list.getByText('A. Bekele', { exact: false }).first()).toBeVisible()
    await expect(list.getByText('critical', { exact: false }).first()).toBeVisible()

    await screenshot(page, 'dashboard-recovery-cases', true)
  })

  test('adding a handover entry through the dialog persists across reload', async ({
    page,
    request,
  }) => {
    await seedGanttAuth(page, request)
    await gotoDashboard(page)

    const marker = CASE4_NOTE
    const list = page.getByTestId('handover-list')
    await expect(list).toBeVisible({ timeout: 15_000 })
    // This is the user-requested durable handover, not a throwaway test note.
    // Replays retain the existing exact entry rather than adding duplicates.
    if (await list.getByText(marker, { exact: true }).count() === 0) {
      await page.getByTestId('handover-add').click()
      await expect(page.getByTestId('handover-dialog')).toBeVisible()
      await page.getByTestId('handover-shift').selectOption('Day')
      await page.getByTestId('handover-severity').selectOption('watch')
      await page.getByTestId('handover-author').fill('Recovery preparation')
      await expect(page.getByTestId('handover-caseref').locator('option[value="case-4"]')).toHaveText('Case 4 · Ad hoc new flight')
      await page.getByTestId('handover-caseref').selectOption('case-4')
      await page.getByTestId('handover-note').fill(marker)
      await page.getByTestId('handover-save').click()
      await expect(page.getByTestId('handover-dialog')).toBeHidden({ timeout: 10_000 })
    }
    await expect(list.getByText(marker, { exact: true })).toHaveCount(1)
    await expect(list.getByText(marker, { exact: true })).toBeVisible({ timeout: 10_000 })
    // Persistence: reload the page — the entry is still there (real shared table).
    await page.reload({ waitUntil: 'domcontentloaded' })
    await gotoDashboard(page)
    await expect(
      page.getByTestId('handover-list').getByText(marker, { exact: false }),
    ).toBeVisible({ timeout: 15_000 })

    await screenshot(page, 'dashboard-handover-added', true)
  })

  test('quick-link opens the case on the Live gantt — filtered to its pairing and zoomed to the window', async ({
    page,
    request,
  }) => {
    await seedGanttAuth(page, request)
    await gotoDashboard(page)

    // Click the soonest case's "Open in Live" quick-link (real user gesture).
    await page.getByTestId('open-case-case-3').click()

    // The Live gantt mounts (roster/pairing panes register).
    await expect
      .poll(() => readHook<string[]>(page, 'paneTypes'), {
        timeout: 60_000,
        message: 'Live panes never mounted after the quick-link',
      })
      .toEqual(expect.arrayContaining(['pairing']))

    // The case pairing is loaded (the existing pairing:id filter was applied).
    await expect
      .poll(
        () =>
          readHook<Array<{ id: number }>>(page, 'pairings').then((ps) =>
            ps.map((p) => p.id),
          ),
        { timeout: 120_000, message: 'case pairing never loaded into the pairing pane' },
      )
      .toContain(CASE3_PAIRING)

    // It is floated into the pairing pane's "found" tier (brought to top).
    await expect
      .poll(
        () =>
          page.evaluate(() => window.__ganttTest?.foundIds('pairing') ?? []),
        { timeout: 30_000, message: 'case pairing was not floated to the top' },
      )
      .toContain(String(CASE3_PAIRING))

    // The timeline is zoomed + scrolled onto the case window (zoomToRp): a scroll
    // window is active and the horizontal scroll position anchors to the case-window
    // START (anchorX), so the disruption sits at the viewport's left edge.
    const zoom = await readHook<{
      pxPerHour: number
      scrollX: number
      scrollWindowStartX: number
      scrollWindowEndX: number | null
    }>(page, 'zoom')
    expect(zoom.scrollWindowEndX, 'no zoom window active').not.toBeNull()

    const dr = await readHook<{ start: string; end: string }>(page, 'dateRange')
    const rangeStartMs = Date.parse(dr.start)
    const caseStartMs = Date.parse('2026-09-17T12:00:00Z')
    const expectedAnchorX = Math.max(0, (caseStartMs - rangeStartMs) / 3_600_000) * zoom.pxPerHour
    // scrollX is anchored to the case-window start (clamped to content bounds);
    // 2-hour tolerance for the fit/clamp rounding.
    expect(
      Math.abs(zoom.scrollX - expectedAnchorX),
      `scrollX ${zoom.scrollX} not anchored to case-window start ${expectedAnchorX}`,
    ).toBeLessThan(zoom.pxPerHour * 2)

    await screenshot(page, 'dashboard-quicklink-live', false)
  })

  test('Case 4 quick-link clears a previous pairing filter and opens unpaired flight Recovery', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoDashboard(page)
    await page.getByTestId('open-case-case-3').click()
    await expect.poll(async () => (await readHook<{ pairing: { pairingIds: string[] } }>(page, 'filters')).pairing.pairingIds,
      { timeout: 60_000 }).toEqual([String(CASE3_PAIRING)])
    await expect.poll(() => page.evaluate(() => window.__ganttTest.foundIds('pairing')), { timeout: 60000 }).toContain(String(CASE3_PAIRING))
    await page.getByTestId('module-nav-dashboard').click()
    await expect(page.getByTestId('dashboard-view')).toBeVisible()
    await page.getByTestId('open-case-case-4').click()
    await expect.poll(() => readHook<string[]>(page, 'paneTypes'), { timeout: 60_000 }).toContain('flight')
    await expect.poll(async () => (await readHook<{ pairing: { pairingIds: string[] } }>(page, 'filters')).pairing.pairingIds,
      { timeout: 60_000 }).toEqual([])
    let probe: FlightProbe | null = null
    await expect.poll(async () => {
      probe = await page.evaluate(() => window.__ganttTest.flightProbe(159578))
      return probe?.id
    }, { timeout: 90_000 }).toBe(159578)
    expect(probe!.schDepDtUtc).toContain('2026-09-17')
    const dashboard = new GanttDashboardPage(page)
    await expect(dashboard.flightCanvas).toBeVisible()
    await rightClickFlight(page, dashboard.flightCanvas, probe!)
    await page.getByRole('button', { name: 'Recovery', exact: true }).click()
    const options = page.getByTestId('recovery-pairing-options')
    await expect(options).toBeVisible({ timeout: 45_000 })
    await expect(options).toContainText('ET895')
    await expect(options).toContainText('2026-09-17')
    await screenshot(page, 'dashboard-case4-flight-recovery', false)
    await page.getByRole('button', { name: 'Close', exact: true }).first().click()
    expect(await readHook<unknown[]>(page, 'draftOps')).toEqual([])
    await expect(page.getByTestId('draft-save-btn')).toBeDisabled()
  })

})
