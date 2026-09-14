import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { loginToGantt } from './help/help-login'

test.use({ storageState: { cookies: [], origins: [] } })

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const base = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

test('Help Case 4 documents open-pairing build and staffing workflow', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await loginToGantt(page, base)

  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('live-nav-roster')).toBeVisible()
  await page.getByTestId('nav-help').click()
  await expect(page.getByTestId('help-view')).toBeVisible()

  const topic = page.getByTestId('help-topic-recovery-case-004')
  await expect(topic).toBeVisible()
  const search = page.getByPlaceholder('Search topics…')
  await search.fill('open pairing')
  await expect(topic).toBeVisible()
  await topic.click()

  const article = page.getByRole('article')
  await expect(article).toBeVisible()
  await expect(article.locator('h1')).toContainText('Case study 4')
  for (const text of [
    'Ad hoc new flight', 'Shift Handover', 'Open in Live', 'Pairing Options', 'Search Pairing Options', 'Build pairing (Save)', 'immediate save',
    'By cost tier', 'cheapest priced executable candidate', 'keeps its full candidate list', 'seven executable candidates', 'recomputed calendar-month credit', 'not already-flown hours', 'same option table as Cases 1–3', 'Executable', 'Filtered', 'Detail', 'Recovery — open seats', 'Open rank', 'Solutions are detected automatically', 'Standby Crew', 'Available Crew',
    'independent time scale per duty', 'search limit', 'Move-up / Roster Transfer', 'Preview', 'Apply', 'Save', 'Cost breakdown', 'Unpriced', 'Partial',
  ]) await expect(article).toContainText(text)
  await expect(article).toContainText('Standby is a common approach across Cases 1–4')
  await expect(article).toContainText('donor vacancy remains')
  await expect(article).not.toContainText('Find roster options')

  const directory = path.join(repoRoot, 'docs/assets/screenshots/crew-recovery')
  let version = 1
  while (fs.existsSync(path.join(directory, `case4-help-Ver${version}.png`))) version++
  const screenshot = path.join(directory, `case4-help-Ver${version}.png`)
  for (const image of await article.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 200)).toBe(true)
  }
  await article.locator('h1').scrollIntoViewIfNeeded()
  await page.screenshot({ path: screenshot, animations: 'disabled' })
  expect(await article.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy()
})
