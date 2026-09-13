/**
 * Case 3 — Rule 8004 crew-fleet mismatch (788 pairing changed to 7M8).
 *
 * Fixture (prepared by .local/case3/*, not by this test):
 *   - 10 ADD-base crew qualified on 788 (L3001–L3010; 5 CA + 5 FO).
 *   - Pairing 152227 (ADD-CAI-ADD, 2026-09-19, 788, composition 2 CA + 2 FO)
 *     fully rostered with L3001/L3002 (CA) + L3006/L3007 (FO).
 *   - Both flights (ET452/ET453) changed 788 -> 7M8, so 8004 FLEET fires for
 *     all four crew ("Crew fleet (788) is invalid for the pairing (7M8)").
 *
 * Acceptance: the SAME 8004 alert opens Recovery from all three entry points —
 *   1. Alert Center row (select + "Recovery Selected")
 *   2. Pairing-pane row right-click -> Recovery
 *   3. Roster-pane row right-click -> Recovery
 * and the Recovery dialog exposes the three methods from the demo video
 * (Roster transfer/exchange, Standby Crew callout, Cross-base positioning).
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const CREW_IDS = ['L3001', 'L3002', 'L3006', 'L3007']
const PAIRING_ID = 152227
const SOURCE_CREW = 'L3001'

const totalCrew = (page: import('@playwright/test').Page) =>
  readHook<Array<{ crewId: string }>>(page, 'crewSeniority')

test('Case 3 — 8004 fleet mismatch opens Recovery from Alert Center, Pairing pane and Roster pane', async ({ page, request }) => {
  test.setTimeout(900_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // ── Load Live narrowed to the case-3 crew ──────────────────────────────
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

  // Default range (2026-08-25 ~ 2026-10-07) already covers the 2026-09-19 pairing;
  // the date control is now an RP-period dropdown, so no explicit range narrowing.
  // All 10 seeded ADD/788 crew are loaded into the crew store.
  await expect.poll(async () => (await totalCrew(page)).length, { timeout: 120_000, intervals: [1_000] }).toBeGreaterThan(0)
  const loaded = new Set((await totalCrew(page)).map((c) => c.crewId))
  for (let i = 1; i <= 10; i++) expect(loaded.has(`L30${String(i).padStart(2, '0')}`), `crew L30${i} should be loaded`).toBe(true)

  // The four assigned pilots carry the 788 pairing in the roster pane.
  await expect
    .poll(async () => {
      const items = await readHook<Array<Record<string, unknown>>>(page, 'roster')
      const hit = new Set(items.filter((it) => Number(it.pairingId) === PAIRING_ID).map((it) => String(it.crewId)))
      return CREW_IDS.every((c) => hit.has(c))
    }, { timeout: 120_000, intervals: [1_000] })
    .toBe(true)

  await page.screenshot({ path: `${SHOT_DIR}/case3-roster-4-pilots-Ver1.png` })

  const assertRecoveryMethods = async (dialog: import('@playwright/test').Locator) => {
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByTestId('recovery-plan-filter-roster')).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByTestId('recovery-plan-filter-standby')).toBeVisible()
    await expect(dialog.getByTestId('recovery-plan-filter-cross-base')).toBeVisible()
    await expect(dialog).toContainText('8004')
  }
  const closeDialog = async (dialog: import('@playwright/test').Locator) => {
    await dialog.getByRole('button', { name: 'Close' }).first().click({ force: true })
    await expect(dialog).not.toBeVisible({ timeout: 15_000 })
  }

  // ── Entry 1: Alert Center ──────────────────────────────────────────────
  await page.getByTestId('violations-button').first().click()
  const alertDialog = page.getByTestId('violation-list-dialog')
  await expect(alertDialog).toBeVisible({ timeout: 30_000 })
  const checkbox = alertDialog.getByTestId(`alert-recovery-checkbox-${SOURCE_CREW}-${PAIRING_ID}`)
  await expect(checkbox).toBeVisible({ timeout: 60_000 })
  await expect(checkbox).toBeEnabled()
  const row = alertDialog.locator(`[data-testid="violation-list-row"][data-crew-id="${SOURCE_CREW}"][data-rule-code="8004"]`).first()
  await expect(row).toHaveAttribute('data-recoverable', 'true')
  await checkbox.check()
  await page.getByTestId('alert-recovery-selected').click()
  const recovery1 = page.getByTestId('recovery-violation-dialog')
  await assertRecoveryMethods(recovery1)
  await page.screenshot({ path: `${SHOT_DIR}/case3-entry1-alert-center-Ver1.png` })
  await closeDialog(recovery1)

  // ── Entry 2: Pairing pane right-click ──────────────────────────────────
  await page.evaluate((id) => {
    (window as unknown as { __ganttTest: { openLivePairingContextMenu: (p: number) => void } }).__ganttTest.openLivePairingContextMenu(id)
  }, PAIRING_ID)
  const pairingRecovery = page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first()
  await expect(pairingRecovery).toBeVisible({ timeout: 15_000 })
  await pairingRecovery.click({ force: true })
  const recovery2 = page.getByTestId('recovery-violation-dialog')
  await assertRecoveryMethods(recovery2)
  await page.screenshot({ path: `${SHOT_DIR}/case3-entry2-pairing-pane-Ver1.png` })
  await closeDialog(recovery2)

  // ── Entry 3: Roster pane right-click ───────────────────────────────────
  await page.evaluate(({ crewId, pairingId }) => {
    (window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
  }, { crewId: SOURCE_CREW, pairingId: PAIRING_ID })
  const rosterRecovery = page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first()
  await expect(rosterRecovery).toBeVisible({ timeout: 15_000 })
  await rosterRecovery.click({ force: true })
  const recovery3 = page.getByTestId('recovery-violation-dialog')
  await assertRecoveryMethods(recovery3)
  await page.screenshot({ path: `${SHOT_DIR}/case3-entry3-roster-pane-Ver1.png` })
})
