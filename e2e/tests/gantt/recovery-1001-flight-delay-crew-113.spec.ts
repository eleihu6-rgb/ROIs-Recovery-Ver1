/**
 * Rule 1001 (Assignment Overlap) Recovery — Crew 113 / Pairing 136149 (V4127), 2026-09-16
 *
 * DB-verified scenario (dev_live): Crew 113 holds the ADM/MTG ground task
 * 14:00Z-15:00Z and the flying Pairing 136149 (legs 1888 YVR-LAX 14:50Z-17:45Z and
 * 1889 LAX-YVR 18:30Z-21:30Z), which overlaps it → persisted Rule 1001 violation
 * "Overlapping assignments between FLY and MTG". Rule 1001 opens Recovery with
 * standby → Swap duty → Flight Delay.
 *
 * This is the scenario the planner reported as "standby and swap cannot be
 * selected / it says the tasks overlap", so all four tests drive the REAL UI,
 * the REAL candidate filters and the REAL legality preview (no API stubs, no
 * seeded fixtures):
 *
 *   1. the 1001 plan set is standby → Swap duty → Flight Delay; Flight Delay lists
 *      the affected flights in a "Flight" column with STD/STA/ATD/ATA and the
 *      delayed ATD/ATA, and carries no execution checkbox;
 *   2. Flight Delay Apply writes ONE unsaved-draft `edit-flight` op and the Gantt's
 *      rendered times follow (ATD/ATA only, STD/STA and the ground task untouched);
 *   3. Swap duty is offered for the real later-reporting candidate (Crew 656 /
 *      Pairing 136152) even though both crews are 737-only while the Pairings are
 *      7M8: the aircraft-type mismatch is now a SOFT constraint — the option stays
 *      selectable and the mismatch is displayed — and Apply writes the full
 *      two-way exchange (2× remove + 2× assign);
 *   4. Standby Crew callout is selectable too: the retained callout standby is the
 *      one overlap Recovery is allowed to create, and Apply writes remove + assign
 *      + the CALLOUT_STANDBY marker.
 *
 * NOTE the crew filter adds `Base = YVR`: dev_live contains duplicate
 * `roster_flight.id` values (Crew 113's MTG row id 258 collides with Crew 73's
 * row), and the client merges roster items by id, so loading Crew 73 silently
 * drops Crew 113's ground task. Filtering by base keeps the scenario's own data
 * intact (Crew 73 is YYZ-based) — see the playbook §17 gotcha 8.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, rosterObjects, readHook, setDateRange, waitGanttReady, selectDropdownOption } from '../../utils/gantt-hook'

const CREW_ID = '113'
const PAIRING_ID = 136149
const STANDBY_CREW_ID = '529'
const SWAP_TARGET_CREW_ID = '656'
const SWAP_TARGET_PAIRING_ID = 136152
/** Scenario assumption: the overlapping ADM/MTG ends 15:00Z, so the delay starts at
 *  15:00 + 1:01 = 16:01 (the expected delayed times below encode exactly that). */
const GROUND_TASK = { start: '2026-09-16T14:00:00.000Z', end: '2026-09-16T15:00:00.000Z' }
const DELAYED_FLIGHTS = [
  {
    flightId: 78053, fltNum: '1888', depArp: 'YVR', arvArp: 'LAX',
    std: '2026-09-16T14:50:00.000Z', sta: '2026-09-16T17:45:00.000Z',
    atd: '2026-09-16T16:01:00.000Z', ata: '2026-09-16T18:56:00.000Z',
  },
  {
    flightId: 78059, fltNum: '1889', depArp: 'LAX', arvArp: 'YVR',
    std: '2026-09-16T18:30:00.000Z', sta: '2026-09-16T21:30:00.000Z',
    // The 45 minute turnaround is preserved: 18:56 + 45 min → 19:41 departure.
    atd: '2026-09-16T19:41:00.000Z', ata: '2026-09-16T22:41:00.000Z',
  },
]

/**
 * Load Live narrowed to the Pilot division + YVR base around 2026-09-16 and open
 * Recovery from the persisted Rule 1001 row in the Alert Center.
 */
