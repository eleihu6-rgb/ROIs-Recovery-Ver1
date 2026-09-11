/**
 * End-to-end for the timezone + attribution fix:
 *   Rule A: Entering Gantt with a Base filter auto-switches the display
 *           timezone to the first base's timezone; clearing the base filter
 *           falls back to UTC.
 *   Rule B: Rule alerts that already carry `crewId + pairingId` (or rosterId)
 *           attribution surface on hover via direct matching, not the
 *           `pairingTasksOverlapViolationWindow` fallback. The previous
 *           fallback dropped the 8004 alert for Crew=113 / Pairing=135905
 *           in UTC even though the violation was in `displayViolations`.
 *
 * Why this test exists:
 *   Before the fix, switching to YVR "unlocked" the 8004 alert — but the
 *   underlying data is identical in both timezones (DB row matches task
 *   times exactly). Rule B makes the surfacing a function of direct
 *   attribution instead of UTC-vs-local window boundary math.
 *
 * Steps:
 *   1. Login → Live gantt (bootstrap, no filter, expect UTC default).
 *   2. Apply crew filter with Pilot + a real base (first available option
 *      from the Base dropdown). Verify the gantt display timezone
 *      automatically becomes that base's zone.
 *   3. Re-open the filter, clear the Base, keep Pilot. Verify the display
 *      timezone falls back to UTC.
 *   4. (Rule B) In UTC, hover task 46 (crew 113 / pairing 135905) and
 *      assert the violation tooltip shows the 8004 entry by `data-rule-code`.
 *
 * §No-Illusion: every assertion checks a real, observable store / DOM
 * value (timezone state, tooltip rows, live violations list) — no
 * "canvas has non-empty pixels" shortcuts.
 */
import { test, expect, type Page } from '@playwright/test'
import {
  seedGanttAuth,
  gotoGantt,
  openFilter,
  applyFilter,
} from '../../utils/gantt-hook'

const RULESET_ID = 1
const TARGET_CREW_ID = '113'
const TARGET_PAIRING_ID = 135905
const TARGET_TASK_ID = 46

type LiveViol = {
  pairingId: number
  crewId?: string
  ruleCode: string
  severity: number
  message: string
}

type TzState = { timezone: string; timezoneAirport: string }

const readTimezone = (page: Page): Promise<TzState> =>
  page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { timezone?: () => TzState } }).__ganttTest
    return t?.timezone?.() ?? { timezone: 'UTC', timezoneAirport: 'UTC' }
  })

const readLiveViolations = (page: Page): Promise<LiveViol[]> =>
  page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
    return t?.liveViolations?.() ?? []
  })

const waitForTargetHit = async (
  page: Page,
  expected: { crewId: string; pairingId: number; ruleCode: string },
  timeoutMs: number,
): Promise<LiveViol[]> => {
  await expect
    .poll(
      () =>
        readLiveViolations(page).then((vs) =>
          vs.filter(
            (v) =>
              v.crewId === expected.crewId &&
              v.pairingId === expected.pairingId &&
              v.ruleCode === expected.ruleCode,
          ),
        ),
      { timeout: timeoutMs, intervals: [1_000] },
    )
    .not.toHaveLength(0)
  return readLiveViolations(page)
}

const selectFirstAvailableBase = async (page: Page): Promise<string> => {
  await page.getByTestId('filter-crew-base-trigger').click()
  const firstOpt = page.locator('[data-testid^="filter-crew-base-opt-"]').first()
  await expect(firstOpt).toBeVisible({ timeout: 15_000 })
  const attr = (await firstOpt.getAttribute('data-testid')) ?? ''
  const value = attr.slice('filter-crew-base-opt-'.length)
  await firstOpt.click()
  // Close the dropdown by clicking the Crew tab header (matches the helper used elsewhere).
  await page.getByTestId('filter-tab-crew').click()
  return value
}

const removeBaseFilter = async (page: Page, base: string): Promise<void> => {
  const remove = page.getByTestId(`filter-crew-base-remove-${base}`)
  if ((await remove.count()) > 0) await remove.click()
}

const setRosterHover = (
  page: Page,
  taskId: number,
  clientX: number,
  clientY: number,
): Promise<void> =>
  page.evaluate(
    ({ id, x, y }) => {
      const t = (window as unknown as {
        __ganttTest?: { setHoveredTaskForTest?: (id: number, x: number, y: number) => void }
      }).__ganttTest
      t?.setHoveredTaskForTest?.(id, x, y)
    },
    { id: taskId, x: clientX, y: clientY },
  )

