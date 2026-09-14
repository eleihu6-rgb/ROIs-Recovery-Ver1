/**
 * Case 3 — Rule 8004 crew-fleet mismatch: Standby Crew callout regression.
 *
 * Ryan's report: the Standby Crew callout for the 8004 fleet-qual case
 * (pairing 152227, ET452/ET453, 2026-09-18/19) showed 0 options — "No
 * executable candidates in the current loaded data range" — even though it
 * used to have crew. Root cause: no SBY task in the fixture overlapped the
 * source pairing window, so the standby search (which reads only loaded
 * roster items whose SBY task overlaps the pairing start) had nothing to
 * offer. The other reserves in the schedule sit on 09-24 / 09-28-29 and never
 * overlap 152227's 09-18 19:15Z start.
 *
 * Fix (Ryan chose "Seed a 7M8 standby reserve on 09-18/19"): dedicated,
 * disjoint 7M8-qualified ADD reserves on an ASBY standby task
 * 2026-09-18 19:00Z -> 2026-09-19 05:00Z that overlaps the pairing start. All
 * survive the mandatory 8004 fleet hard-filter.
 *
 * Ryan's follow-up requirements (2026-09-14):
 *   2. a standby callout must offer AT LEAST 7 crew for selection, and
 *   3. those reserves must show a real COST DIFFERENCE — some priced over
 *      guarantee hours (GH). The airport-standby callout is priced as
 *      Pay(afterCredit) - Pay(beforeCredit) against an 85h/month guarantee
 *      floor, so a reserve already near/over the floor costs incremental GH pay
 *      while one well under it adds nothing. We seed each reserve's saved
 *      monthly credit (crew_manday_fd_daily) at graded levels 40..95h to
 *      produce a $0 -> ~$537 ladder (seed-case3-standby-pool.sql).
 *
 * Pool: 8 CA reserves (J4041, J4043..J4049) + 1 FO (J4042).
 *
 * This spec proves the fix through the real Live UI: after loading the case-3
 * pool plus the reserves, the Standby Crew callout for a CA vacancy must list
 * >= 7 EXECUTABLE (not just visible), fleet-matched CA candidates showing
 * distinct, priced costs (a $0 "best cost" pick alongside over-GH picks), and
 * the FO vacancy must offer the FO reserve.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const CASE_CREW = ['L3001', 'L3002', 'L3006', 'L3007']
// 8 CA reserves + 1 FO, all on ASBY tasks overlapping pairing 152227, with
// graded monthly credit (see seed-case3-standby-pool.sql) for a cost spread.
const CA_RESERVES = ['J4041', 'J4043', 'J4044', 'J4045', 'J4046', 'J4047', 'J4048', 'J4049']
const FO_RESERVES = ['J4042']
const RESERVE_CREW = [...CA_RESERVES, ...FO_RESERVES]
const CREW_IDS = [...CASE_CREW, ...RESERVE_CREW]
const PAIRING_ID = 152227
const MIN_STANDBY_CANDIDATES = 7

const totalCrew = (page: import('@playwright/test').Page) =>
  readHook<Array<{ crewId: string }>>(page, 'crewSeniority')

test('Case 3 — 8004 Standby Crew callout offers the seeded 7M8 reserves (J4041/J4042) as executable', async ({ page, request }) => {
  test.setTimeout(900_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // ── Load Live: the four assigned pilots + the two seeded standby reserves ──
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 10_000 })
  await emptyState.click()
  const filterDialog = page.getByTestId('filter-dialog')
  await expect(filterDialog).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  const crewIdField = page.getByTestId('filter-crew-id')
  await crewIdField.fill(CREW_IDS.join(','))
  await crewIdField.press('Enter')
  await page.getByTestId('filter-apply').click()
  await expect(filterDialog).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 300_000 })

  // Both reserves must be loaded into the crew store, or the standby search
  // (loaded-data only) can never see them.
  await expect
    .poll(async () => {
      const loaded = new Set((await totalCrew(page)).map((c) => c.crewId))
      return RESERVE_CREW.every((c) => loaded.has(c))
    }, { timeout: 120_000, intervals: [1_000] })
    .toBe(true)

  // The seeded ASBY tasks must be present in the loaded roster items.
  await expect
    .poll(async () => {
      const items = await readHook<Array<Record<string, unknown>>>(page, 'roster')
      const sby = new Set(
        items
          .filter((it) => String(it.assignmentGroup ?? '').toUpperCase() === 'SBY')
          .map((it) => String(it.crewId)),
      )
      return RESERVE_CREW.every((c) => sby.has(c))
    }, { timeout: 120_000, intervals: [1_000] })
    .toBe(true)

  // ── Standby Crew callout, exercised per rank ───────────────────────────────
  // The callout hard-gates a reserve whose rank is below the vacancy's rank, so
  // the CA reserve (J4041) is executable for a CA vacancy (L3001) and the FO
  // reserve (J4042) for an FO vacancy (L3006). Validate each against its match.
  const openStandbyExecutable = async (sourceCrew: string) => {
    // Roster-pane right-click -> Recovery opens the same 8004 dialog for the
    // crew+pairing directly, avoiding the crowded Alert Center list (the loaded
    // reserves add their own soft alerts that can virtualize the 8004 row out).
    await page.evaluate(({ crewId, pairingId }) => {
      (window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
    }, { crewId: sourceCrew, pairingId: PAIRING_ID })
    const rosterRecovery = page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first()
    await expect(rosterRecovery).toBeVisible({ timeout: 15_000 })
    await rosterRecovery.click({ force: true })
    const dlg = page.getByTestId('recovery-violation-dialog')
    await expect(dlg).toBeVisible({ timeout: 60_000 })
    await expect(dlg).toContainText('8004')

    await dlg.getByTestId('recovery-plan-filter-standby').click()
    const standbyGroup = dlg.getByTestId('recovery-options-standby')
    await expect(standbyGroup).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(async () => standbyGroup.getByText('Checking', { exact: true }).count(), { timeout: 180_000, intervals: [1_000] })
      .toBe(0)
    await dlg.getByTestId('recovery-options-filter-standby-executable').click()
    await expect(dlg.getByTestId('recovery-options-filter-standby-executable')).toHaveAttribute('aria-selected', 'true')
    await expect.poll(async () => standbyGroup.locator('div.border-l-2').count(), { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0)
    return { dlg, standbyGroup }
  }
  const closeDialog = async (dlg: import('@playwright/test').Locator) => {
    await dlg.getByRole('button', { name: 'Close' }).first().click({ force: true })
    await expect(dlg).not.toBeVisible({ timeout: 15_000 })
  }

  // CA vacancy (L3002) → all 8 CA reserves executable (>= 7 required); FO
  // reserve J4042 is correctly rank-gated out of the executable tier. (L3001
  // was transferred to J4003 by the clear/options flow, so L3002 is the
  // remaining CA on the pairing that still fires 8004.)
  const ca = await openStandbyExecutable('L3002')

  // Req 2 — at least 7 crew offered for selection. Assert each seeded CA
  // reserve is present, then count the executable rows.
  for (const crewId of CA_RESERVES) {
    await expect(
      ca.standbyGroup.getByTestId(`recovery-crew-checkbox-${crewId}`),
      `CA vacancy standby callout should list ${crewId} (CA) as executable`,
    ).toBeVisible({ timeout: 15_000 })
  }
  await expect(ca.standbyGroup.getByTestId('recovery-crew-checkbox-J4042'), 'FO reserve is rank-gated out of a CA vacancy executable list').toHaveCount(0)
  const executableCount = await ca.standbyGroup.locator('[data-testid^="recovery-crew-checkbox-"]').count()
  expect(executableCount, `standby callout must offer at least ${MIN_STANDBY_CANDIDATES} crew`).toBeGreaterThanOrEqual(MIN_STANDBY_CANDIDATES)

  // Req 3 — real cost difference. Every candidate must be priced (not
  // "Unpriced"), and the priced costs must span more than one value, including
  // a $0 "best cost" pick and at least one over-GH (> $0) pick.
  const costTexts = await ca.standbyGroup.locator('[data-testid^="recovery-cost-button-"]').allInnerTexts()
  const priced = costTexts.map((t) => t.trim()).filter((t) => t.length > 0)
  expect(priced.some((t) => /unpriced/i.test(t)), `no standby candidate should be Unpriced (got: ${priced.join(' | ')})`).toBe(false)
  const parseUsd = (t: string): number => Number(t.replace(/[^0-9.]/g, '')) || 0
  const amounts = priced.map(parseUsd)
  const distinct = new Set(priced)
  expect(distinct.size, `standby costs must differ across candidates (got: ${[...distinct].join(' | ')})`).toBeGreaterThan(1)
  expect(amounts.some((a) => a === 0), `at least one "best cost" ($0) standby pick expected (got: ${priced.join(' | ')})`).toBe(true)
  expect(amounts.some((a) => a > 0), `at least one over-GH (> $0) standby pick expected (got: ${priced.join(' | ')})`).toBe(true)

  await page.screenshot({ path: `${SHOT_DIR}/case3-standby-ca-pool-Ver1.png`, fullPage: true })
  await closeDialog(ca.dlg)

  // FO vacancy (L3006) → FO reserve J4042 executable.
  const fo = await openStandbyExecutable('L3006')
  await expect(fo.standbyGroup.getByTestId('recovery-crew-checkbox-J4042'), 'FO vacancy standby callout should list J4042 (FO) as executable').toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: `${SHOT_DIR}/case3-standby-fo-J4042-Ver1.png` })
})