const openOverlapRecovery = async (page: Page): Promise<void> => {
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 5_000 })
  await emptyState.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  await selectDropdownOption(page, 'filter-crew-base', 'YVR', 'crew')
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 270_000 })

  // Scenario week. The toolbar date pickers were removed, so the shared test hook
  // drives the same filter-store range the Filter dialog sets.
  await setDateRange(page, '2026-09-14', '2026-09-18')
  await waitGanttReady(page, 180_000)
  // The Alert Center reads the persisted violations refreshed by the live-legality
  // recheck worker; give it the same settling window a planner experiences.
  await page.waitForTimeout(30_000)

  await page.getByTestId('violations-button').first().click()
  const alertCenter = page.getByTestId('violation-list-dialog')
  await expect(alertCenter).toBeVisible()

  // Crew 113 carries 3007 / 8004 / 1001 alerts, and the same 1001 alert can be
  // listed under both anchors. Bind the selection to the recoverable 1001 row.
  const overlapRow = alertCenter
    .locator(`[data-testid="violation-list-row"][data-crew-id="${CREW_ID}"][data-rule-code="1001"][data-recoverable="true"]`)
    .first()
  await expect(overlapRow).toBeVisible({ timeout: 60_000 })
  await overlapRow.locator('input[type="checkbox"]').check()
  await expect(page.getByTestId('alert-recovery-selected')).toBeEnabled()
  await page.getByTestId('alert-recovery-selected').click()

  await expect(alertCenter).not.toBeVisible({ timeout: 5_000 })
  const recoveryDialog = page.getByTestId('recovery-violation-dialog')
  await expect(recoveryDialog).toBeVisible({ timeout: 15_000 })
  await expect(recoveryDialog.getByText('Generating recovery options...')).toHaveCount(0, { timeout: 120_000 })
}

/** Wait for the option list's local Rule preview to settle (badge leaves "Checking"). */
const settleRuleCheck = async (group: ReturnType<Page['getByTestId']>): Promise<void> => {
  await expect
    .poll(async () => group.getByText('Checking', { exact: true }).count(), { timeout: 180_000, intervals: [1_000] })
    .toBe(0)
}

const openRecovery = async (page: Page, request: Parameters<typeof seedGanttAuth>[1]): Promise<void> => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await openOverlapRecovery(page)
}

