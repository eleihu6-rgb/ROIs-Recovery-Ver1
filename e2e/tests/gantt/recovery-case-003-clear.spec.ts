/**
 * Case 3 — Rule 8004 crew-fleet mismatch: the 8004 is FULLY CLEARED.
 *
 * Closes the last Case-3 gap. Earlier sessions proved the Recovery UI + library cost,
 * but a 788-only replacement (L3003) keeps the 8004 (soft fleet constraint). This spec
 * drives the real Live UI to replace each of the four 788-qualified crew on pairing
 * 152227 with a 7M8-qualified ADD crew, Apply → Save each, and asserts the Alert Center
 * row count for rule 8004 drops 4 → 3 → 2 → 1 → 0 with no new 8004 on the incoming crew.
 *
 * Writes to the shared SIT schema (f8_sit_live). Re-run `.local/case3/reset-152227.cjs`
 * afterwards to restore the prepared baseline (L3001/L3002 CA + L3006/L3007 FO).
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const CREW_IDS = ['L3001', 'L3002', 'L3003', 'L3004', 'L3005', 'L3006', 'L3007', 'L3008', 'L3009', 'L3010']
const PAIRING_ID = 152227

/** Source (788-qualified) → target (7M8-qualified ADD) transfer, in Apply order. */
const REPLACEMENTS: ReadonlyArray<{ source: string; target: string; seat: 'CA' | 'FO' }> = [
  { source: 'L3001', target: 'J4003', seat: 'CA' },
  { source: 'L3002', target: 'J4005', seat: 'CA' },
  { source: 'L3006', target: 'J4024', seat: 'FO' },
  { source: 'L3007', target: 'J4025', seat: 'FO' },
]

/** Open the Live load with the Case-3 crew window (same deterministic load as the cost spec). */
const loadCase3Window = async (page: Page): Promise<void> => {
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
}

/**
 * Read the rule-8004 rows the planner sees in the Alert Center (crew ids), then close it.
 * The Alert Center is built from the LOADED roster items (not the crew display filter),
 * so a new 8004 on an incoming crew would surface here too.
 */
const alertCenter8004Crews = async (page: Page): Promise<string[]> => {
  await page.getByTestId('violations-button').click()
  const dlg = page.getByTestId('violation-list-dialog')
  await expect(dlg).toBeVisible({ timeout: 15_000 })
  await expect(dlg.getByTestId('violation-list-table').or(dlg.getByTestId('violation-list-empty'))).toBeVisible({ timeout: 15_000 })
  const crews = await dlg.locator('[data-rule-code="8004"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-crew-id') ?? ''))
  await page.keyboard.press('Escape')
  await expect(dlg).not.toBeVisible({ timeout: 10_000 })
  return crews
}

/** Commit the current draft (handles the rule-confirm gate) and wait for it to drain. */
const saveDraft = async (page: Page): Promise<void> => {
  const saveBtn = page.getByTestId('draft-save-btn')
  await expect(saveBtn).toBeEnabled({ timeout: 30_000 })
  const commit = page.waitForResponse((r) => r.url().includes('/api/draft/commit'), { timeout: 90_000 })
  await saveBtn.click()
  // The draft save can gate on a rule-confirm dialog; proceed if it appears.
  const confirm = page.getByTestId('rule-confirm-proceed')
  if (await confirm.isVisible({ timeout: 4_000 }).catch(() => false)) await confirm.click()
  await commit
  await expect.poll(async () => (await readHook<unknown[]>(page, 'draftOps')).length, { timeout: 60_000, intervals: [1_000] }).toBe(0)
}

