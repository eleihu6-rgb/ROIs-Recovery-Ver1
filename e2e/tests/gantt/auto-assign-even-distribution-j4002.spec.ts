/**
 * Auto-assign EVEN DISTRIBUTION — REAL UI walk-through for a fresh crew (J4002, ADD/7M8).
 *
 * Ryan's observation on J4001 was "first week too tight, last 3 weeks too loose":
 * the legacy earliest-first packer front-loads week 1 and tapers off. The planner
 * now defaults to `distribution: 'even'`, levelling flying hours across the 7-day
 * week buckets of the month.
 *
 * This exercises that through the product's own UI (§Simulate-User — the operation
 * goes through the real context menu → dialog → Apply, never a direct assign POST):
 *   1. Bring fresh crew J4002 to the top of the roster (filter).
 *   2. Right-click its name cell → "Auto-assign open pairings".
 *   3. The dialog fires POST /api/roster/auto-assign/plan (no `distribution` field →
 *      backend defaults to 'even') and renders the per-crew decision trace.
 *   4. Assert the plan SPREADS across the month: the assigned pairings must touch
 *      at least 4 distinct 7-day week buckets AND reach the final week — proof the
 *      roster is no longer clustered in week 1.
 *   5. "Apply to gantt" replays the plan as real draft ops, then Save commits them,
 *      so J4002 actually carries its even-spread month (Ryan: "J4002 only had one
 *      pairing in sep, fix it"). Assert the committed roster holds the plan, and
 *      screenshot the whole-month spread.
 *
 * This DOES Save (single-crew assignment through the real UI — the feature's
 * intended operation, requested by Ryan), so it commits to the shared SIT roster.
 *
 * J4002 is one of the fresh ADD/7M8 crew from
 * sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql.
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
const CREW_ID = 'J4002'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface PlanResponse {
  crews: Array<{
    crewId: string
    base: string
    fleets: string[]
    assigned: Array<{ pairingId: number; label: string; startDt: string | null; blockMinutes: number }>
    summary: { assignedCount: number; skippedCount: number }
  }>
  summary: { crewCount: number; assignedTotal: number; skippedTotal: number }
}

test('Auto-assign even distribution — J4002 (ADD/7M8) spreads flying hours across the month', async ({
  page,
  request,
}) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const token = await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)

  // Whole of September 2026 visible → viewport month = Sep (drives the plan) AND
  // the full-month spread is captured in the screenshot.
  await setDateRange(page, '2026-09-01', '2026-09-30')

  // Bring J4002 to the top of the roster so its name cell is at row 0.
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

  // Right-click J4002's name cell to open the roster-row context menu.
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

  // Clicking fires the no-commit planner (defaults to distribution: 'even').
  const planPromise = page.waitForResponse(
    (res) => res.url().includes('/api/roster/auto-assign/plan') && res.request().method() === 'POST',
    { timeout: 150_000 },
  )
  await menuItem.click()

  const dialog = page.getByTestId('auto-assign-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  // Auto-assign Duties: configure phase first (RP range + FLY/RES/DO limits) → Analyse fires the planner.
  await dialog.getByTestId('auto-assign-analyse').click()

  const planRes = await planPromise
  expect(planRes.status(), 'auto-assign plan must return 200').toBe(200)
  const plan = ((await planRes.json()) as { data: PlanResponse }).data
  const crewPlan = plan.crews.find((c) => c.crewId === CREW_ID)
  expect(crewPlan, `plan must include crew ${CREW_ID}`).toBeTruthy()
  expect(crewPlan!.base).toBe('ADD')

  // ── The core assertion: assignments SPREAD across the month's week buckets. ──
  const monthStartMs = Date.parse('2026-09-01T00:00:00Z')
  const weekOf = (iso: string | null): number =>
    iso ? Math.floor((Date.parse(iso) - monthStartMs) / WEEK_MS) : -1
  const weeks = new Set<number>()
  for (const a of crewPlan!.assigned) weeks.add(weekOf(a.startDt))
  const distinctWeeks = [...weeks].filter((w) => w >= 0).sort((x, y) => x - y)

  expect(
    crewPlan!.assigned.length,
    `even plan must assign multiple pairings (assigned=${crewPlan!.assigned.length})`,
  ).toBeGreaterThanOrEqual(4)
  expect(
    distinctWeeks.length,
    `even distribution must touch ≥4 distinct week buckets, got weeks=[${distinctWeeks.join(',')}]`,
  ).toBeGreaterThanOrEqual(4)
  expect(
    Math.max(...distinctWeeks),
    `even distribution must reach the later weeks of the month, weeks=[${distinctWeeks.join(',')}]`,
  ).toBeGreaterThanOrEqual(3)

  const plannedPairingIds = crewPlan!.assigned.map((a) => a.pairingId)

  // Apply to gantt — replay the plan as real draft ops.
  const draftBefore = await readHook<{ opCount: number }>(page, 'draftState')
  const applyBtn = dialog.getByTestId('auto-assign-apply')
  await expect(applyBtn).toBeEnabled()
  await applyBtn.click()

  await expect
    .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
      timeout: 240_000,
      message: 'every planned assignment landed as a draft op',
    })
    .toBe(draftBefore.opCount + plan.summary.assignedTotal)

  await dialog.getByTestId('auto-assign-close').click()
  await expect(dialog).toBeHidden()

  // Save — commit the drafted, spread-out roster to J4002.
  const saveBtn = page.getByTestId('draft-save-btn')
  await expect(saveBtn).toBeEnabled({ timeout: 15_000 })
  const commitPromise = page.waitForResponse(
    (res) => res.url().includes('/api/draft/commit') || res.url().includes('/api/roster/assign-pairing'),
    { timeout: 120_000 },
  )
  await saveBtn.click()
  expect((await commitPromise).ok(), 'draft commit must succeed').toBeTruthy()

  await expect
    .poll(() => readHook<{ opCount: number }>(page, 'draftState').then((v) => v.opCount), {
      timeout: 60_000,
      message: 'draft queue drains to 0 after save',
    })
    .toBe(0)

  // J4002's committed roster must now carry (nearly) the whole even-spread plan —
  // if the replay/commit silently dropped most, this catches it.
  const rosterCheck = await request.get(
    `${ganttApiUrl}/api/roster?crewIds=${CREW_ID}&startDate=2026-09-01&endDate=2026-09-30`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(rosterCheck.ok()).toBeTruthy()
  const raw = ((await rosterCheck.json()) as { data: unknown }).data
  const rows: Array<{ pairingId?: number | string }> = Array.isArray(raw)
    ? raw
    : (Object.values(raw as Record<string, unknown>).flat() as Array<{ pairingId?: number | string }>)
  const committed = new Set(rows.map((r) => String(r.pairingId)))
  const landed = plannedPairingIds.filter((id) => committed.has(String(id)))
  expect(
    landed.length,
    `J4002 committed roster must hold most of the plan (planned=${plannedPairingIds.length}, landed=${landed.length})`,
  ).toBeGreaterThanOrEqual(Math.ceil(plannedPairingIds.length * 0.8))

  // Visual proof: J4002's committed, spread-out month.
  await page.screenshot({
    path: 'docs/assets/screenshots/gantt/auto-assign-even-distribution-j4002-Ver2.png',
    fullPage: true,
  })
})
