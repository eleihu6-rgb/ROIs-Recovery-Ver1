import { test, expect, type Page } from '@playwright/test'
import { gotoGantt, seedGanttAuth, ganttApiLogin } from '../../utils/gantt-hook'

/**
 * Live-1411 — RES Pairing Creator: YYZ CABIN end-to-end ACCEPTANCE test.
 *
 * Modeled on the YVR pilot acceptance test (Live-1410). §Simulate-User: real UI only,
 * NO backend API calls — clicks the actual product controls and lets the UI fire its requests.
 *
 * Scenario (cabin division C, base YYZ, ranks IFD + FA):
 *   1 AM (CRAM) + 1 PM (CRPM) reserve per day over June 2026, with composition that
 *   differs weekend vs weekday:
 *     - WEEKEND (Sat/Sun): IFD 15, FA 15
 *     - WEEKDAY (Mon–Fri): IFD 14, FA 14
 *   June 2026 has 8 weekend days + 22 weekday days = 30 days × (AM + PM) = 60 RES pairings.
 *
 * Validates: define both batches → Create → gantt shows the new CRAM/CRPM pairings, timing
 * accurate, total count = 60, and the weekend/weekday composition split is honoured (via
 * the Manage tab composition testids).
 *
 * Capstone acceptance target for the Define/Generate UI (plan phases D–G).
 */

const AM_LABEL = 'CRAM' // label = reserve code only; base is a separate column
const PM_LABEL = 'CRPM' // label = reserve code only
const EXPECTED_TOTAL = 60          // 30 June days × (AM + PM)
const WEEKEND_DATE = '2026-06-06'  // Saturday → IFD/FA 15
const WEEKDAY_DATE = '2026-06-01'  // Monday   → IFD/FA 14

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

// dow chip ids: Sun=0 … Sat=6. Toggle chips so EXACTLY `wanted` are active (reads data-active).
const setDow = async (page: Page, wanted: number[]) => {
  for (let n = 0; n <= 6; n++) {
    const chip = page.getByTestId(`res-dow-${n}`)
    const active = (await chip.getAttribute('data-active')) === 'true'
    const shouldBeActive = wanted.includes(n)
    if (active !== shouldBeActive) await chip.click()
  }
}

/** Plan for both CRAM and CRPM (default multi-select for cabin). */
const setPlan = async (page: Page, base: string, rank: string, plan: string) => {
  for (const code of ['CRAM', 'CRPM'] as const) {
    await page.getByTestId(`res-plan-${code}-${base}-${rank}`).fill(plan)
  }
}

