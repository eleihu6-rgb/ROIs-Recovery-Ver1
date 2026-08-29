/**
 * Regression: the Rust legality engine must actually run when a planner tries
 * to assign pairing 139445 (V4126, YVR 737, 2026-09-10→11) to crew 858 (CA,
 * the crew Ryan referenced as "139" — DB row id 139).
 *
 * Bug this would have caught: rule-engine-rs/target/release contained only a
 * shell-script stub (submodule never materialized), so the drop-time legality
 * preview (POST /api/legality/preview-draft → live-legality.mjs → check-*
 * binaries) errored, the UI showed "Legality preview failed: …" and every
 * assign was refused. With the engine rebuilt, the preview must return 200 and
 * the planner must see the real engine outcome: either the rule-confirm dialog
 * with engine-computed violations (crew 858 has VAC overlapping Sep 10–11), or
 * a clean accepted draft op when the ruleset finds nothing.
 *
 * The assignment is performed by a real Pairing-canvas → Roster-canvas drag
 * (§Simulate-User) and cancelled/undone before any save, so the dev DB is left
 * untouched.
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

const CREW_ID = '858'
const PAIRING_ID = 139445
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

test('Rust-Engine-1 — assigning pairing 139445 to crew 858 runs the Rust legality engine end-to-end', async ({ page, request }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const token = await seedGanttAuth(page, request)

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(270_000)
  await selectRuleset103(page)

  // Pairing 139445 flies 2026-09-10→11: move the viewport onto September.
  await setDateRange(page, '2026-09-01', '2026-09-30')
  const range = await readHook<{ start: string; end: string }>(page, 'dateRange')
  expect(Date.parse(range.start)).toBeLessThanOrEqual(Date.parse('2026-09-10T00:00:00.000Z'))
  expect(Date.parse(range.end)).toBeGreaterThanOrEqual(Date.parse('2026-09-11T23:59:59.000Z'))

  // Real Filter UI: bring crew 858 to the first roster row and isolate pairing
  // 139445 (open CA+FO slots → visible under the default open/partial coverage).
  await openFilter(page, 'crew')
  await page.getByTestId('filter-crew-id').fill(CREW_ID)
  await page.getByTestId('filter-crew-id').press('Enter')
  await page.getByTestId('filter-tab-pairing').click()
  await page.getByTestId('filter-pairing-id').fill(String(PAIRING_ID))
  await page.getByTestId('filter-pairing-id').press('Enter')
  await applyFilterLight(page)

  await expect
    .poll(() => readHook<RosterRow[]>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId), {
      timeout: 30_000,
      message: `crew ${CREW_ID} is brought to the top of the roster`,
    })
    .toBe(CREW_ID)
  await expect
    .poll(() => readHook<Array<{ id: string }>>(page, 'pairingPanelOrder').then((rows) => rows[0]?.id), {
      timeout: 30_000,
      message: `pairing ${PAIRING_ID} is rendered in the pairing pane`,
    })
    .toBe(String(PAIRING_ID))

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

  // The drop fires POST /api/legality/preview-draft — the call that runs the
  // Rust engine. With the old stub binaries this returned 5xx and the UI
  // surfaced "Legality preview failed".
  const previewPromise = page.waitForResponse(
    (res) => res.url().includes('/api/legality/preview-draft'),
    { timeout: 150_000 },
  )
  await dragPairingToCrew(page, dashboard, probe, 0)

  const preview = await previewPromise
  expect(preview.status(), 'Rust legality preview must succeed (stub engine returned 5xx)').toBe(200)
  const previewBody = (await preview.json()) as { violations?: unknown[] } | { data?: { violations?: unknown[] } }
  const violations =
    (previewBody as { violations?: unknown[] }).violations
    ?? (previewBody as { data?: { violations?: unknown[] } }).data?.violations
  expect(Array.isArray(violations), 'preview must return an engine-computed violations array').toBe(true)

  // The stub-era user-visible failure must NOT appear.
  await expect(page.getByText(/Legality preview failed/i)).toHaveCount(0)

  const dialog = page.getByTestId('rule-confirm-dialog')
  if ((violations as unknown[]).length > 0) {
    // Engine found real violations (crew 858 has VAC overlapping Sep 10–11):
    // the planner sees the rule-confirm dialog with engine-computed content.
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(
      dialog.locator('[data-testid^="rule-confirm-group-"]').first(),
      'dialog must list at least one engine-computed rule group',
    ).toBeVisible()
    // Engine-computed content, not just chrome: every violation carries a
    // rule-instance code like "1001/001" plus a concrete message. For this
    // fixture the deterministic hit is 1001 (FLY overlapping the crew's VAC).
    await expect(dialog).toContainText(/\d{4}\/\d{3}/)
    await expect(dialog).toContainText(/Overlapping assignments between VAC \(2026-09-10\) and FLY \(2026-09-10\)/)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect
      .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
        message: 'cancelled assign leaves no draft op behind',
      })
      .toBe(draftBefore.opCount)
  } else {
    // Engine ran clean: the assign is accepted as a draft op (not saved).
    await expect
      .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
        timeout: 30_000,
        message: 'legal assign must add exactly one draft op',
      })
      .toBe(draftBefore.opCount + 1)
  }
})