test.describe('Rule 1001 Recovery — Assignment Overlap (Crew 113 / Pairing 136149, 2026-09-16)', () => {
  test('offers standby + swap duty (fleet mismatch shown, still selectable) + Flight Delay', async ({ page, request }) => {
    test.setTimeout(600_000)
    await openRecovery(page, request)

    const recoveryDialog = page.getByTestId('recovery-violation-dialog')
    // The 1001 plan set: standby → Swap duty → Flight Delay.
    await expect(recoveryDialog.getByTestId('recovery-plan-filter-standby')).toBeVisible()
    await expect(recoveryDialog.getByTestId('recovery-plan-filter-swap-duty')).toBeVisible()
    await expect(recoveryDialog.getByTestId('recovery-plan-filter-flight-delay')).toBeVisible()
    await expect(recoveryDialog.getByTestId('recovery-options-roster')).toHaveCount(0)

    // ── Standby Crew callout: the retained standby is an allowed overlap, so the
    // option must be selectable (regression: it used to be filtered out by 1001).
    await recoveryDialog.getByTestId('recovery-plan-filter-standby').click()
    const standbyGroup = recoveryDialog.getByTestId('recovery-options-standby')
    await expect(standbyGroup).toBeVisible({ timeout: 10_000 })
    await settleRuleCheck(standbyGroup)
    const standbyRow = standbyGroup
      .locator(`[data-testid="recovery-crew-checkbox-${STANDBY_CREW_ID}"]`)
      .first()
      .locator('xpath=ancestor::div[contains(@class, "border-l-2")][1]')
    await expect(standbyRow).toContainText('Executable')
    await expect(standbyRow.locator('input[type="checkbox"]')).toBeEnabled()

    // ── Swap duty: the real later-reporting candidate (Crew 656 / Pairing 136152)
    // is 737-only on both sides while the Pairings are 7M8, so the aircraft-type
    // mismatch must be DISPLAYED without blocking the option.
    await recoveryDialog.getByTestId('recovery-plan-filter-swap-duty').click()
    const swapGroup = recoveryDialog.getByTestId('recovery-options-swap-duty')
    await expect(swapGroup).toBeVisible({ timeout: 10_000 })
    await settleRuleCheck(swapGroup)
    const candidateRow = swapGroup
      .locator(`[data-testid="recovery-crew-checkbox-${SWAP_TARGET_CREW_ID}"]`)
      .first()
      .locator('xpath=ancestor::div[contains(@class, "border-l-2")][1]')
    await expect(candidateRow).toContainText('Executable')
    await expect(candidateRow).toContainText('7M8')
    await expect(candidateRow).toContainText('Fleet mismatch')
    await expect(candidateRow.locator('input[type="checkbox"]')).toBeEnabled()
    await page.screenshot({ path: 'output/recovery-1001-flight-delay/swap-duty-fleet-warning.png' })

    // ── Flight Delay: Flight column + every flight of the affected Pairing.
    await recoveryDialog.getByTestId('recovery-plan-filter-flight-delay').click()
    const delayGroup = recoveryDialog.getByTestId('recovery-options-flight-delay')
    await expect(delayGroup).toBeVisible({ timeout: 10_000 })
    await expect(delayGroup.getByTestId('recovery-flight-delay-column')).toHaveText('Flight')
    await expect(delayGroup).toContainText('ground task ends 15:00Z + 1:01')
    await expect(delayGroup.locator('input[type="checkbox"]')).toHaveCount(0)
    const first = delayGroup.getByTestId(`recovery-flight-delay-segment-${DELAYED_FLIGHTS[0].flightId}`)
    await expect(first).toContainText('1888')
    await expect(first).toContainText('YVR')
    await expect(first).toContainText('LAX')
    await expect(first).toContainText('14:50Z')
    await expect(first).toContainText('17:45Z')
    const second = delayGroup.getByTestId(`recovery-flight-delay-segment-${DELAYED_FLIGHTS[1].flightId}`)
    await expect(second).toContainText('1889')
    await expect(second).toContainText('18:30Z')
    await expect(second).toContainText('21:30Z')
    await expect(delayGroup.getByTestId(`recovery-flight-delay-atd-${DELAYED_FLIGHTS[0].flightId}`)).toContainText('16:01Z')
    await expect(delayGroup.getByTestId(`recovery-flight-delay-ata-${DELAYED_FLIGHTS[0].flightId}`)).toContainText('18:56Z')
    await expect(delayGroup.getByTestId(`recovery-flight-delay-atd-${DELAYED_FLIGHTS[1].flightId}`)).toContainText('19:41Z')
    await expect(delayGroup.getByTestId(`recovery-flight-delay-ata-${DELAYED_FLIGHTS[1].flightId}`)).toContainText('22:41Z')
    await expect(recoveryDialog.getByText(`Selected Flight Delay · keep Crew ${CREW_ID}`)).toBeVisible()
    await expect(recoveryDialog.getByTestId('recovery-apply')).toBeEnabled()
    await page.screenshot({ path: 'output/recovery-1001-flight-delay/flight-delay-options.png' })
  })

  test('Flight Delay Apply delays every flight of the Pairing in the Gantt draft', async ({ page, request }) => {
    test.setTimeout(600_000)
    await openRecovery(page, request)

    const recoveryDialog = page.getByTestId('recovery-violation-dialog')
    await recoveryDialog.getByTestId('recovery-plan-filter-flight-delay').click()
    await expect(recoveryDialog.getByTestId('recovery-options-flight-delay')).toBeVisible({ timeout: 10_000 })

    const pair = (items: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
      items.filter((item) => String(item.crewId) === CREW_ID && Number(item.pairingId) === PAIRING_ID)
    const itemsBefore = await rosterObjects(page)
    const before = pair(itemsBefore)
    expect(before.map((item) => Number(item.fltId)).sort()).toEqual(DELAYED_FLIGHTS.map((flight) => flight.flightId).sort())
    expect(before.every((item) => item.actStrDtUtc === item.start)).toBe(true)
    const groundTaskBefore = itemsBefore.filter((item) => String(item.crewId) === CREW_ID
      && item.pairingId == null
      && String(item.assignment) === 'MTG')
    expect(groundTaskBefore, 'scenario assumption: one overlapping MTG ground task on 9/16').toHaveLength(1)
    expect(groundTaskBefore[0].end, 'scenario assumption: that ground task ends 15:00Z').toBe(GROUND_TASK.end)
    const groundTaskWindowBefore = { id: groundTaskBefore[0].id, start: groundTaskBefore[0].start, end: groundTaskBefore[0].end }

    await recoveryDialog.getByTestId('recovery-apply').click()
    await expect(recoveryDialog).not.toBeVisible({ timeout: 30_000 })

    const draftOps = await readHook<Array<Record<string, unknown>>>(page, 'draftOps')
    const editOp = draftOps.find((op) => op.type === 'edit-flight')
    expect(editOp, 'Apply must add an edit-flight draft op').toBeTruthy()
    expect(editOp?.flightTimes).toEqual(DELAYED_FLIGHTS.map((flight) => ({
      flightId: flight.flightId,
      schDepDtUtc: flight.std,
      schArvDtUtc: flight.sta,
      actDepDtUtc: flight.atd,
      actArvDtUtc: flight.ata,
    })))

    const after = pair(await rosterObjects(page))
    for (const flight of DELAYED_FLIGHTS) {
      const row = after.find((item) => Number(item.fltId) === flight.flightId)
      expect(row, `flight ${flight.fltNum} must stay on Crew 113's roster`).toBeTruthy()
      expect(row?.start).toBe(flight.std)
      expect(row?.end).toBe(flight.sta)
      expect(row?.actStrDtUtc).toBe(flight.atd)
      expect(row?.actEndDtUtc).toBe(flight.ata)
    }
    // A Flight Delay edits flights only: the ground task that caused the 1001 keeps the
    // exact window it had (compared with the pre-Apply snapshot, so the assertion does
    // not depend on which window the planner chose for that task).
    const groundTaskAfter = (await rosterObjects(page)).filter((item) => String(item.crewId) === CREW_ID
      && item.pairingId == null
      && String(item.assignment) === 'MTG')
    expect(groundTaskAfter).toHaveLength(1)
    expect({ id: groundTaskAfter[0].id, start: groundTaskAfter[0].start, end: groundTaskAfter[0].end })
      .toEqual(groundTaskWindowBefore)

    await page.screenshot({ path: 'output/recovery-1001-flight-delay/flight-delay-applied.png' })
  })

  test('Swap duty Apply exchanges both Pairings although the fleet does not match', async ({ page, request }) => {
    test.setTimeout(600_000)
    await openRecovery(page, request)

    const recoveryDialog = page.getByTestId('recovery-violation-dialog')
    await recoveryDialog.getByTestId('recovery-plan-filter-swap-duty').click()
    const swapGroup = recoveryDialog.getByTestId('recovery-options-swap-duty')
    await expect(swapGroup).toBeVisible({ timeout: 10_000 })
    await settleRuleCheck(swapGroup)

    const candidateRow = swapGroup
      .locator(`[data-testid="recovery-crew-checkbox-${SWAP_TARGET_CREW_ID}"]`)
      .first()
      .locator('xpath=ancestor::div[contains(@class, "border-l-2")][1]')
    await expect(candidateRow).toContainText('Fleet mismatch')
    const checkbox = candidateRow.locator('input[type="checkbox"]')
    await expect(checkbox).toBeEnabled()
    await checkbox.check()
    await expect(recoveryDialog.getByTestId('recovery-apply')).toBeEnabled()

    await recoveryDialog.getByTestId('recovery-apply').click()
    await expect(recoveryDialog).not.toBeVisible({ timeout: 30_000 })

    const draftOps = await readHook<Array<Record<string, unknown>>>(page, 'draftOps')
    expect(draftOps.map((op) => op.type)).toEqual([
      'remove-pairing-from-crew',
      'remove-pairing-from-crew',
      'assign-pairing',
      'assign-pairing',
    ])
    expect(draftOps[0]).toMatchObject({ pairingId: PAIRING_ID, crewId: CREW_ID })
    expect(draftOps[1]).toMatchObject({ pairingId: SWAP_TARGET_PAIRING_ID, crewId: SWAP_TARGET_CREW_ID })
    expect(draftOps[2]).toMatchObject({ pairingId: PAIRING_ID, crewId: SWAP_TARGET_CREW_ID })
    expect(draftOps[3]).toMatchObject({ pairingId: SWAP_TARGET_PAIRING_ID, crewId: CREW_ID })

    const roster = await rosterObjects(page)
    expect(roster.some((item) => String(item.crewId) === CREW_ID && Number(item.pairingId) === PAIRING_ID)).toBe(false)
    expect(roster.some((item) => String(item.crewId) === SWAP_TARGET_CREW_ID && Number(item.pairingId) === PAIRING_ID)).toBe(true)
    expect(roster.some((item) => String(item.crewId) === CREW_ID && Number(item.pairingId) === SWAP_TARGET_PAIRING_ID)).toBe(true)

    await page.screenshot({ path: 'output/recovery-1001-flight-delay/swap-duty-applied.png' })
  })

  test('Standby Crew callout Apply keeps the standby as a CALLOUT_STANDBY', async ({ page, request }) => {
    test.setTimeout(600_000)
    await openRecovery(page, request)

    const recoveryDialog = page.getByTestId('recovery-violation-dialog')
    await recoveryDialog.getByTestId('recovery-plan-filter-standby').click()
    const standbyGroup = recoveryDialog.getByTestId('recovery-options-standby')
    await expect(standbyGroup).toBeVisible({ timeout: 10_000 })
    await settleRuleCheck(standbyGroup)

    const standbyRow = standbyGroup
      .locator(`[data-testid="recovery-crew-checkbox-${STANDBY_CREW_ID}"]`)
      .first()
      .locator('xpath=ancestor::div[contains(@class, "border-l-2")][1]')
    const checkbox = standbyRow.locator('input[type="checkbox"]')
    await expect(checkbox).toBeEnabled()
    await checkbox.check()
    await expect(recoveryDialog.getByTestId('recovery-apply')).toBeEnabled()
    await recoveryDialog.getByTestId('recovery-apply').click()
    await expect(recoveryDialog).not.toBeVisible({ timeout: 30_000 })

    const draftOps = await readHook<Array<Record<string, unknown>>>(page, 'draftOps')
    expect(draftOps.map((op) => op.type)).toEqual(['remove-pairing-from-crew', 'assign-pairing', 'update'])
    expect(draftOps[0]).toMatchObject({ pairingId: PAIRING_ID, crewId: CREW_ID })
    expect(draftOps[1]).toMatchObject({ pairingId: PAIRING_ID, crewId: STANDBY_CREW_ID })
    expect(draftOps[2]).toMatchObject({ data: { exceptionCode: 'CALLOUT_STANDBY' } })

    const roster = await rosterObjects(page)
    // The Pairing moves to the standby Crew; the standby task is retained as the
    // callout paper trail instead of being deleted.
    expect(roster.some((item) => String(item.crewId) === STANDBY_CREW_ID && Number(item.pairingId) === PAIRING_ID)).toBe(true)
    const callout = roster.find((item) => String(item.crewId) === STANDBY_CREW_ID
      && item.pairingId == null
      && String(item.exceptionCode) === 'CALLOUT_STANDBY')
    expect(callout, 'the retained standby must be marked CALLOUT_STANDBY in the draft').toBeTruthy()

    await page.screenshot({ path: 'output/recovery-1001-flight-delay/standby-callout-applied.png' })
  })
})
