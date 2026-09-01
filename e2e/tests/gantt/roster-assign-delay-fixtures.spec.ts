/**
 * Populates roster_flight for the 3 delay-fixture pairings (150390/150398/150406,
 * see pairing-delay-ghost-bar.spec.ts) by performing a REAL Pairing-canvas →
 * Roster-canvas drag-and-drop assign + Save (§Simulate-User — "pw make roster
 * assignment", not a direct API call), so the Roster pane has real crew-assigned
 * data to validate no-overlap against (pickup/brief/debrief/dropoff/rest are
 * live-joined from pairing_segment, so the already-fixed delay values flow
 * through automatically once a crew is assigned).
 *
 * Crew: K1001/K1002 (DXB, free, unqualified-fleet-filter dropped — crew_fleet
 * has no A380/738 rows in this dataset), T2001 (ADD, free). 150390 and 150398
 * overlap in date range so they must use DIFFERENT DXB crew.
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
  expect(sourceX, 'fixture pairing segment must be inside visible canvas').toBeGreaterThan(0)
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

const FIXTURES = [
  { pairingId: 150390, crewId: 'K1001', label: 'A380 DXB duty-1-delay pairing' },
  { pairingId: 150398, crewId: 'K1002', label: 'A380 DXB duty-2-delay (last duty) pairing' },
  { pairingId: 150406, crewId: 'T2001', label: '738 ADD delay>duration gap-closing pairing' },
]

for (const fixture of FIXTURES) {
  test(`Roster-Assign — real UI drag assigns pairing ${fixture.pairingId} to crew ${fixture.crewId} (${fixture.label})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 1920, height: 1080 })
    const token = await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto(270_000)

    // Fixture pairings span 2026-08-31 → 2026-09-02; widen with margin.
    await setDateRange(page, '2026-08-25', '2026-09-10')
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
        `pairing ${fixture.pairingId} → crew ${fixture.crewId}: legality engine reported BLOCKING violations for a freshly-seeded, previously-unassigned test crew — this is a real finding, not test noise (dialog: ${await dialog.innerText()})`,
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
    // Shape is { [crewId]: RosterItem[] } (per-crew chunked cache) — flatten defensively.
    const raw = rosterBody.data
    const rows: Array<{ pairingId?: number | string }> = Array.isArray(raw)
      ? raw
      : Object.values(raw as Record<string, unknown>).flat() as Array<{ pairingId?: number | string }>
    const assigned = rows.some((r) => String(r.pairingId) === String(fixture.pairingId))
    expect(assigned, `roster_flight for crew ${fixture.crewId} must include pairing ${fixture.pairingId} after save`).toBe(true)
  })
}
