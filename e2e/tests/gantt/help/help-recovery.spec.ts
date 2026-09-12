import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { loginToGantt } from './help-login'

test.use({ storageState: { cookies: [], origins: [] } })

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/gantt')

const openTopic = async (page: Page, slug: string): Promise<Locator> => {
  await page.getByTestId(`help-topic-${slug}`).click()
  const article = page.getByRole('article')
  await expect(article).toBeVisible({ timeout: 5_000 })
  const images = article.locator('img')
  const imageCount = slug === 'recovery-cost-library' ? 5 : ['recovery-103', 'recovery-104'].includes(slug) ? 1 : 0
  await expect(images).toHaveCount(imageCount)
  if (imageCount) {
    for (const img of await images.all()) {
      await img.scrollIntoViewIfNeeded()
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth >= 200)).toBeTruthy()
    }
    await article.locator('h1').scrollIntoViewIfNeeded()
  }
  await captureArticlePages(page, article, slug)
  expect(
    await article.evaluate((element) => element.scrollWidth <= element.clientWidth),
    `${slug} article must not overflow horizontally`,
  ).toBeTruthy()
  return article
}

const captureVersioned = async (page: Page, name = '102-104'): Promise<string> => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const requested = Number.parseInt(process.env.RECOVERY_HELP_SCREENSHOT_VERSION ?? '1', 10)
  let version = Number.isFinite(requested) && requested > 0 ? requested : 1
  let target: string
  do {
    target = path.join(SCREENSHOT_DIR, `recovery-help-${name}-Ver${version++}.png`)
  } while (existsSync(target))
  await page.getByTestId('help-view').screenshot({ path: target })
  return target
}

const captureArticlePages = async (page: Page, article: Locator, slug: string) => {
  const scroll = article.locator('..')
  const metrics = await scroll.evaluate(el => ({ total: el.scrollHeight, height: el.clientHeight }))
  for (let offset = 0, part = 1; offset < metrics.total; offset += metrics.height - 80, part++) {
    await scroll.evaluate((el, y) => { el.scrollTop = y }, offset)
    await page.waitForTimeout(100)
    await captureVersioned(page, `${slug}-page-${part}`)
    if (offset + metrics.height >= metrics.total) break
  }
  await article.locator('h1').scrollIntoViewIfNeeded()
}

test.describe('Recovery Help — cases 102–104', () => {
  test('Help-Recovery-102-104 — workflow, content, search and responsive article', async ({ page }) => {
    test.setTimeout(120_000)
    const requestedImages: string[] = []
    page.on('request', request => { if (request.url().includes('/help/screenshots/recovery-')) requestedImages.push(request.url()) })
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginToGantt(page, BASE)

    // Enter Help from the real Live workspace rather than navigating directly.
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('live-nav-roster')).toBeVisible()
    await page.getByTestId('nav-help').click()
    await expect(page.getByTestId('help-view')).toBeVisible({ timeout: 5_000 })

    const categories = await page.locator('[data-testid^="help-cat-"]').evaluateAll((buttons) =>
      buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
    )
    const liveIndex = categories.indexOf('Live')
    expect(liveIndex).toBeGreaterThanOrEqual(0)
    expect(categories.slice(liveIndex, liveIndex + 3)).toEqual(['Live', 'Recovery', 'Scenario'])

    expect(requestedImages).toEqual([])
    const recoveryTopics = await page.locator('[data-testid^="help-topic-recovery-"]').evaluateAll(els => els.map(el => el.getAttribute('data-testid')))
    expect(recoveryTopics).toEqual(['recovery-overview', 'recovery-cost-library', 'recovery-102', 'recovery-103', 'recovery-104', 'recovery-costs', 'recovery-case-001'].map(slug => `help-topic-${slug}`))

    let article = await openTopic(page, 'recovery-overview')
    await expect(article).toContainText('Apply selected option')
    await expect(article).toContainText('unsaved draft')
    await expect(article).toContainText('use Save (Ctrl+S) to commit')
    await expect(article).toContainText('Apply success alone does not prove recovery is complete')
    await captureVersioned(page, 'overview')

    article = await openTopic(page, 'recovery-cost-library')
    await expect(article.getByTestId('help-cost-type-table').locator('tbody tr')).toHaveCount(19)
    for (const text of ['Quantity:', 'Fixed:', 'Minimum:', 'Guaranteed pay:', 'Standby credit =', 'Delay bands:', 'Booking:', 'USD 712.50', 'USD 1,950', 'pins a specific revision']) await expect(article).toContainText(text)

    article = await openTopic(page, 'recovery-102')
    await expect(article).toContainText('The selected SBY task is retained')
    await expect(article).toContainText('marks the retained SBY as a callout')
    await expect(article).toContainText('An unsaved preview or draft is not the completed roster')
    await captureVersioned(page, '102')

    article = await openTopic(page, 'recovery-103')
    await expect(article).toContainText('exchanges complete pairings')
    await expect(article).toContainText('two removals and two assignments')
    await expect(article).toContainText('not just one leg or one duty within a multi-duty pairing')
    await captureVersioned(page, '103')

    article = await openTopic(page, 'recovery-104')
    await expect(article).toContainText('plus 61 minutes')
    await expect(article).toContainText('no crew checkbox')
    await expect(article).toContainText('Partial — Flight Delay')
    await expect(article).toContainText('does not run the standby/swap rule preview')
    await captureVersioned(page, '104')

    article = await openTopic(page, 'recovery-costs')
    await expect(article).toContainText('unpriced')
    await expect(article).toContainText('unknown costs, not free services')
    await expect(article).toContainText('Mixed currencies are shown separately')
    await expect(article).toContainText('does not select a planner’s Cost Set')

    const search = page.getByPlaceholder('Search topics…')
    for (const [query, topic] of [
      ['102', 'recovery-102'],
      ['103', 'recovery-103'],
      ['104', 'recovery-104'],
      ['currency', 'recovery-costs'],
    ] as const) {
      await search.fill(query)
      await expect(page.getByTestId(`help-topic-${topic}`)).toBeVisible()
    }
    await search.fill('')

    const screenshot = await captureVersioned(page)
    expect(existsSync(screenshot)).toBeTruthy()
  })
})
