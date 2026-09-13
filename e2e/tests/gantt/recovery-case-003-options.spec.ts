/**
 * Case 3 — Rule 8004 crew-fleet mismatch: option-level Recovery verification.
 *
 * Continues recovery-case-003.spec.ts (entry points) and drives one option
 * through the full boundary chain on the same fixture (pairing 152227, 4 crew):
 *   Executable listing -> cost breakdown -> Preview -> Apply (draft) -> Save.
 *
 * The fixture crew pool (L3001–L3010, ADD/788) is loaded so the roster-transfer
 * candidate search has free same-rank/same-base candidates to offer.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook, rosterObjects } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const CREW_IDS = ['L3001', 'L3002', 'L3003', 'L3004', 'L3005', 'L3006', 'L3007', 'L3008', 'L3009', 'L3010']
const PAIRING_ID = 152227
const SOURCE_CREW = 'L3001'

test('Case 3 — 8004 fleet mismatch: Executable list, cost breakdown, Preview, Apply draft and Save', async ({ page, request }) => {
  test.setTimeout(900_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // ── Load Live with the whole case-3 crew pool ──────────────────────────
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 10_000 })
  await emptyState.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByTestId('filter-crew-id').fill(CREW_IDS.join(','))
  await page.getByTestId('filter-crew-id').press('Enter')
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 300_000 })
  await expect
    .poll(async () => (await readHook<Array<{ crewId: string }>>(page, 'crewSeniority')).length, { timeout: 120_000, intervals: [1_000] })
    .toBeGreaterThan(0)

  // ── Open Recovery for the 8004 alert ───────────────────────────────────
  await page.evaluate(({ crewId, pairingId }) => {
    (window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
  }, { crewId: SOURCE_CREW, pairingId: PAIRING_ID })
  await page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first().click({ force: true })
  const dlg = page.getByTestId('recovery-violation-dialog')
  await expect(dlg).toBeVisible({ timeout: 60_000 })

  // ── Executable / Filtered listing ──────────────────────────────────────
  const rosterGroup = dlg.getByTestId('recovery-options-roster')
  await dlg.getByTestId('recovery-plan-filter-roster').click()
  await expect(rosterGroup).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(async () => rosterGroup.getByText('Checking', { exact: true }).count(), { timeout: 180_000, intervals: [1_000] })
    .toBe(0)
  await dlg.getByTestId('recovery-options-filter-roster-executable').click()
  await expect(dlg.getByTestId('recovery-options-filter-roster-executable')).toHaveAttribute('aria-selected', 'true')
  const execRows = rosterGroup.locator('div.border-l-2')
  await expect.poll(async () => execRows.count(), { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0)
  await expect(rosterGroup.getByText('Executable', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOT_DIR}/case3-options-executable-Ver1.png` })
  // Filtered tab must be reachable and render its own empty/list state.
  await dlg.getByTestId('recovery-options-filter-roster-filtered').click()
  await expect(dlg.getByTestId('recovery-options-filter-roster-filtered')).toHaveAttribute('aria-selected', 'true')
  await dlg.getByTestId('recovery-options-filter-roster-executable').click()

  // ── Cost breakdown (P0-1 dialog) ───────────────────────────────────────
  // Each option renders the cost twice (mobile grid + sm grid); only one is visible.
  const costBtn = rosterGroup.locator('[data-testid^="recovery-cost-button-"]:visible').first()
  await expect(costBtn).toBeVisible({ timeout: 15_000 })
  await costBtn.click()
  const costDialog = page.getByTestId('recovery-option-cost-dialog')
  await expect(costDialog).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('recovery-option-cost-body')).toBeVisible()
  // ADD-transfer pricing has no cost-library entry in this fixture, so the honest
  // state is "Unpriced"; assert the dialog reports a price or the Unpriced state.
  await expect(costDialog).toContainText(/Unpriced|\d/)
  await page.screenshot({ path: `${SHOT_DIR}/case3-options-cost-breakdown-Ver1.png` })
  await page.keyboard.press('Escape')
  await expect(costDialog).not.toBeVisible({ timeout: 10_000 })

  // ── Preview (in-memory, not saved) ─────────────────────────────────────
  const previewBtn = rosterGroup.locator('[data-testid^="recovery-preview-"]:visible').first()
  await previewBtn.click()
  const returnBtn = dlg.getByTestId('recovery-expand-options')
  await expect(returnBtn).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${SHOT_DIR}/case3-options-preview-Ver1.png` })
  await returnBtn.click()
  await expect(rosterGroup).toBeVisible({ timeout: 15_000 })

  // ── Apply (draft only) ─────────────────────────────────────────────────
  const firstRow = execRows.first()
  const checkbox = firstRow.locator('input[type="checkbox"]')
  await expect(checkbox).toBeEnabled()
  await checkbox.check()
  await expect(dlg.getByTestId('recovery-apply')).toBeEnabled()
  const targetCrewId = await firstRow.locator('[data-testid^="recovery-crew-checkbox-"]').getAttribute('data-testid')
  const target = (targetCrewId ?? '').replace('recovery-crew-checkbox-', '')
  expect(target).not.toBe('')

  const beforeItems = await rosterObjects(page)
  expect(beforeItems.some((i) => String(i.crewId) === SOURCE_CREW && Number(i.pairingId) === PAIRING_ID)).toBe(true)
  expect(beforeItems.some((i) => String(i.crewId) === target && Number(i.pairingId) === PAIRING_ID)).toBe(false)

  await dlg.getByTestId('recovery-apply').click()
  await expect(dlg).not.toBeVisible({ timeout: 60_000 })
  const draftOps = await readHook<Array<Record<string, unknown>>>(page, 'draftOps')
  expect(draftOps.length, 'Apply must create draft operations').toBeGreaterThan(0)
  await expect(page.getByTestId('draft-save-btn')).toBeEnabled({ timeout: 30_000 })

  const afterItems = await rosterObjects(page)
  expect(afterItems.some((i) => String(i.crewId) === target && Number(i.pairingId) === PAIRING_ID), `target ${target} should hold the Pairing in the draft`).toBe(true)
  expect(afterItems.some((i) => String(i.crewId) === SOURCE_CREW && Number(i.pairingId) === PAIRING_ID), 'source crew should be released in the draft').toBe(false)
  await page.screenshot({ path: `${SHOT_DIR}/case3-options-applied-draft-Ver1.png` })

  // ── Save (commit draft) ────────────────────────────────────────────────
  await page.getByTestId('draft-save-btn').click()
  await expect
    .poll(async () => (await readHook<Array<Record<string, unknown>>>(page, 'draftOps')).length, { timeout: 120_000, intervals: [1_000] })
    .toBe(0)
  await page.screenshot({ path: `${SHOT_DIR}/case3-options-saved-Ver1.png` })
})
