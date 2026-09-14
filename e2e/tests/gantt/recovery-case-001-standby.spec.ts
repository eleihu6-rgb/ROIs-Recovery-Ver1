/**
 * Case 1 — Rule 1001 assignment-overlap: Standby Crew callout regression.
 *
 * Ryan's follow-up requirements (2026-09-14):
 *   2. a standby callout must offer AT LEAST 7 crew for selection, and
 *   3. those reserves must show a real COST DIFFERENCE — some priced over
 *      guarantee hours (GH). The airport-standby callout is priced as
 *      Pay(afterCredit) - Pay(beforeCredit) against an 85h/month guarantee
 *      floor, so a reserve already near/over the floor costs incremental GH pay
 *      while one well under it adds nothing.
 *
 * Source: pairing 152056 (ADD, 7M8, 2026-09-24 03:10Z -> 09-26, CA vacancy from
 * J4002, Rule 1001 overlap). Reserves overlap the start on an ASBY task
 * 2026-09-24 02:00Z -> 10:00Z. Pool: 3 pre-existing CA reserves (J4011 flies the
 * pairing itself, so it is filtered from its own callout; J4012 76.6h, J4013
 * 87.1h) plus 6 seeded CA reserves J4051..J4056 with graded monthly credit
 * (seed-case1-standby-pool.sql) for a $0 -> ~$2287 cost ladder. For pairing
 * 152056 a callout adds afterCredit = beforeCredit + 11.25h.
 *
 * This spec proves the fix through the real Live UI: the Standby Crew callout
 * for the CA vacancy must list >= 7 EXECUTABLE (not just visible), fleet-matched
 * CA candidates showing distinct, priced costs (a $0 "best cost" pick alongside
 * over-GH picks).
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const SOURCE_CREW = 'J4002'
// Clean CA reserves (not on the pairing) that must surface as executable. J4011
// also overlaps but flies 152056 itself, so it is filtered from its own callout.
const CA_RESERVES = ['J4012', 'J4013', 'J4051', 'J4052', 'J4053', 'J4054', 'J4055', 'J4056']
const CREW_IDS = [SOURCE_CREW, 'J4011', ...CA_RESERVES]
const PAIRING_ID = 152056
const MIN_STANDBY_CANDIDATES = 7

const totalCrew = (page: import('@playwright/test').Page) =>
  readHook<Array<{ crewId: string }>>(page, 'crewSeniority')

test('Case 1 — 1001 Standby Crew callout offers >= 7 executable CA reserves with a GH cost spread', async ({ page, request }) => {
  test.setTimeout(900_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // ── Load Live: the overlap source pilot + the standby reserves ─────────────
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

  // Reserves must be in the crew store, or the standby search (loaded-data only)
  // can never see them.
  await expect
    .poll(async () => {
      const loaded = new Set((await totalCrew(page)).map((c) => c.crewId))
      return CA_RESERVES.every((c) => loaded.has(c))
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
      return CA_RESERVES.every((c) => sby.has(c))
    }, { timeout: 120_000, intervals: [1_000] })
    .toBe(true)

  // ── Standby Crew callout for the CA vacancy ────────────────────────────────
  await page.evaluate(({ crewId, pairingId }) => {
    (window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
  }, { crewId: SOURCE_CREW, pairingId: PAIRING_ID })
  const rosterRecovery = page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first()
  await expect(rosterRecovery).toBeVisible({ timeout: 15_000 })
  await rosterRecovery.click({ force: true })
  const dlg = page.getByTestId('recovery-violation-dialog')
  await expect(dlg).toBeVisible({ timeout: 60_000 })
  // Recovery-option generation for the 1001 overlap can take a while; wait for
  // the violation label to render rather than assuming it is instant.
  await expect(dlg).toContainText('1001', { timeout: 180_000 })

  await dlg.getByTestId('recovery-plan-filter-standby').click()
  const standbyGroup = dlg.getByTestId('recovery-options-standby')
  await expect(standbyGroup).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(async () => standbyGroup.getByText('Checking', { exact: true }).count(), { timeout: 180_000, intervals: [1_000] })
    .toBe(0)
  await dlg.getByTestId('recovery-options-filter-standby-executable').click()
  await expect(dlg.getByTestId('recovery-options-filter-standby-executable')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => standbyGroup.locator('div.border-l-2').count(), { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0)

  // Req 2 — at least 7 crew offered for selection.
  for (const crewId of CA_RESERVES) {
    await expect(
      standbyGroup.getByTestId(`recovery-crew-checkbox-${crewId}`),
      `CA vacancy standby callout should list ${crewId} (CA) as executable`,
    ).toBeVisible({ timeout: 15_000 })
  }
  const executableCount = await standbyGroup.locator('[data-testid^="recovery-crew-checkbox-"]').count()
  expect(executableCount, `standby callout must offer at least ${MIN_STANDBY_CANDIDATES} crew`).toBeGreaterThanOrEqual(MIN_STANDBY_CANDIDATES)

  // Req 3 — real cost difference: every candidate priced, spanning > 1 value,
  // including a $0 "best cost" pick and at least one over-GH (> $0) pick.
  const costTexts = await standbyGroup.locator('[data-testid^="recovery-cost-button-"]').allInnerTexts()
  const priced = costTexts.map((t) => t.trim()).filter((t) => t.length > 0)
  expect(priced.some((t) => /unpriced/i.test(t)), `no standby candidate should be Unpriced (got: ${priced.join(' | ')})`).toBe(false)
  const parseUsd = (t: string): number => Number(t.replace(/[^0-9.]/g, '')) || 0
  const amounts = priced.map(parseUsd)
  const distinct = new Set(priced)
  expect(distinct.size, `standby costs must differ across candidates (got: ${[...distinct].join(' | ')})`).toBeGreaterThan(1)
  expect(amounts.some((a) => a === 0), `at least one "best cost" ($0) standby pick expected (got: ${priced.join(' | ')})`).toBe(true)
  expect(amounts.some((a) => a > 0), `at least one over-GH (> $0) standby pick expected (got: ${priced.join(' | ')})`).toBe(true)

  await page.screenshot({ path: `${SHOT_DIR}/case1-standby-ca-pool-Ver1.png`, fullPage: true })
})
