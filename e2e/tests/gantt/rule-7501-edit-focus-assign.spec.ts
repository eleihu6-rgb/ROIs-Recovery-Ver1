/**
 * Regression: assigning pairing 15676 to crew 2438 in Aug 2026 must preview the
 * edit-focused 7501 worst window and show it in the planner confirmation dialog.
 *
 * The fixture belongs to the local f8_sit_live dataset and ruleset 103. The
 * assignment is performed by a real Pairing-canvas → Roster-canvas drag, then
 * cancelled before any draft operation can be saved.
 */
import { expect, test, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilterLight,
  ganttApiUrl,
  openFilter,
  readHook,
  seedGanttAuth,
} from '../../utils/gantt-hook'

const CREW_ID = '2438'
const PAIRING_ID = 15676
const ROSTER_HEADER_HEIGHT = 30
const ROSTER_ROW_HEIGHT = 43

interface PairingProbe {
  pairingId: number
  schStrDtUtc: string
  rowIndex: number
  scrollX: number
  scrollY: number
  pxPerHour: number
  rangeStartIso: string
  headerHeight: number
  rowHeight: number
}

interface RosterRow {
  crewId: string
}

const selectRuleset103 = async (page: Page): Promise<void> => {
  await expect
    .poll(() => readHook<{ toolbar: string }>(page, 'ruleGroupCodes').then((v) => v.toolbar), {
      timeout: 15_000,
      message: 'the active Live legality ruleset initializes',
    })
    .not.toBe('')

  if ((await readHook<{ toolbar: string }>(page, 'ruleGroupCodes')).toolbar === '103') return

  await page.getByRole('button', { name: /Rule Set|PBS Solver Ruleset/i }).click()
  await page.getByRole('menuitem').filter({ hasText: 'PBS Solver Ruleset' }).click()
  await expect
    .poll(() => readHook<{ toolbar: string }>(page, 'ruleGroupCodes').then((v) => v.toolbar))
    .toBe('103')
}

const dragPairingToCrew = async (
  page: Page,
  dashboard: GanttDashboardPage,
  probe: PairingProbe,
  crewRowIndex: number,
): Promise<void> => {
  const pairingBox = await dashboard.pairingCanvas.boundingBox()
  const rosterBox = await dashboard.rosterCanvas.boundingBox()
  expect(pairingBox, 'pairing canvas must be measurable').not.toBeNull()
  expect(rosterBox, 'roster canvas must be measurable').not.toBeNull()

  const pairingStartMs = Date.parse(probe.schStrDtUtc)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const sourceX = ((pairingStartMs - rangeStartMs) / 3_600_000) * probe.pxPerHour - probe.scrollX + 6
  const sourceY = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY + probe.rowHeight / 2
  expect(sourceX, 'fixture pairing segment must be inside the visible canvas').toBeGreaterThan(0)
  expect(sourceX).toBeLessThan(pairingBox!.width)
  expect(sourceY).toBeGreaterThan(probe.headerHeight)
  expect(sourceY).toBeLessThan(pairingBox!.height)

  const rosterScrollY = await page.evaluate(
    () => window.__ganttTest!.paneScrollY!('roster-main'),
  )
  const targetX = rosterBox!.x + Math.min(80, rosterBox!.width / 2)
  const targetY =
    rosterBox!.y +
    ROSTER_HEADER_HEIGHT +
    crewRowIndex * ROSTER_ROW_HEIGHT -
    rosterScrollY +
    ROSTER_ROW_HEIGHT / 2

  await page.mouse.move(pairingBox!.x + sourceX, pairingBox!.y + sourceY)
  await page.mouse.down()
  await page.mouse.move(pairingBox!.x + sourceX + 10, pairingBox!.y + sourceY, { steps: 2 })
  await expect(page.getByText(`Pairing #${probe.pairingId}`, { exact: true })).toBeAttached()
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()
}

test('Live-1490 — assigning pairing shows the edit-focused 7501 dialog', async ({ page, request }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const token = await seedGanttAuth(page, request)

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(270_000)
  await selectRuleset103(page)
  const range = await readHook<{ start: string; end: string }>(page, 'dateRange')
  expect(Date.parse(range.start)).toBeLessThanOrEqual(Date.parse('2026-08-01T00:00:00.000Z'))
  expect(Date.parse(range.end)).toBeGreaterThanOrEqual(Date.parse('2026-08-31T23:59:59.000Z'))

  // Real Filter UI: bring crew 2438 to the first roster row and isolate pairing
  // 15676. Add Full/Over so fixture availability does not depend on coverage.
  await openFilter(page, 'crew')
  await page.getByTestId('filter-crew-id').fill(CREW_ID)
  await page.getByTestId('filter-crew-id').press('Enter')
  await page.getByTestId('filter-tab-pairing').click()
  await page.getByTestId('filter-pairing-id').fill(String(PAIRING_ID))
  await page.getByTestId('filter-pairing-id').press('Enter')
  await page.getByTestId('filter-pairing-coverage-full').click()
  await page.getByTestId('filter-pairing-coverage-over').click()
  await applyFilterLight(page)

  await expect
    .poll(() => readHook<RosterRow[]>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId), {
      timeout: 30_000,
      message: `crew ${CREW_ID} is brought to the top of the roster`,
    })
    .toBe(CREW_ID)
  await expect
    .poll(() => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder'), {
      timeout: 30_000,
      message: `pairing ${PAIRING_ID} is the only pairing rendered`,
    })
    .toEqual([{ id: String(PAIRING_ID), label: expect.any(String) }])

  const detailResponse = await request.get(`${ganttApiUrl}/api/pairing/${PAIRING_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(detailResponse.ok(), `pairing ${PAIRING_ID} detail must load`).toBeTruthy()
  const detail = (await detailResponse.json()) as {
    data: { segments: Array<{ schStrDtUtc: string }> }
  }
  const pairingBox = await dashboard.pairingCanvas.boundingBox()
  expect(pairingBox, 'pairing canvas must be measurable').not.toBeNull()
  const zoom = await readHook<{ scrollX: number; pxPerHour: number }>(page, 'zoom')
  const pairingScrollY = await page.evaluate(
    () => window.__ganttTest!.paneScrollY!('pairing'),
  )
  const visibleSegment = detail.data.segments.find((segment) => {
    const x =
      ((Date.parse(segment.schStrDtUtc) - Date.parse(range.start)) / 3_600_000) * zoom.pxPerHour -
      zoom.scrollX
    return x >= 20 && x <= pairingBox!.width - 20
  })
  expect(visibleSegment, `pairing ${PAIRING_ID} must expose a visible segment`).toBeTruthy()
  const probe: PairingProbe = {
    pairingId: PAIRING_ID,
    schStrDtUtc: visibleSegment!.schStrDtUtc,
    rowIndex: 0,
    scrollX: zoom.scrollX,
    scrollY: pairingScrollY,
    pxPerHour: zoom.pxPerHour,
    rangeStartIso: range.start,
    headerHeight: 30,
    rowHeight: 42,
  }

  const draftBefore = await readHook<{ opCount: number }>(page, 'draftState')
  await dragPairingToCrew(page, dashboard, probe, 0)

  const dialog = page.getByTestId('rule-confirm-dialog')
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog).toContainText(/7501|Single day free from duty/i)

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount))
    .toBe(draftBefore.opCount)
})
