/**
 * Case 3 — Rule 8004 crew-fleet mismatch: READ-ONLY cost re-verification.
 *
 * Opens Recovery on the prepared fixture (pairing 152227, source L3001) and reads
 * the Roster transfer / exchange option costs straight from the real UI after the
 * cost library was re-seeded (types 1015/1016 installed). No Apply / Save / draft
 * operations, so the prepared incident baseline is left untouched.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../../docs/assets/screenshots/crew-recovery')
const CREW_IDS = ['L3001', 'L3002', 'L3003', 'L3004', 'L3005', 'L3006', 'L3007', 'L3008', 'L3009', 'L3010']
const PAIRING_ID = 152227
const SOURCE_CREW = 'L3001'

test('Case 3 — 8004 fleet mismatch: Roster transfer option costs are library-priced (read-only)', async ({ page, request }) => {
  test.setTimeout(900_000)
  page.on('response', async (res) => {
    if (!res.url().includes('calculate-cost')) return
    try {
      console.log('COST REQ', res.request().postData()?.slice(0, 600))
      console.log('COST RES', res.status(), (await res.text()).slice(0, 1200))
    } catch { /* body already consumed */ }
  })
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

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

  await page.evaluate(({ crewId, pairingId }) => {
    (window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
  }, { crewId: SOURCE_CREW, pairingId: PAIRING_ID })
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
  await expect(dlg.getByTestId('recovery-options-filter-roster-executable')).toHaveAttribute('aria-selected', 'true')

  const rows = rosterGroup.locator('div.border-l-2')
  await expect.poll(async () => rows.count(), { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0)

  const count = await rows.count()
  const quotes: Array<{ crew: string; method: string; cost: string }> = []
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i)
    const crewId = (await row.locator('[data-testid^="recovery-crew-checkbox-"]').getAttribute('data-testid') ?? '').replace('recovery-crew-checkbox-', '')
    const cost = (await row.locator('[data-testid^="recovery-cost-button-"]:visible').first().innerText()).trim()
    const text = await row.innerText()
    const method = /Transfer to/.test(text) ? 'transfer' : /Swap with/.test(text) ? 'swap' : /Callout/.test(text) ? 'standby' : /Cross-base|Destination|Direct/.test(text) ? 'cross-base' : 'other'
    quotes.push({ crew: crewId, method, cost })
  }
  const transfers = quotes.filter((q) => q.method === 'transfer')
  const otherModes = quotes.filter((q) => q.method !== 'transfer')
  console.log('Case 3 transfer quotes (count, distinct costs):', transfers.length, JSON.stringify([...new Set(transfers.map((q) => q.cost))]))
  console.log('Case 3 non-transfer quotes:', JSON.stringify(otherModes.slice(0, 10)))

  // Every executable roster transfer now prices: configured roster-change
  // components (1009 + 1015) plus the receiving crew's incremental GH pay.
  expect(transfers.length).toBeGreaterThan(1)
  expect(transfers.every((q) => q.cost !== 'Unpriced'), `expected library-priced transfers, got ${JSON.stringify(transfers.slice(0, 8))}`).toBe(true)
  // 150 (1009) + 260 (1015) = USD 410 with no incremental GH pay.
  const underGh = transfers.filter((q) => q.cost === 'US$410.00')
  const overGh = transfers.filter((q) => q.cost !== 'US$410.00')
  console.log('Case 3 under-GH transfers:', underGh.length, 'over-GH transfers:', overGh.length, JSON.stringify([...new Set(overGh.map((q) => q.cost))].slice(0, 6)))
  expect(underGh.length, 'expected candidates whose month stays under GH (no incremental pay)').toBeGreaterThan(0)
  expect(overGh.length, 'expected candidates who cross the GH floor and carry incremental pay').toBeGreaterThan(0)
  await page.screenshot({ path: `${SHOT_DIR}/case3-options-executable-Ver2.png` })

  const costBtn = rosterGroup.locator('[data-testid^="recovery-cost-button-"]:visible').first()
  await costBtn.click()
  const costDialog = page.getByTestId('recovery-option-cost-dialog')
  await expect(costDialog).toBeVisible({ timeout: 15_000 })
  await expect(costDialog).toContainText(/410/)
  await expect(costDialog).toContainText(/incremental GH pay/)
  await page.screenshot({ path: `${SHOT_DIR}/case3-options-cost-breakdown-Ver2.png` })
  console.log('Case 3 cost breakdown:', (await page.getByTestId('recovery-option-cost-body').innerText()).replace(/\n+/g, ' | '))
  await page.keyboard.press('Escape')

  // ── Over-GH breakdown: the receiving crew crosses the guaranteed-hours floor ──
  const overGhRow = rows.filter({ hasText: 'Transfer to' }).filter({ hasNotText: 'US$410.00' }).first()
  if (await overGhRow.count() > 0) {
    const overGhCrew = (await overGhRow.locator('[data-testid^="recovery-crew-checkbox-"]').getAttribute('data-testid') ?? '').replace('recovery-crew-checkbox-', '')
    await overGhRow.locator('[data-testid^="recovery-cost-button-"]:visible').first().click()
    await expect(costDialog).toBeVisible({ timeout: 15_000 })
    const body = await page.getByTestId('recovery-option-cost-body').innerText()
    console.log('Case 3 over-GH breakdown:', body.replace(/\n+/g, ' | '))
    expect(body).toContain('incremental GH pay')
    await page.screenshot({ path: `${SHOT_DIR}/case3-options-cost-breakdown-over-gh-Ver2.png` })
    console.log('Case 3 over-GH example crew:', overGhCrew)
    await page.keyboard.press('Escape')
  }

  // Read-only guarantee: nothing was applied to a draft.
  const draftOps = await readHook<Array<Record<string, unknown>>>(page, 'draftOps')
  expect(draftOps.length, 'read-only cost run must not create draft operations').toBe(0)
})