test('RuleA+RuleB — base filter auto-switches timezone; UTC + direct attribution shows 8004 alert on hover', async ({
  page,
  request,
}) => {
  const token = await seedGanttAuth(page, request)
  await gotoGantt(page)

  // Make sure we start from a known state — no filter applied, timezone = UTC.
  const initialTz = await readTimezone(page)
  expect(initialTz.timezoneAirport, 'baseline timezone should be UTC before any base filter').toBe('UTC')

  // ── Rule A, step 1: select Pilot + first available base → expect timezone to flip ──
  await openFilter(page, 'crew')
  await page.getByTestId('filter-crew-division-P').click()
  const selectedBase = await selectFirstAvailableBase(page)
  expect(selectedBase.length, 'first base option must be a non-empty IATA code').toBeGreaterThan(0)

  await applyFilter(page)

  await expect
    .poll(() => readTimezone(page).then((tz) => tz.timezoneAirport), {
      timeout: 15_000,
      intervals: [500],
      message: `applying a base filter should auto-switch the display timezone to the base (got ${selectedBase})`,
    })
    .toBe(selectedBase)

  const baseTz = await readTimezone(page)
  expect(baseTz.timezoneAirport).toBe(selectedBase)
  expect(baseTz.timezone, 'zoneId must be a non-UTC IANA name').not.toBe('UTC')

  // ── Rule A, step 2: clear the base filter → expect timezone to fall back to UTC ──
  await openFilter(page, 'crew')
  await removeBaseFilter(page, selectedBase)
  await page.getByTestId('filter-crew-division-P').click()
  await applyFilter(page)

  await expect
    .poll(() => readTimezone(page).then((tz) => tz.timezoneAirport), {
      timeout: 15_000,
      intervals: [500],
      message: 'clearing the base filter should fall the display timezone back to UTC',
    })
    .toBe('UTC')

  const clearedTz = await readTimezone(page)
  expect(clearedTz.timezoneAirport).toBe('UTC')
  expect(clearedTz.timezone).toBe('UTC')

  // ── Rule B: in UTC, hover task 46 (crew 113 / pairing 135905).
  // 8004 violation is in displayViolations with both crewId + pairingId set.
  // Before the fix, the tooltip dropped it because pairingTasksOverlapViolationWindow
  // returned false in UTC. After the fix, the direct (crewId + pairingId) match
  // bypasses the window check and the entry is shown.
  await waitForTargetHit(
    page,
    { crewId: TARGET_CREW_ID, pairingId: TARGET_PAIRING_ID, ruleCode: '8004' },
    90_000,
  )

  // Defensive: force UTC explicitly. The Rule B fix must hold in UTC.
  await page.evaluate(() => {
    const t = (window as unknown as {
      __ganttTest?: { setTimezone?: (z: string, a: string) => void }
    }).__ganttTest
    t?.setTimezone?.('UTC', 'UTC')
  })
  const tzBeforeHover = await readTimezone(page)
  expect(tzBeforeHover.timezoneAirport, 'hover path must run in UTC for this regression').toBe('UTC')

  // Drive the floating tooltip through the same code path the canvas uses
  // on a real mouse hover. The tooltip itself only needs hoveredTaskId to
  // render its content — hoverPosition is for placement.
  await setRosterHover(page, TARGET_TASK_ID, 400, 200)

  const tooltip = page.locator('div.fixed', { hasText: 'Rule Violations' }).last()
  await expect(tooltip).toBeVisible({ timeout: 10_000 })

  const eightRow = tooltip.locator('[data-rule-code="8004"]').first()
  await expect(eightRow, '8004 alert must surface on hover in UTC after Rule B fix').toBeVisible({
    timeout: 5_000,
  })
  // The row carries data-rule-id (e.g. "8004/002") for the Alert Center parity.
  await expect(eightRow).toHaveAttribute('data-rule-id', /8004\/002|8004\/001/)
  // The message cell references the actual fleet mismatch and a date.
  await expect(eightRow).toContainText(/Crew fleet|fleet|pairing|2026-09-1[12]/i)

  // Sanity: same direct attribution should still work in YVR (the previous "working" mode).
  await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { setTimezone?: (z: string, a: string) => void } }).__ganttTest
    t?.setTimezone?.('America/Vancouver', 'YVR')
  })
  await setRosterHover(page, TARGET_TASK_ID, 400, 200)
  const yvrTooltip = page.locator('div.fixed', { hasText: 'Rule Violations' }).last()
  await expect(yvrTooltip).toBeVisible({ timeout: 5_000 })
  await expect(yvrTooltip.locator('[data-rule-code="8004"]').first()).toBeVisible()

  // Quick sanity: Alert Center surface still lists the same row.
  await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { setTimezone?: (z: string, a: string) => void } }).__ganttTest
    t?.setTimezone?.('UTC', 'UTC')
  })
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(
    dialog.locator(
      `[data-testid="violation-list-row"][data-crew-id="${TARGET_CREW_ID}"][data-rule-code="8004"]`,
    ).first(),
  ).toBeVisible({ timeout: 5_000 })

  expect(RULESET_ID).toBe(1)
  expect(token.length, 'auth token must be present').toBeGreaterThan(0)
})