/** Open Recovery for one Roster item and apply a single named transfer target. */
const applyTransfer = async (page: Page, source: string, target: string, shot?: string): Promise<void> => {
  await page.evaluate(({ crewId, pairingId }) => {
    ;(window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
  }, { crewId: source, pairingId: PAIRING_ID })
  await page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first().click({ force: true })
  const dlg = page.getByTestId('recovery-violation-dialog')
  await expect(dlg).toBeVisible({ timeout: 60_000 })
  const rosterGroup = dlg.getByTestId('recovery-options-roster')
  await dlg.getByTestId('recovery-plan-filter-roster').click()
  await expect(rosterGroup).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(async () => rosterGroup.getByText('Checking', { exact: true }).count(), { timeout: 180_000, intervals: [1_000] })
    .toBe(0)
  await dlg.getByTestId('recovery-options-filter-roster-executable').click()

  // Disambiguate the transfer row from the swap row — both render a checkbox test-id
  // carrying the target crew id, but only the transfer reassigns the affected pairing.
  const row = rosterGroup.locator('div.border-l-2').filter({ hasText: `Transfer to ${target}` })
  await expect(row).toBeVisible({ timeout: 120_000 })
  // Regression guard: the 7M8-qualified target must NOT carry the soft fleet warning
  // that L3003/L3004/L3005 do — that warning is exactly why a 788 target cannot clear.
  await expect(row).not.toContainText('Fleet mismatch')
  if (shot) await page.screenshot({ path: shot })
  await row.getByTestId(`recovery-crew-checkbox-${target}`).check()

  const applyBtn = dlg.getByTestId('recovery-apply')
  await expect(applyBtn).toBeEnabled({ timeout: 15_000 })
  await applyBtn.click()
  await expect(dlg).not.toBeVisible({ timeout: 60_000 })
}

test('Case 3 — 7M8-qualified Roster transfers fully clear the Rule 8004 fleet mismatch', async ({ page, request }) => {
  test.setTimeout(900_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await loadCase3Window(page)

  // Baseline: four 788-qualified crew on the 7M8 pairing.
  const baseline = await alertCenter8004Crews(page)
  console.log('Case 3 baseline 8004 crews:', JSON.stringify(baseline))
  expect(baseline.sort()).toEqual(['L3001', 'L3002', 'L3006', 'L3007'].sort())
  // Visual receipt: group the Alert Center by Rule and open the 8004 group (4 rows).
  await page.getByTestId('violations-button').click()
  const baseDlg = page.getByTestId('violation-list-dialog')
  await expect(baseDlg).toBeVisible({ timeout: 15_000 })
  await baseDlg.getByTestId('alert-groupby-rule').click()
  const baseGroup = baseDlg.getByTestId('alert-group-item').filter({ hasText: /^8004/ })
  await expect(baseGroup).toHaveCount(1, { timeout: 10_000 })
  await baseGroup.click()
  await expect(baseDlg.locator('[data-rule-code="8004"]')).toHaveCount(4, { timeout: 10_000 })
  await page.screenshot({ path: `${SHOT_DIR}/case3-clear-baseline-alert-center-Ver1.png` })
  await page.keyboard.press('Escape')
  await expect(baseDlg).not.toBeVisible({ timeout: 10_000 })

  const remaining = [...baseline]
  for (const [index, step] of REPLACEMENTS.entries()) {
    console.log(`Case 3 step ${index + 1}: transfer ${step.source} (788) → ${step.target} (7M8, ${step.seat})`)
    await applyTransfer(
      page,
      step.source,
      step.target,
      index === 0 ? `${SHOT_DIR}/case3-clear-option-7m8-Ver2.png` : undefined,
    )
    await saveDraft(page)

    // The server recheck is async and the client refetches on the WS violations.updated event.
    const crewIndex = remaining.indexOf(step.source)
    const next = remaining.filter((crew) => crew !== step.source)
    await expect
      .poll(async () => (await alertCenter8004Crews(page)).sort(), { timeout: 120_000, intervals: [2_000] })
      .toEqual([...next].sort())
    if (crewIndex >= 0) remaining.splice(crewIndex, 1)
    console.log(`Case 3 after step ${index + 1}: remaining 8004 crews = ${JSON.stringify(remaining)}`)
  }

  expect(remaining).toEqual([])

  // Final read-only proof: the Alert Center shows no 8004 row and no 8004 group at all.
  await page.getByTestId('violations-button').click()
  const finalDlg = page.getByTestId('violation-list-dialog')
  await expect(finalDlg).toBeVisible({ timeout: 15_000 })
  await finalDlg.getByTestId('alert-groupby-rule').click()
  await expect(finalDlg.getByTestId('alert-group-item').filter({ hasText: /^8004/ })).toHaveCount(0, { timeout: 10_000 })
  await expect(finalDlg.locator('[data-rule-code="8004"]')).toHaveCount(0)
  await page.screenshot({ path: `${SHOT_DIR}/case3-clear-final-alert-center-Ver1.png` })
  await page.keyboard.press('Escape')

  // The final pairing crew is the four 7M8-qualified replacements.
  const finalPairingCrew = await readHook<Array<Record<string, unknown>>>(page, 'roster')
    .then((rows) => [...new Set(rows.filter((r) => Number(r.pairingId) === PAIRING_ID).map((r) => String(r.crewId)))].sort())
  console.log('Case 3 final pairing 152227 crew:', JSON.stringify(finalPairingCrew))
  expect(finalPairingCrew).toEqual(['J4003', 'J4005', 'J4024', 'J4025'])

  // Visual receipt: scroll the roster to the incoming crew's new 152227 duty.
  const incomingItem = await readHook<Array<Record<string, unknown>>>(page, 'roster')
    .then((rows) => rows.find((r) => String(r.crewId) === 'J4003' && Number(r.pairingId) === PAIRING_ID))
  expect(incomingItem, 'J4003 should hold pairing 152227 after the clearing transfer').toBeTruthy()
  await page.evaluate((id) => {
    ;(window as unknown as { __ganttTest: { focusRosterItem: (id: number) => unknown } }).__ganttTest.focusRosterItem(id)
  }, Number(incomingItem!.id))
  await page.waitForTimeout(2_500)
  await page.screenshot({ path: `${SHOT_DIR}/case3-clear-final-roster-Ver1.png`, fullPage: false })
})
