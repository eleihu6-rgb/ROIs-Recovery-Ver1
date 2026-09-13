/**
 * Auto-assign open pairings — REAL UI walk-through for crew J4001 (ADD / 7M8).
 *
 * Exercises the "brain + hands" feature end-to-end through the product's own UI
 * (§Simulate-User — the assign operation under test goes through the real context
 * menu → dialog → Apply → Save, never a direct POST /api/roster/assign-pairing):
 *   1. Bring crew J4001 to the top of the roster (filter).
 *   2. Right-click J4001's name cell → "Auto-assign open pairings".
 *   3. Dialog fires POST /api/roster/auto-assign/plan (the no-commit "brain") and
 *      renders the per-crew decision trace (filter → consider → skip → assign).
 *   4. "Apply to gantt" replays the plan as real assign draft ops ("hands").
 *   5. Save commits; roster_flight for J4001 must then carry the assigned pairings.
 *
 * The target month is the viewport calendar month (Ryan's step 3 — "current whole
 * month as target assignment month"), so the plan spans all of September 2026.
 * J4001 = Meseret Gebremariam, base ADD, fleet 7M8 (seed
 * sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql).
 */
import { expect, test } from '@playwright/test'
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
const CREW_ID = 'J4001'

interface PlanResponse {
  crews: Array<{
    crewId: string
    crewName: string
    base: string
    fleets: string[]
    assigned: Array<{ pairingId: number; label: string }>
    summary: { assignedCount: number; skippedCount: number }
  }>
  summary: { crewCount: number; assignedTotal: number; skippedTotal: number }
}

