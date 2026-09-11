/**
 * One-time data operation: assign each of the 40 freshly-seeded ADD/7M8 crew
 * (J4001-J4020 CA, J4021-J4040 FO — see sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql)
 * to a real open-slot 7M8/ADD pairing in the LIVE schedule (scenario_id=0), via
 * a REAL Pairing-canvas -> Roster-canvas drag-and-drop + Save (§Simulate-User —
 * no direct POST /api/roster/assign-pairing shortcut for the assign itself).
 *
 * Target pairings were selected read-only (fleet='7M8' AND base='ADD' AND
 * scenario_id=0 AND is_deleted=0, an open CA or FO composition slot, ordered by
 * nearest sch_str_dt_utc, no duplicate pairing_id across the 40 rows) — matching
 * the user's confirmed criteria: real Live assignment, nearest-date open slot.
 * All 40 fall inside 2026-09-11T12:10Z .. 2026-09-12T11:45Z.
 *
 * Pattern adapted from roster-assign-delay-fixtures.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilterLight,
  ganttApiUrl,
  openFilter,
  readHook,
  seedGanttAuth,
  setDateRange,
} from '../../utils/gantt-hook'

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
  expect(sourceX, 'target pairing segment must be inside visible canvas').toBeGreaterThan(0)
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

const FIXTURES: Array<{ pairingId: number; crewId: string; label: string }> = [
  { pairingId: 151528, crewId: 'J4001', label: 'ET877/ET876 CA slot' },
  { pairingId: 151529, crewId: 'J4002', label: 'ET895/ET894 CA slot' },
  { pairingId: 151531, crewId: 'J4003', label: 'ET418/ET419 CA slot' },
  { pairingId: 151532, crewId: 'J4004', label: 'ET837/ET836 CA slot' },
  { pairingId: 151533, crewId: 'J4005', label: 'ET959/ET958 CA slot' },
  { pairingId: 151535, crewId: 'J4006', label: 'ET336/ET337 CA slot' },
  { pairingId: 151536, crewId: 'J4007', label: 'ET348/ET349 CA slot' },
  { pairingId: 151537, crewId: 'J4008', label: 'ET811/ET810 CA slot' },
  { pairingId: 151542, crewId: 'J4009', label: 'ET849/ET848 CA slot' },
  { pairingId: 151543, crewId: 'J4010', label: 'ET334/ET335 CA slot' },
  { pairingId: 151545, crewId: 'J4011', label: 'ET364/ET365 CA slot' },
  { pairingId: 151546, crewId: 'J4012', label: 'ET929/ET926 CA slot' },
  { pairingId: 151549, crewId: 'J4013', label: 'ET414/ET405 CA slot' },
  { pairingId: 151550, crewId: 'J4014', label: 'ET406/ET407 CA slot' },
  { pairingId: 151551, crewId: 'J4015', label: 'ET843/ET842 CA slot' },
  { pairingId: 151553, crewId: 'J4016', label: 'ET614/ET615 CA slot' },
  { pairingId: 151554, crewId: 'J4017', label: 'ET422/ET423 CA slot' },
  { pairingId: 151555, crewId: 'J4018', label: 'ET893/ET892 CA slot' },
  { pairingId: 151556, crewId: 'J4019', label: 'ET622/ET623 CA slot' },
  { pairingId: 151557, crewId: 'J4020', label: 'ET857/ET856 CA slot' },
  { pairingId: 151559, crewId: 'J4021', label: 'ET624/ET625 FO slot' },
  { pairingId: 151560, crewId: 'J4022', label: 'ET416/ET417 FO slot' },
  { pairingId: 151568, crewId: 'J4023', label: 'ET720/ET721 FO slot' },
  { pairingId: 151570, crewId: 'J4024', label: 'ET308/ET309 FO slot' },
  { pairingId: 151571, crewId: 'J4025', label: 'ET442/ET443 FO slot' },
  { pairingId: 151573, crewId: 'J4026', label: 'ET961/ET956 FO slot' },
  { pairingId: 151574, crewId: 'J4027', label: 'ET404/ET415 FO slot' },
  { pairingId: 151575, crewId: 'J4028', label: 'ET905/ET904 FO slot' },
  { pairingId: 151576, crewId: 'J4029', label: 'ET839/ET838 FO slot' },
  { pairingId: 151578, crewId: 'J4030', label: 'ET827/ET826 FO slot' },
  { pairingId: 151584, crewId: 'J4031', label: 'ET807/ET816 FO slot' },
  { pairingId: 151585, crewId: 'J4032', label: 'ET805/ET802 FO slot' },
  { pairingId: 151587, crewId: 'J4033', label: 'ET376/ET377 FO slot' },
  { pairingId: 151588, crewId: 'J4034', label: 'ET833/ET833/ET829/ET829 FO slot' },
  { pairingId: 151589, crewId: 'J4035', label: 'ET917/ET916 FO slot' },
  { pairingId: 151591, crewId: 'J4036', label: 'ET516/ET517 FO slot' },
  { pairingId: 151595, crewId: 'J4037', label: 'ET819/ET818 FO slot' },
  { pairingId: 151597, crewId: 'J4038', label: 'ET332/ET333 FO slot' },
  { pairingId: 151599, crewId: 'J4039', label: 'ET322/ET323 FO slot' },
  { pairingId: 151600, crewId: 'J4040', label: 'ET362/ET363 FO slot' },
]

for (const fixture of FIXTURES) {
  test(`Assign-ADD-7M8-Batch — real UI drag assigns pairing ${fixture.pairingId} to crew ${fixture.crewId} (${fixture.label})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1920, height: 1080 })
    const token = await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto(150_000)

    // All 40 fixture pairings fall inside 2026-09-11T12:10Z .. 2026-09-12T11:45Z.
    await setDateRange(page, '2026-09-10', '2026-09-13')
    const range = await readHook<{ start: string; end: string }>(page, 'dateRange')

    await openFilter(page, 'pairing')
    const pairingIdInput = page.getByTestId('filter-pairing-id')
    await pairingIdInput.click()
    await pairingIdInput.fill(String(fixture.pairingId))
    await pairingIdInput.press('Enter')
    await page.getByTestId('filter-tab-crew').click()
    const crewIdInput = page.getByTestId('filter-crew-id')
    await crewIdInput.click()
    await crewIdInput.fill(fixture.crewId)
    await crewIdInput.press('Enter')
    await applyFilterLight(page)

    await expect
      .poll(() => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId), {
        timeout: 30_000,
        message: `crew ${fixture.crewId} brought to top of roster`,
      })
      .toBe(fixture.crewId)
    await expect
      .poll(() => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder').then((rows) => rows[0]?.id), {
        timeout: 30_000,
        message: `pairing ${fixture.pairingId} rendered in pairing pane`,
      })
      .toBe(String(fixture.pairingId))

    const detailResponse = await request.get(`${ganttApiUrl}/api/pairing/${fixture.pairingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(detailResponse.ok(), `pairing ${fixture.pairingId} detail must load`).toBeTruthy()
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
    expect(visibleSegment, `pairing ${fixture.pairingId} must expose a visible segment`).toBeTruthy()
    const probe: PairingProbe = {
      pairingId: fixture.pairingId,
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

    const previewPromise = page.waitForResponse(
      (res) => res.url().includes('/api/legality/preview-draft'),
      { timeout: 150_000 },
    )
    await dragPairingToCrew(page, dashboard, probe, 0)

    const preview = await previewPromise
    expect(preview.status(), 'legality preview must succeed').toBe(200)
    const previewBody = (await preview.json()) as { violations?: unknown[] } | { data?: { violations?: unknown[] } }
    const violations =
      (previewBody as { violations?: unknown[] }).violations ??
      (previewBody as { data?: { violations?: unknown[] } }).data?.violations
    expect(Array.isArray(violations), 'preview must return an engine-computed violations array').toBe(true)

    const dialog = page.getByTestId('rule-confirm-dialog')
    if ((violations as unknown[]).length > 0) {
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      const proceedBtn = dialog.getByTestId('rule-confirm-proceed')
      const canProceed = await proceedBtn.isVisible().catch(() => false)
      expect(
        canProceed,
        `pairing ${fixture.pairingId} -> crew ${fixture.crewId}: legality engine reported BLOCKING violations for a fresh, previously-unassigned crew — this is a real finding, not test noise (dialog: ${await dialog.innerText()})`,
      ).toBe(true)
      await proceedBtn.click()
      await expect(dialog).toBeHidden()
    }

    await expect
      .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
        timeout: 30_000,
        message: 'assign accepted as exactly one new draft op',
      })
      .toBe(draftBefore.opCount + 1)

    const saveBtn = page.getByTestId('draft-save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 15_000 })
    const commitPromise = page.waitForResponse(
      (res) => res.url().includes('/api/draft/commit') || res.url().includes('/api/roster/assign-pairing'),
      { timeout: 60_000 },
    )
    await saveBtn.click()
    const commit = await commitPromise
    expect(commit.ok(), `draft commit/assign for pairing ${fixture.pairingId} must succeed`).toBeTruthy()

    await expect
      .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
        timeout: 30_000,
        message: 'draft queue drains back to 0 after successful save',
      })
      .toBe(0)

    const startDate = range.start.slice(0, 10)
    const endDate = range.end.slice(0, 10)
    const rosterCheck = await request.get(
      `${ganttApiUrl}/api/roster?crewIds=${fixture.crewId}&startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(rosterCheck.ok(), `GET /api/roster for crew ${fixture.crewId} must succeed after save`).toBeTruthy()
    const rosterBody = (await rosterCheck.json()) as { data: unknown }
    const raw = rosterBody.data
    const rows: Array<{ pairingId?: number | string }> = Array.isArray(raw)
      ? raw
      : Object.values(raw as Record<string, unknown>).flat() as Array<{ pairingId?: number | string }>
    const assigned = rows.some((r) => String(r.pairingId) === String(fixture.pairingId))
    expect(assigned, `roster_flight for crew ${fixture.crewId} must include pairing ${fixture.pairingId} after save`).toBe(true)
  })
}
