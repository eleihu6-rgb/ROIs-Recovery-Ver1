/**
 * Regression: 7504 WOCL-spacing findings must paint the two FLY duties that bound
 * the rest GAP, even when neither segment overlaps the gap window (crew 1015).
 *
 * Before the fix, Alert Center listed 7504 while no roster puck badge was drawn.
 *
 * The 1015 finding is 2026-08-28..29. Default Live RP is the current month (Sep),
 * and Alert Center / GET /api/violations use unpadded RP bounds — so the test
 * must load 2026RP08 before asserting the row.
 */
import { expect, test, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilterLight,
  openFilter,
  readHook,
  seedGanttAuth,
  waitGanttReady,
} from '../../utils/gantt-hook'

const CREW_ID = '1015'

interface LivePuckSeverity {
  taskId: number
  crewId: string
  pairingId: number | null
  severity: number
}

interface LiveViolation {
  crewId?: string
  ruleCode: string
}

interface RosterRow {
  crewId: string
}

const waitUntil = async (
  page: Page,
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await page.waitForTimeout(1_000)
  }
  return false
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

/** Load August 2026 so the 1015 rest-gap (Aug 28–29) is inside official RP bounds. */
const selectAugustRosterPeriod = async (page: Page): Promise<void> => {
  const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
  await expect(trigger).toBeVisible({ timeout: 15_000 })
  await trigger.click()

  const rp08 = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]').filter({ hasText: /2026RP08/ })
  await expect(rp08).toBeVisible({ timeout: 15_000 })
  await rp08.click()

  const rp09 = page.locator('[data-testid^="toolbar-rp-multiselect-opt-"]').filter({ hasText: /2026RP09/ })
  if (await rp09.isVisible()) await rp09.click()

  await page.keyboard.press('Escape')

  await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-dialog').getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  await waitGanttReady(page, 120_000)
}

test('Live-1493 — crew 1015 Alert Center 7504 also marks gap-endpoint duty pucks', async ({ page, request }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(270_000)
  await selectRuleset103(page)
  await selectAugustRosterPeriod(page)

  await openFilter(page, 'crew')
  await page.getByTestId('filter-crew-id').fill(CREW_ID)
  await page.getByTestId('filter-crew-id').press('Enter')
  await applyFilterLight(page)

  const crewLoaded = await waitUntil(
    page,
    () =>
      readHook<RosterRow[]>(page, 'rosterPanelOrder').then((rows) =>
        rows.some((r) => r.crewId === CREW_ID),
      ),
    60_000,
  )
  expect(crewLoaded, `crew ${CREW_ID} must load after Crew ID filter`).toBe(true)

  await expect
    .poll(
      () =>
        readHook<LiveViolation[]>(page, 'liveViolations').then((rows) =>
          rows.some((v) => v.crewId === CREW_ID && v.ruleCode === '7504'),
        ),
      { timeout: 90_000, message: 'persisted 7504 for crew 1015 must reach the Live store in RP08' },
    )
    .toBe(true)

  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByTestId('alert-search-input').fill(CREW_ID)
  await expect(dialog.getByTestId('violation-list-table')).toContainText('7504', { timeout: 15_000 })

  await expect
    .poll(
      () =>
        readHook<LivePuckSeverity[]>(page, 'livePuckViolationSeverities').then((entries) =>
          entries.some((e) => e.crewId === CREW_ID && e.severity > 0),
        ),
      { timeout: 15_000, message: '7504 gap-endpoint duty puck must be marked' },
    )
    .toBe(true)

  await page.screenshot({
    path: '../docs/assets/screenshots/gantt/rule-7504-gap-endpoint-pucks-Ver1.png',
    clip: { x: 0, y: 0, width: 1440, height: 720 },
  })
})
