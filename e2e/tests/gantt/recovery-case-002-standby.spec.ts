/**
 * Case 2 — Rule 3007 published-delay-fdp: Standby Crew callout regression.
 *
 * Ryan's follow-up requirements (2026-09-14):
 *   2. a standby callout must offer AT LEAST 7 crew for selection, and
 *   3. those reserves must show a real COST DIFFERENCE — some priced over
 *      guarantee hours (GH). Priced as Pay(afterCredit) - Pay(beforeCredit)
 *      against an 85h/month guarantee floor.
 *
 * Source: pairing 152675 (ADD, B787, ET2681..ET2684, 2026-09-29 04:00Z -> 09-30
 * 18:00Z, CA vacancy from T2001, delayed -> Rule 3007). Reserves overlap the
 * start on an ASBY task 2026-09-29 00:00Z -> 08:00Z. Pool: 6 pre-existing CA
 * reserves (T2002..T2007, 55.5h..91h) plus 2 seeded CA reserves (T2041 45h,
 * T2042 88h; seed-case2-standby-pool.sql) -> 8 executable CA candidates with a
 * $0 -> ~$2850 cost ladder. For pairing 152675 a callout adds afterCredit =
 * beforeCredit + 14h. (Twelve FO reserves also overlap but are rank-gated out of
 * the CA vacancy.)
 *
 * This spec proves the fix through the real Live UI: the Standby Crew callout
 * for the CA vacancy must list >= 7 EXECUTABLE, fleet-matched CA candidates
 * showing distinct, priced costs (a $0 "best cost" pick alongside over-GH picks).
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const SOURCE_CREW = 'T2001'
// Full CA standby pool overlapping the pairing start. T2006 (83.5h) and T2007
// (91h) carry a pre-existing CRAMMED manday that trips Rule 8002 once the 18h
// pairing block is added, so they are (correctly) filtered — the very "roster
// and manday must match" failure mode. The four seeded reserves T2041..T2044
// use a legal daily spread and stay executable.
const SEEDED_RESERVES = ['T2041', 'T2042', 'T2043', 'T2044']
const POOL_RESERVES = ['T2002', 'T2003', 'T2004', 'T2005', 'T2006', 'T2007', ...SEEDED_RESERVES]
const CREW_IDS = [SOURCE_CREW, ...POOL_RESERVES]
const PAIRING_ID = 152675
const MIN_STANDBY_CANDIDATES = 7

const totalCrew = (page: import('@playwright/test').Page) =>
  readHook<Array<{ crewId: string }>>(page, 'crewSeniority')

test('Case 2 — 3007 Standby Crew callout offers >= 7 executable CA reserves with a GH cost spread', async ({ page, request }) => {
  test.setTimeout(900_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // ── Load Live: the delayed-duty source pilot + the standby reserves ────────
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

  await expect
    .poll(async () => {
      const loaded = new Set((await totalCrew(page)).map((c) => c.crewId))
      return SEEDED_RESERVES.every((c) => loaded.has(c))
    }, { timeout: 120_000, intervals: [1_000] })
    .toBe(true)

  await expect
    .poll(async () => {
      const items = await readHook<Array<Record<string, unknown>>>(page, 'roster')
      const sby = new Set(
        items
          .filter((it) => String(it.assignmentGroup ?? '').toUpperCase() === 'SBY')
          .map((it) => String(it.crewId)),
      )
      return SEEDED_RESERVES.every((c) => sby.has(c))
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
  // Recovery-option generation can take a while; wait for the violation label.
  await expect(dlg).toContainText('3007', { timeout: 180_000 })

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
  for (const crewId of SEEDED_RESERVES) {
    await expect(
      standbyGroup.getByTestId(`recovery-crew-checkbox-${crewId}`),
      `CA vacancy standby callout should list ${crewId} (CA) as executable`,
    ).toBeVisible({ timeout: 15_000 })
  }
  const executableCount = await standbyGroup.locator('[data-testid^="recovery-crew-checkbox-"]').count()
  expect(executableCount, `standby callout must offer at least ${MIN_STANDBY_CANDIDATES} crew`).toBeGreaterThanOrEqual(MIN_STANDBY_CANDIDATES)

  // Req 3 — real cost difference.
  const costTexts = await standbyGroup.locator('[data-testid^="recovery-cost-button-"]').allInnerTexts()
  const priced = costTexts.map((t) => t.trim()).filter((t) => t.length > 0)
  expect(priced.some((t) => /unpriced/i.test(t)), `no standby candidate should be Unpriced (got: ${priced.join(' | ')})`).toBe(false)
  const parseUsd = (t: string): number => Number(t.replace(/[^0-9.]/g, '')) || 0
  const amounts = priced.map(parseUsd)
  const distinct = new Set(priced)
  expect(distinct.size, `standby costs must differ across candidates (got: ${[...distinct].join(' | ')})`).toBeGreaterThan(1)
  expect(amounts.some((a) => a === 0), `at least one "best cost" ($0) standby pick expected (got: ${priced.join(' | ')})`).toBe(true)
  expect(amounts.some((a) => a > 0), `at least one over-GH (> $0) standby pick expected (got: ${priced.join(' | ')})`).toBe(true)

  await page.screenshot({ path: `${SHOT_DIR}/case2-standby-ca-pool-Ver1.png`, fullPage: true })
})