test('Live-1411: YYZ cabin RES pairings — weekend 15 / weekday 14 IFD+FA, 60 total', async ({ page, request }) => {
  // Pre-condition: delete any existing CRAM/CRPM pairings in the Jun–Jul 2026 window
  // so the DB is clean before we generate. §Simulate-User permits read/write via `request`
  // for pre-condition seeding; the user action (Generate) is still triggered via the UI.
  const token = await ganttApiLogin(request)
  const listRes = await request.get(
    `${GANTT_API}/api/pairing?assignments=CRAM,CRPM&base=YYZ&startDate=2026-06-01&endDate=2026-07-31&pageSize=0`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const listData = await listRes.json() as { data: { items: { id: number }[] } }
  const existingIds = listData.data.items.map((p) => p.id)
  if (existingIds.length > 0) {
    const CHUNK = 20
    const chunks: number[][] = []
    for (let i = 0; i < existingIds.length; i += CHUNK) chunks.push(existingIds.slice(i, i + CHUNK))
    await Promise.all(
      chunks.map((chunk) =>
        request.post(`${GANTT_API}/api/res-pairing/batch-delete`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: { ids: chunk },
          timeout: 60_000,
        }),
      ),
    )
  }

  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()

  // open planner, scope to YYZ cabin
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible()
  await page.getByTestId('res-base-YYZ').click()
  await page.getByTestId('res-div-C').click()

  // Ensure CRAM + CRPM selected
  for (const code of ['CRAM', 'CRPM'] as const) {
    const chip = page.getByTestId(`res-assignment-${code}`)
    if ((await chip.getAttribute('data-active')) !== 'true') await chip.click()
  }

  // batch 1 — WEEKENDS (Sat=6, Sun=0): IFD 15 / FA 15 for CRAM & CRPM
  await page.getByTestId('res-mode-dow').click()
  await setDow(page, [6, 0])
  await setPlan(page, 'YYZ', 'IFD', '15')
  await setPlan(page, 'YYZ', 'FA', '15')
  await page.getByTestId('res-apply').click()

  // batch 2 — WEEKDAYS (Mon–Fri = 1..5): IFD 14 / FA 14 for CRAM & CRPM
  await setDow(page, [1, 2, 3, 4, 5])
  await setPlan(page, 'YYZ', 'IFD', '14')
  await setPlan(page, 'YYZ', 'FA', '14')
  await page.getByTestId('res-apply').click()

  // generate from Define (UI-triggered write)
  await expect(page.getByTestId('res-tab-review')).toHaveCount(0)
  await expect(page.getByTestId('res-tab-define')).toBeVisible()
  await page.getByTestId('res-generate').click()

  // total count matches definition (60)
  const result = page.getByTestId('res-generate-result')
  await expect(result).toBeVisible({ timeout: 30_000 })
  await expect(result).toContainText(String(EXPECTED_TOTAL))

  // gantt behaviour: pane auto-filters to the cabin reserve codes and shows them
  await expect(page.getByTestId('pairing-filter-chip-CRAM')).toHaveCount(0)
  await expect(page.getByTestId('pairing-filter-chip-CRPM')).toHaveCount(0)
  const pane = page.getByTestId('pairing-pane')
  await expect(pane.getByText(AM_LABEL).first()).toBeVisible() // timing accuracy (encoded window)
  await expect(pane.getByText(PM_LABEL).first()).toBeVisible()

  // total count matches definition via the live test hook (rows, not pixels)
  await page.waitForFunction(
    ({ expected, codes }) => {
      type P = { assignment?: string }
      type GanttTest = { pairings?: () => P[] }
      const w = window as unknown as { __ganttTest?: GanttTest }
      const n = (w.__ganttTest?.pairings?.() ?? []).filter((p) => codes.includes(p.assignment ?? '')).length
      return n >= expected
    },
    { expected: EXPECTED_TOTAL, codes: ['CRAM', 'CRPM'] },
    { timeout: 30_000 },
  )
  const count = await page.evaluate((codes: string[]) => {
    type P = { assignment?: string }
    type GanttTest = { pairings?: () => P[] }
    const w = window as unknown as { __ganttTest?: GanttTest }
    return (w.__ganttTest?.pairings?.() ?? []).filter((p) => codes.includes(p.assignment ?? '')).length
  }, ['CRAM', 'CRPM'])
  expect(count).toBe(EXPECTED_TOTAL)

  // ── Manage tab: verify composition split via testids ─────────────────────
  // Re-open the planner and switch to the Manage tab.
  await page.getByTestId('res-pairing-button').click()
  await page.getByTestId('res-tab-manage').click()

  // Scope filter to YYZ / Cabin / June 2026 so rows load
  await page.getByTestId('manage-filter-base').selectOption('YYZ')
  await page.getByTestId('manage-filter-division').selectOption('C')
  await page.getByTestId('manage-filter-start').fill('2026-06-01')
  await page.getByTestId('manage-filter-end').fill('2026-06-30')
  await page.getByTestId('manage-filter-load').click()

  // Wait for first row to appear (up to 15s for remote DB)
  await page.getByTestId('res-row-0').waitFor({ timeout: 15_000 })

  // weekend vs weekday composition split: a Saturday pairing carries plan 15, a Monday pairing plan 14
  await expect(page.getByTestId(`res-pairing-comp-${WEEKEND_DATE}-CRAM-IFD`)).toHaveText('15')
  await expect(page.getByTestId(`res-pairing-comp-${WEEKDAY_DATE}-CRAM-IFD`)).toHaveText('14')
})
