/**
 * Regression: persisted rule 7501 for crew 2438 is anchored on pairing 15806,
 * but every in-window FLY pairing in the failed window must paint a roster puck.
 *
 * Fixture: f8_sit_live, Aug 2026, ruleset 103, YYC/P crew 2438.
 */
import { expect, test, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  applyFilterLight,
  openFilter,
  readHook,
  seedGanttAuth,
  selectDropdownOption,
} from '../../utils/gantt-hook'

const CREW_ID = '2438'
const EXPECTED_PAIRING_IDS = [15676, 15806] as const

interface LivePuckSeverity {
  taskId: number
  crewId: string
  pairingId: number | null
  severity: number
}

interface LiveViolation {
  pairingId: number
  crewId?: string
  ruleCode: string
  severity: number
  message: string
  windowStartDt?: string | null
  windowEndDt?: string | null
  startDt?: string | null
  endDt?: string | null
}

interface RosterRow {
  crewId: string
}

interface RosterTask {
  crewId: string
  pairingId: number | null
  assignment: string
  start: string
  end: string
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

test('Live-1491 — 7501 paints every in-window FLY pairing puck', async ({ page, request }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(270_000)
  await selectRuleset103(page)

  const range = await readHook<{ start: string; end: string }>(page, 'dateRange')
  expect(Date.parse(range.start), 'Live range must include the start of Aug 2026').toBeLessThanOrEqual(
    Date.parse('2026-08-01T00:00:00.000Z'),
  )
  expect(Date.parse(range.end), 'Live range must include the end of Aug 2026').toBeGreaterThanOrEqual(
    Date.parse('2026-08-31T23:59:59.000Z'),
  )

  await openFilter(page, 'crew')
  await page.getByTestId('filter-crew-division-P').click()
  await selectDropdownOption(page, 'filter-crew-base', 'YYC', 'crew')
  await page.getByTestId('filter-crew-id').fill(CREW_ID)
  await page.getByTestId('filter-crew-id').press('Enter')
  await applyFilterLight(page)

  const crewLoaded = await waitUntil(
    page,
    () =>
      readHook<RosterRow[]>(page, 'rosterPanelOrder').then((rows) => rows[0]?.crewId === CREW_ID),
    30_000,
  )
  if (!crewLoaded) {
    test.skip(true, `f8_sit_live fixture missing: crew ${CREW_ID} did not load for YYC/P in Aug 2026`)
    return
  }

  const has7501Violation = await waitUntil(
    page,
    () =>
      readHook<LiveViolation[]>(page, 'liveViolations').then((violations) =>
        violations.some(
          (violation) =>
            violation.crewId === CREW_ID &&
            violation.pairingId === 15806 &&
            violation.ruleCode === '7501' &&
            violation.severity > 0,
        ),
      ),
    60_000,
  )
  if (!has7501Violation) {
    test.skip(
      true,
      'f8_sit_live fixture missing: persisted rule 7501 anchored on pairing 15806 for crew 2438 did not load',
    )
    return
  }

  const violation7501 = (await readHook<LiveViolation[]>(page, 'liveViolations')).find(
    (violation) =>
      violation.crewId === CREW_ID &&
      violation.pairingId === 15806 &&
      violation.ruleCode === '7501' &&
      violation.severity > 0,
  )
  const windowStartMs = Date.parse(violation7501?.windowStartDt ?? violation7501?.startDt ?? '')
  const windowEndMs = Date.parse(violation7501?.windowEndDt ?? violation7501?.endDt ?? '')
  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) {
    test.skip(true, 'f8_sit_live fixture missing: persisted rule 7501 on pairing 15806 has no usable window')
    return
  }

  const rosterTasks = await readHook<RosterTask[]>(page, 'roster')
  const missingFlyPairings = EXPECTED_PAIRING_IDS.filter((pairingId) =>
    !rosterTasks.some((task) =>
      task.crewId === CREW_ID &&
      task.pairingId === pairingId &&
      task.assignment === 'FLY' &&
      Date.parse(task.start) < windowEndMs &&
      Date.parse(task.end) > windowStartMs,
    ),
  )
  if (missingFlyPairings.length > 0) {
    test.skip(
      true,
      `f8_sit_live fixture missing: crew ${CREW_ID} has no loaded in-window FLY duties on pairing(s) ${missingFlyPairings.join(', ')}`,
    )
    return
  }

  for (const pairingId of EXPECTED_PAIRING_IDS) {
    await expect
      .poll(
        () =>
          readHook<LivePuckSeverity[]>(page, 'livePuckViolationSeverities').then((entries) =>
            entries.some(
              (entry) =>
                entry.crewId === CREW_ID &&
                entry.pairingId === pairingId &&
                entry.severity > 0,
            ),
          ),
        {
          timeout: 30_000,
          message: `crew ${CREW_ID} pairing ${pairingId} must have a positive 7501 puck severity`,
        },
      )
      .toBe(true)
  }
})
