// Real headed S1 fixture check. Applies drafts and undoes them; never clicks Save.
// Requires authenticated Live with prepared J4002 overlap and six swap candidates.
const { chromium, expect } = require('@playwright/test')
const fs = require('fs'), path = require('path')
const candidates = [
  ['J4005', '15:15', '22:35', 'US$0.00'],
  ['J4014', '17:25', '24:15', 'US$0.00'],
  ['J4015', '17:35', '24:25', 'US$0.00'],
  ['J4018', '78:30', '86:05', 'US$130.00'],
  ['J4016', '80:40', '88:00', 'US$360.00'],
  ['J4017', '81:20', '88:55', 'US$470.00'],
]
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.S1_CDP_URL || 'http://localhost:9227', { slowMo: 250 })
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('/altair/live'))
  if (!page) throw Error('Authenticated Live tab required')
  await page.bringToFront()
  const draftCount = () => page.evaluate(() => window.__ganttTest.draftState().opCount)
  const shot = async name => {
    const dir = 'docs/assets/screenshots/crew-recovery'
    let v = 1
    while (fs.existsSync(path.join(dir, `${name}-Ver${v}.png`))) v++
    await page.waitForTimeout(1500)
    const file = path.join(dir, `${name}-Ver${v}.png`)
    await page.screenshot({ path: file })
    console.log('SNAPSHOT', file)
  }
  const open = async () => {
    if (!await page.getByTestId('recovery-violation-dialog').count()) {
      await page.getByTestId('violations-button').click()
      await page.locator('[data-crew-id="J4002"][data-recoverable="true"] input').check()
      await page.getByTestId('alert-recovery-selected').click()
    }
    await page.getByTestId('recovery-plan-filter-swap-duty').click()
  }
  expect(await draftCount()).toBe(0)
  await open()
  const dialog = page.getByTestId('recovery-violation-dialog')
  for (const [id, before, after, cost] of candidates) {
    await expect(page.getByTestId(`recovery-crew-checkbox-${id}`)).toBeEnabled({ timeout: 120000 })
    await expect(page.getByTestId(`recovery-swap-gh-${id}`)).toContainText(`before ${before} → after ${after}`, { timeout: 30000 })
    await expect(dialog).toContainText(cost)
  }
  await expect(dialog).not.toContainText('Fleet mismatch')
  await expect(dialog).toContainText('6 available · 0 filtered')
  await shot('s1-swap-gh-six-selectable')
  for (const [id, before, after, cost] of candidates) {
    await open()
    await expect(page.getByTestId(`recovery-crew-checkbox-${id}`)).toBeEnabled({ timeout: 120000 })
    await page.getByTestId(`recovery-crew-checkbox-${id}`).check()
    await expect(page.getByTestId('recovery-apply')).toBeEnabled()
    await page.locator(`[data-testid^="recovery-cost-button-swap-duty-152056-${id}-"]:visible`).click()
    const breakdown = page.getByRole('dialog', { name: `Cost breakdown - Swap duty with ${id}`, exact: true })
    await expect(breakdown).toContainText(cost)
    await expect(breakdown).toContainText(`Crew ${id} — incremental GH pay`)
    await expect(breakdown).toContainText('Crew J4002 — incremental GH pay')
    await expect(breakdown).toContainText(`before ${before} → after ${after}`)
    await expect(breakdown).toContainText('excludes roster-change fees')
    await shot(`s1-swap-gh-${id}-cost`)
    await breakdown.getByRole('button', { name: 'Close', exact: true }).click()
    await page.locator(`[data-testid^="recovery-preview-swap-duty-152056-${id}-"]`).click()
    await expect(page.getByTestId('recovery-return-to-options')).toBeVisible()
    await shot(`s1-swap-gh-${id}-preview`)
    await page.getByTestId('recovery-return-to-options').click()
    await page.getByTestId('recovery-apply').click()
    await expect.poll(draftCount, { timeout: 30000 }).toBe(4)
    await shot(`s1-swap-gh-${id}-draft`)
    for (let n = 0; n < 4 && await draftCount() > 0; n++) await page.getByTestId('draft-undo-btn').click()
    await expect.poll(draftCount).toBe(0)
    console.log('PASS', id, cost, 'both-crew cost, preview, Apply 4 draft ops, Undo; no Save')
  }
  await open()
  await expect(dialog).toContainText('6 available · 0 filtered', { timeout: 120000 })
  expect(await draftCount()).toBe(0)
  await shot('s1-swap-gh-restored')
  await browser.close()
})().catch(error => { console.error(error); process.exitCode = 1 })