test('Auto-assign open pairings — J4001 (ADD/7M8) plans and applies via real UI', async ({ page, request }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const token = await seedGanttAuth(page, request)
  const auth = { headers: { Authorization: `Bearer ${token}` } }

  // ── Setup (API, not the operation under test): clear J4001's Sep 2026 roster so
  // the auto-assign below starts from a clean slate and the test is re-runnable. ──
  const preRoster = await request.get(`${ganttApiUrl}/api/roster?crewIds=${CREW_ID}&startDate=2026-09-01&endDate=2026-09-30`, auth)
  expect(preRoster.ok()).toBeTruthy()
  const preRaw = ((await preRoster.json()) as { data: unknown }).data
  const preRows: Array<{ id: number; pairingId?: number | null }> = Array.isArray(preRaw)
    ? preRaw
    : (Object.values(preRaw as Record<string, unknown>).flat() as Array<{ id: number; pairingId?: number | null }>)
  for (const pid of [...new Set(preRows.map((r) => r.pairingId).filter((id): id is number => id != null && id !== 0))]) {
    const del = await request.post(`${ganttApiUrl}/api/roster/pairing/${pid}/crew/${CREW_ID}/delete`, { ...auth, data: { username: 'e2e-j4001' } })
    expect(del.ok(), `reset: delete pairing ${pid} from ${CREW_ID}`).toBeTruthy()
  }
  for (const r of preRows.filter((r) => r.pairingId == null || r.pairingId === 0)) {
    const del = await request.delete(`${ganttApiUrl}/api/roster/${r.id}`, auth)
    expect(del.ok(), `reset: delete ground row ${r.id}`).toBeTruthy()
  }

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)

  // Viewport month drives the plan window → whole of September 2026.
  await setDateRange(page, '2026-09-10', '2026-09-13')
  const range = await readHook<{ start: string; end: string }>(page, 'dateRange')

  // Bring J4001 to the top of the roster so its name cell is at row 0.
  await openFilter(page, 'pairing')
  await page.getByTestId('filter-tab-crew').click()
  const crewIdInput = page.getByTestId('filter-crew-id')
  await crewIdInput.click()
  await crewIdInput.fill(CREW_ID)
  await crewIdInput.press('Enter')
  await applyFilterLight(page)

  await expect
    .poll(() => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId), {
      timeout: 30_000,
      message: `crew ${CREW_ID} brought to top of roster`,
    })
    .toBe(CREW_ID)

  // Right-click J4001's name cell to open the roster-row context menu.
  const nameCanvas = page.getByTestId('pane-header-canvas-roster-main')
  const nameBox = await nameCanvas.boundingBox()
  expect(nameBox, 'roster name canvas must be measurable').not.toBeNull()
  await page.mouse.click(
    nameBox!.x + Math.min(70, nameBox!.width / 2),
    nameBox!.y + ROSTER_HEADER_HEIGHT + ROSTER_ROW_HEIGHT / 2,
    { button: 'right' },
  )

  const menuItem = page.getByRole('button', { name: /Auto-assign Duties/ })
  await expect(menuItem).toBeVisible({ timeout: 10_000 })

  // Clicking the item fires the no-commit planner; capture its response.
  const planPromise = page.waitForResponse(
    (res) => res.url().includes('/api/roster/auto-assign/plan') && res.request().method() === 'POST',
    { timeout: 150_000 },
  )
  await menuItem.click()

  const dialog = page.getByTestId('auto-assign-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  // Auto-assign Duties: configure phase first. This spec covers the legacy
  // open-pairings shape, so keep only the FLY row with no limits, then Analyse.
  for (const g of ['RES', 'DO']) await dialog.getByTestId(`auto-assign-remove-${g}`).click()
  for (const k of ['periodMax', 'every7Min', 'every7Max']) await dialog.getByTestId(`auto-assign-FLY-${k}`).fill('')
  await dialog.getByTestId('auto-assign-analyse').click()

  const planRes = await planPromise
  expect(planRes.status(), 'auto-assign plan must return 200').toBe(200)
  const planBody = (await planRes.json()) as { data: PlanResponse }
  const plan = planBody.data
  expect(plan, 'plan payload present').toBeTruthy()

  const crewPlan = plan.crews.find((c) => c.crewId === CREW_ID)
  expect(crewPlan, `plan must include crew ${CREW_ID}`).toBeTruthy()
  expect(crewPlan!.base, 'J4001 resolved to base ADD').toBe('ADD')
  expect(crewPlan!.fleets, 'J4001 resolved to fleet 7M8').toContain('7M8')
  expect(
    plan.summary.assignedTotal,
    `plan must assign at least one open pairing (assigned=${plan.summary.assignedTotal}, skipped=${plan.summary.skippedTotal})`,
  ).toBeGreaterThanOrEqual(1)

  const plannedPairingIds = crewPlan!.assigned.map((a) => a.pairingId)

  // Dialog trace is populated and the crew card is shown.
  await expect(dialog.getByTestId('auto-assign-crew').first()).toBeVisible()
  await expect(dialog.getByText(CREW_ID).first()).toBeVisible()

  // Apply to gantt — replay the plan as real assign draft ops.
  const draftBefore = await readHook<{ opCount: number }>(page, 'draftState')
  const applyBtn = dialog.getByTestId('auto-assign-apply')
  await expect(applyBtn).toBeEnabled()
  await applyBtn.click()

  // Each replayed assignment becomes exactly one draft op.
  await expect
    .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
      timeout: 240_000,
      message: 'every planned assignment landed as a draft op',
    })
    .toBe(draftBefore.opCount + plan.summary.assignedTotal)

  // Close the dialog (replay done) then Save the draft.
  await dialog.getByTestId('auto-assign-close').click()
  await expect(dialog).toBeHidden()

  const saveBtn = page.getByTestId('draft-save-btn')
  await expect(saveBtn).toBeEnabled({ timeout: 15_000 })
  const commitPromise = page.waitForResponse(
    (res) => res.url().includes('/api/draft/commit') || res.url().includes('/api/roster/assign-pairing'),
    { timeout: 120_000 },
  )
  await saveBtn.click()
  const commit = await commitPromise
  expect(commit.ok(), 'draft commit must succeed').toBeTruthy()

  await expect
    .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
      timeout: 60_000,
      message: 'draft queue drains to 0 after save',
    })
    .toBe(0)

  // Roster must now carry the planned pairings for J4001.
  const startDate = range.start.slice(0, 10)
  const endDate = range.end.slice(0, 10)
  const rosterCheck = await request.get(
    `${ganttApiUrl}/api/roster?crewIds=${CREW_ID}&startDate=${startDate}&endDate=${endDate}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(rosterCheck.ok(), `GET /api/roster for ${CREW_ID} must succeed`).toBeTruthy()
  const rosterBody = (await rosterCheck.json()) as { data: unknown }
  const raw = rosterBody.data
  const rows: Array<{ pairingId?: number | string }> = Array.isArray(raw)
    ? raw
    : (Object.values(raw as Record<string, unknown>).flat() as Array<{ pairingId?: number | string }>)
  const assignedIds = new Set(rows.map((r) => String(r.pairingId)))
  const landed = plannedPairingIds.filter((id) => assignedIds.has(String(id)))
  expect(
    landed.length,
    `roster_flight for ${CREW_ID} must include the planned pairings (planned=${plannedPairingIds.join(',')}, in-roster=${[...assignedIds].join(',')})`,
  ).toBeGreaterThanOrEqual(1)

  await page.screenshot({ path: 'test-results/auto-assign-j4001-ver1.png', fullPage: true })
})
