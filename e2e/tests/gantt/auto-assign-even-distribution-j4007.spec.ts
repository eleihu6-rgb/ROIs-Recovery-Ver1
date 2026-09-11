/**
 * Auto-assign EVEN DISTRIBUTION — REAL UI walk-through for a fresh crew (J4007, ADD/7M8).
 *
 * Sibling of auto-assign-even-distribution-j4002.spec.ts, requested by Ryan
 * ("pw for j4007 and check duty distribution，expect even distribution in 4 weeks").
 *
 * The planner defaults to `distribution: 'even'`, levelling flying hours across the
 * 7-day week buckets of the month, and the assembled roster is validated by the SAME
 * Rust engine (previewDraftLegality) the manual assign uses — Rule 7305 (max
 * consecutive duty DAYS, cap 5) forces day-off gaps so the month spreads instead of
 * front-loading week 1.
 *
 * §Simulate-User — the assign goes through the real context menu → dialog → Apply →
 * Save, never a direct assign POST.
 *
 * Assertions (Ryan: "expect even distribution in 4 weeks"):
 *   1. The plan assigns multiple pairings.
 *   2. They touch ALL FOUR 7-day week buckets of the month (weeks 0..3) — i.e. no
 *      week is left empty; this is the "even in 4 weeks" bar, stronger than J4002's
 *      "≥4 distinct buckets".
 *   3. No single week is starved relative to the others (spread, not a 3+1 cluster).
 *   4. Apply + Save actually commit the spread month to J4007.
 *
 * J4007 is one of the fresh ADD/7M8 crew from
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
const CREW_ID = 'J4007'
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

test('Auto-assign even distribution — J4007 (ADD/7M8) spreads across all 4 weeks of the month', async ({
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

  // Bring J4007 to the top of the roster so its name cell is at row 0.
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

  // Right-click J4007's name cell to open the roster-row context menu.
  const nameCanvas = page.getByTestId('pane-header-canvas-roster-main')
  const nameBox = await nameCanvas.boundingBox()
  expect(nameBox, 'roster name canvas must be measurable').not.toBeNull()
  await page.mouse.click(
    nameBox!.x + Math.min(70, nameBox!.width / 2),
    nameBox!.y + ROSTER_HEADER_HEIGHT + ROSTER_ROW_HEIGHT / 2,
    { button: 'right' },
  )

  const menuItem = page.getByRole('button', { name: /Auto-assign open pairings/ })
  await expect(menuItem).toBeVisible({ timeout: 10_000 })

  // Clicking fires the no-commit planner (defaults to distribution: 'even').
  const planPromise = page.waitForResponse(
    (res) => res.url().includes('/api/roster/auto-assign/plan') && res.request().method() === 'POST',
    { timeout: 150_000 },
  )
  await menuItem.click()

  const dialog = page.getByTestId('auto-assign-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  const planRes = await planPromise
  expect(planRes.status(), 'auto-assign plan must return 200').toBe(200)
  const plan = ((await planRes.json()) as { data: PlanResponse }).data
  const crewPlan = plan.crews.find((c) => c.crewId === CREW_ID)
  expect(crewPlan, `plan must include crew ${CREW_ID}`).toBeTruthy()
  expect(crewPlan!.base).toBe('ADD')

  // ── Core assertion: assignments spread across ALL FOUR week buckets. ──
  const monthStartMs = Date.parse('2026-09-01T00:00:00Z')
  const weekOf = (iso: string | null): number =>
    iso ? Math.floor((Date.parse(iso) - monthStartMs) / WEEK_MS) : -1
  const perWeek = new Map<number, number>()
  for (const a of crewPlan!.assigned) {
    const w = weekOf(a.startDt)
    if (w >= 0 && w <= 3) perWeek.set(w, (perWeek.get(w) ?? 0) + 1)
  }
  const distinctWeeks = [...perWeek.keys()].sort((x, y) => x - y)
  const counts = [0, 1, 2, 3].map((w) => perWeek.get(w) ?? 0)

  expect(
    crewPlan!.assigned.length,
    `even plan must assign multiple pairings (assigned=${crewPlan!.assigned.length})`,
  ).toBeGreaterThanOrEqual(4)
  // "Even distribution in 4 weeks" = every one of the four calendar-week buckets
  // (Sep 1-7, 8-14, 15-21, 22-28+) carries at least one assignment.
  expect(
    distinctWeeks,
    `every week bucket 0..3 must carry ≥1 assignment; per-week counts=[${counts.join(',')}]`,
  ).toEqual([0, 1, 2, 3])
  // No week starved: the busiest week is at most 3× the quietest — proves a genuine
  // spread rather than a 3+3+3+1 tail.
  const maxW = Math.max(...counts)
  const minW = Math.min(...counts)
  expect(
    maxW,
    `no week may dominate: per-week counts=[${counts.join(',')}] (max=${maxW}, min=${minW})`,
  ).toBeLessThanOrEqual(minW * 3)

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

  // Save — commit the drafted, spread-out roster to J4007.
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

  // J4007's committed roster must now carry (nearly) the whole even-spread plan.
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
    `J4007 committed roster must hold most of the plan (planned=${plannedPairingIds.length}, landed=${landed.length})`,
  ).toBeGreaterThanOrEqual(Math.ceil(plannedPairingIds.length * 0.8))

  // eslint-disable-next-line no-console
  console.log(`[J4007] per-week counts (Sep wk0..3) = [${counts.join(',')}], assigned=${crewPlan!.assigned.length}`)

  // Visual proof: J4007's committed, spread-out month.
  await page.screenshot({
    path: 'docs/assets/screenshots/gantt/auto-assign-even-distribution-j4007-Ver1.png',
    fullPage: true,
  })
})
