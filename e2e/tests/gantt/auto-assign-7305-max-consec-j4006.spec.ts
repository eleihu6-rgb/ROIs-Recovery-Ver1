/**
 * Auto-assign + Rule 7305 (Max Consecutive Working Days) — REAL UI walk-through for
 * fresh crew J4006 (ADD/7M8).
 *
 * Ryan's chain of feedback: "first week too tight, last 3 weeks too loose". The fix
 * is NOT a packer cap — it is a legality rule the auto-assign packer now consults
 * WHILE it picks. Rule **7305 "Max Consecutive Duties Limitation"** (Type=Days,
 * cap=5, scope FLY|CRAM|CRPM|RES, severity 1) was added to the LIVE pilot ruleset
 * (workset 103). Because the planner validates every assembled roster through the
 * SAME Rust engine (`previewDraftLegality`) and trims any pairing that trips a rule,
 * 7305 now forces gaps → the roster spreads across the month instead of clustering
 * in week 1. Ryan: "would like auto assign logic initiate these logic."
 *
 * This proves it end-to-end through the product's own UI (§Simulate-User — the
 * assign goes through the real context menu → dialog → Apply → Save, never a direct
 * assign POST):
 *   1. Reset J4006's Sep 2026 roster (setup only, via API) so the run is idempotent.
 *   2. Bring J4006 to the top of the roster (filter).
 *   3. Right-click its name cell → "Auto-assign open pairings".
 *   4. The dialog fires POST /api/roster/auto-assign/plan (defaults to even).
 *   5. Assert 7305 IS enforced during packing: the plan's skip trace must contain
 *      at least one pairing skipped with ruleCode 7305 — the direct proof that
 *      auto-assign now initiates the max-consecutive-days rule (the regression: with
 *      7305 absent from ruleset 103, the packer would front-load and never skip on
 *      it). Faithful 7305 semantics (rest-gap-aware duty streaks) live in the Rust
 *      engine, so we assert the rule FIRES, not a naive calendar-day recount.
 *   6. Assert the plan SPREADS: ≥4 distinct 7-day week buckets, reaches the later
 *      weeks, and no single week hoards the plan (first-week-too-tight regression).
 *   7. Apply → Save → assert the committed roster holds the plan; screenshot.
 *
 * J4006 is one of the fresh ADD/7M8 crew from
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
const CREW_ID = 'J4006'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface PlanResponse {
  crews: Array<{
    crewId: string
    base: string
    fleets: string[]
    assigned: Array<{ pairingId: number; label: string; startDt: string | null; blockMinutes: number }>
    skipped: Array<{ pairingId: number; label: string; reason: string; ruleCode?: string; message: string }>
    summary: { assignedCount: number; skippedCount: number }
  }>
  summary: { crewCount: number; assignedTotal: number; skippedTotal: number }
}

test('Auto-assign + Rule 7305 — J4006 (ADD/7M8): max-consecutive-days is enforced during packing and spreads the month', async ({
  page,
  request,
}) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const token = await seedGanttAuth(page, request)
  const auth = { headers: { Authorization: `Bearer ${token}` } }

  // ── Setup (API, not the operation under test): clear J4006's Sep 2026 roster so
  // the auto-assign below starts from a clean slate and the test is re-runnable. ──
  const preRoster = await request.get(
    `${ganttApiUrl}/api/roster?crewIds=${CREW_ID}&startDate=2026-09-01&endDate=2026-09-30`,
    auth,
  )
  expect(preRoster.ok()).toBeTruthy()
  const preRaw = ((await preRoster.json()) as { data: unknown }).data
  const preRows: Array<{ pairingId?: number | string }> = Array.isArray(preRaw)
    ? preRaw
    : (Object.values(preRaw as Record<string, unknown>).flat() as Array<{ pairingId?: number | string }>)
  const existingPairingIds = [
    ...new Set(preRows.map((r) => r.pairingId).filter((id): id is number | string => id != null && id !== 0)),
  ]
  for (const pid of existingPairingIds) {
    const del = await request.post(
      `${ganttApiUrl}/api/roster/pairing/${pid}/crew/${CREW_ID}/delete`,
      { ...auth, data: { username: 'e2e-7305' } },
    )
    expect(del.ok(), `reset: delete pairing ${pid} from ${CREW_ID}`).toBeTruthy()
  }

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)

  // Whole of September 2026 visible → viewport month = Sep (drives the plan) AND the
  // full-month spread is captured in the screenshot.
  await setDateRange(page, '2026-09-01', '2026-09-30')

  // Bring J4006 to the top of the roster so its name cell is at row 0.
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

  // Right-click J4006's name cell to open the roster-row context menu.
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
  // Auto-assign Duties: configure phase first. This spec covers the legacy
  // open-pairings shape, so keep only the FLY row with no limits, then Analyse.
  for (const g of ['RES', 'DO']) await dialog.getByTestId(`auto-assign-remove-${g}`).click()
  for (const k of ['periodMax', 'every7Min', 'every7Max']) await dialog.getByTestId(`auto-assign-FLY-${k}`).fill('')
  await dialog.getByTestId('auto-assign-analyse').click()

  const planRes = await planPromise
  expect(planRes.status(), 'auto-assign plan must return 200').toBe(200)
  const plan = ((await planRes.json()) as { data: PlanResponse }).data
  const crewPlan = plan.crews.find((c) => c.crewId === CREW_ID)
  expect(crewPlan, `plan must include crew ${CREW_ID}`).toBeTruthy()
  expect(crewPlan!.base).toBe('ADD')

  // ── Core proof #1: Rule 7305 is ENFORCED during packing. ──
  // With 7305 a member of ruleset 103 (severity 1), previewDraftLegality emits its
  // violations and the packer's backtrack-trim drops the offending pairing → the
  // skip trace carries ruleCode '7305'. If 7305 were still absent from 103 (the
  // "not set up" state), it would never fire and the roster would front-load.
  const skips7305 = crewPlan!.skipped.filter((s) => s.ruleCode === '7305')
  expect(
    skips7305.length,
    `auto-assign must enforce 7305 (max consecutive working days): expected ≥1 skip with ruleCode 7305, ` +
      `got ruleCodes=[${[...new Set(crewPlan!.skipped.map((s) => s.ruleCode).filter(Boolean))].join(',')}]`,
  ).toBeGreaterThanOrEqual(1)

  // ── Core proof #2: the accepted plan SPREADS across the month. ──
  const monthStartMs = Date.parse('2026-09-01T00:00:00Z')
  const weekOf = (iso: string | null): number =>
    iso ? Math.floor((Date.parse(iso) - monthStartMs) / WEEK_MS) : -1
  const weekLoad = new Map<number, number>()
  for (const a of crewPlan!.assigned) {
    const w = weekOf(a.startDt)
    if (w >= 0) weekLoad.set(w, (weekLoad.get(w) ?? 0) + 1)
  }
  const distinctWeeks = [...weekLoad.keys()].sort((x, y) => x - y)
  const total = crewPlan!.assigned.length
  const maxWeek = Math.max(...weekLoad.values())

  expect(total, `even plan must assign multiple pairings (assigned=${total})`).toBeGreaterThanOrEqual(4)
  expect(
    distinctWeeks.length,
    `distribution must touch ≥4 distinct week buckets, got weeks=[${distinctWeeks.join(',')}]`,
  ).toBeGreaterThanOrEqual(4)
  expect(
    Math.max(...distinctWeeks),
    `distribution must reach the later weeks of the month, weeks=[${distinctWeeks.join(',')}]`,
  ).toBeGreaterThanOrEqual(3)
  // First-week-too-tight regression: no single week may hoard more than half the plan.
  expect(
    maxWeek,
    `no week may hold >50% of the plan (was front-loaded before 7305): maxWeek=${maxWeek}, total=${total}, ` +
      `byWeek=${JSON.stringify(Object.fromEntries(weekLoad))}`,
  ).toBeLessThanOrEqual(Math.ceil(total * 0.5))

  // ── Core proof #3: the plan never places duty on 6+ CONSECUTIVE days (cap 5). ──
  // Requirement (Ryan): "even with rule bug, roster assignment should not assign duty
  // from 10-15 sep". Rule 7305 counts consecutive DUTY days; the fix feeds duty-END
  // (not duty-end + minimum rest) into the kernel's day boundary, so the packer's
  // previewDraftLegality counts real duty days and backtrack-trims the 6th. Compute
  // the longest run of consecutive crew-base-local (ADD = UTC+3) calendar days the
  // plan assigns duty on; it must not exceed the cap. Before the fix, the rest tail
  // spilled into the next morning and mis-shaped the run boundaries — this recount on
  // the real assigned dates is the regression guard.
  const ADD_OFFSET_MS = 3 * 60 * 60 * 1000
  const MAX_CONSECUTIVE_CAP = 5
  const localDayNo = (iso: string | null): number | null =>
    iso ? Math.floor((Date.parse(iso) + ADD_OFFSET_MS) / (24 * 60 * 60 * 1000)) : null
  const dutyDays = [
    ...new Set(crewPlan!.assigned.map((a) => localDayNo(a.startDt)).filter((d): d is number => d != null)),
  ].sort((x, y) => x - y)
  let longestRun = dutyDays.length ? 1 : 0
  let currentRun = dutyDays.length ? 1 : 0
  for (let i = 1; i < dutyDays.length; i++) {
    currentRun = dutyDays[i] === dutyDays[i - 1] + 1 ? currentRun + 1 : 1
    if (currentRun > longestRun) longestRun = currentRun
  }
  expect(
    longestRun,
    `plan must not assign 6+ consecutive duty days (cap ${MAX_CONSECUTIVE_CAP}): longestRun=${longestRun}, ` +
      `dutyDays=[${dutyDays.map((d) => new Date(d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)).join(',')}]`,
  ).toBeLessThanOrEqual(MAX_CONSECUTIVE_CAP)

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

  // Save — commit the drafted, spread-out roster to J4006.
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

  // J4006's committed roster must now carry (nearly) the whole spread plan.
  const rosterCheck = await request.get(
    `${ganttApiUrl}/api/roster?crewIds=${CREW_ID}&startDate=2026-09-01&endDate=2026-09-30`,
    auth,
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
    `J4006 committed roster must hold most of the plan (planned=${plannedPairingIds.length}, landed=${landed.length})`,
  ).toBeGreaterThanOrEqual(Math.ceil(plannedPairingIds.length * 0.8))

  // Visual proof: J4006's committed, spread-out month under Rule 7305.
  await page.screenshot({
    path: '../docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png',
    fullPage: true,
  })
})
