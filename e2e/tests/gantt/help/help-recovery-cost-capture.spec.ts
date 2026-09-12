import { test, expect, type Locator } from '@playwright/test'
import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginToGantt } from './help-login'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
test.use({ storageState: { cookies: [], origins: [] } })
test('Recovery Cost Library — real catalogue, GH, standby, delay and membership snapshots', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 1000 })
  await loginToGantt(page, BASE)
  await page.getByTestId('module-nav-live').click()
  await page.getByTestId('module-nav-legality').click()
  await page.getByRole('button', { name: 'Cost Templates', exact: true }).click()
  const library = page.getByTestId('cost-library-view')
  await expect(library).toBeVisible()
  const shot = async (locator: Locator, name: string) => {
    const dir = path.join(ROOT, 'docs/assets/screenshots/gantt')
    mkdirSync(dir, { recursive: true })
    let version = 1
    while (existsSync(path.join(dir, `${name}-Ver${version}.png`))) version++
    const file = path.join(dir, `${name}-Ver${version}.png`)
    await locator.screenshot({ path: file })
    const publicDir = path.join(ROOT, 'gantt/public/help/screenshots')
    mkdirSync(publicDir, { recursive: true })
    copyFileSync(file, path.join(publicDir, `${name}-Ver${version}.png`))
    console.log(`SNAPSHOT ${name}-Ver${version}.png`)
  }
  const row = (code: string) => library.locator('article[data-testid^="cost-row-"]').filter({ hasText: `${code}/001` })
  await expect(row('1002')).toContainText('Pay above guaranteed hours')
  await expect(row('1003')).toContainText('Airport standby credit')
  await expect(row('3001')).toContainText('Incremental flight delay')
  await shot(library, 'recovery-cost-catalogue')
  for (const [code, name] of [['1002', 'recovery-cost-guarantee'], ['1003', 'recovery-cost-standby']] as const) {
    const entry = row(code)
    await entry.getByRole('button', { name: 'Expand cost', exact: true }).click()
    const workbench = entry.locator('[data-testid^="cost-workbench-"]')
    await expect(workbench).toBeVisible()
    // Run the real read-only calculator using the template's displayed default example.
    await workbench.getByRole('button', { name: 'Compare costs', exact: true }).click()
    const result = entry.locator('[data-testid^="cost-result-"]')
    await expect(result).toContainText('$712.50', { timeout: 15_000 })
    await expect(result).toContainText('$0.00')
    if (code === '1003') await expect(result).toContainText('01:00')
    await page.setViewportSize({ width: 1280, height: 1600 })
    await shot(workbench, name)
    await page.setViewportSize({ width: 1280, height: 1000 })
    await entry.getByRole('button', { name: 'Collapse cost', exact: true }).click()
  }
  const delay = row('3001')
  await delay.getByRole('button', { name: 'Expand cost', exact: true }).click()
  const bench = delay.locator('[data-testid^="cost-workbench-"]')
  await bench.getByLabel('Delay before (minutes)', { exact: true }).fill('120')
  await bench.getByLabel('Delay after (minutes)', { exact: true }).fill('140')
  await bench.getByRole('button', { name: 'Calculate', exact: true }).click()
  await expect(delay.locator('[data-testid^="cost-result-"]')).toContainText('$500.00')
  await shot(bench, 'recovery-cost-delay')
  await page.getByRole('button', { name: 'Cost Sets', exact: true }).click()
  await expect(library.getByRole('button', { name: 'Manage cost membership', exact: true })).toBeVisible()
  await library.getByRole('button', { name: 'Manage cost membership', exact: true }).click()
  const membership = page.getByTestId('cost-dialog')
  await expect(membership).toContainText('Manage cost membership')
  await expect(membership.getByRole('combobox', { name: 'Revision 1002/001', exact: true })).toBeVisible()
  await shot(membership, 'recovery-cost-membership')
  await membership.getByRole('button', { name: 'Cancel', exact: true }).click()
})
