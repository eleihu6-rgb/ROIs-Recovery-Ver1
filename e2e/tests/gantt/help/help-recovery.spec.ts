import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { loginToGantt } from './help-login'

test.use({ storageState: { cookies: [], origins: [] } })

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/gantt')

const imageCountFor = (slug: string): number => {
  if (slug === 'recovery-cost-library') return 5
  if (slug === 'recovery-case-001') return 4
  if (slug === 'recovery-case-002') return 5
  if (slug === 'recovery-case-003') return 8
  if (['recovery-102', 'recovery-103', 'recovery-104'].includes(slug)) return 1
  return 0
}

const captureArticlePages = async (page: Page, article: Locator, slug: string): Promise<void> => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await article.screenshot({
    path: path.join(SCREENSHOT_DIR, `help-recovery-${slug}-Ver1.png`),
    animations: 'disabled',
  })
}

const openTopic = async (page: Page, slug: string): Promise<Locator> => {
  await page.getByTestId(`help-topic-${slug}`).click()
  const article = page.getByRole('article')
  await expect(article).toBeVisible({ timeout: 5_000 })

  const images = article.locator('img')
  const imageCount = imageCountFor(slug)
  await expect(images).toHaveCount(imageCount)
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded()
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth >= 200))
      .toBeTruthy()
  }

  await article.locator('h1').scrollIntoViewIfNeeded()
  await captureArticlePages(page, article, slug)
  expect(
    await article.evaluate((element) => element.scrollWidth <= element.clientWidth),
    `${slug} article must not overflow horizontally`,
  ).toBeTruthy()
  return article
}

const captureVersioned = async (page: Page, name = 'cases'): Promise<string> => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const target = path.join(SCREENSHOT_DIR, `help-recovery-${name}-Ver1.png`)
  await page.getByTestId('help-view').screenshot({ path: target, animations: 'disabled' })
  return target
}

test.describe('Recovery Help cases', () => {
  test('Help-Recovery-Cases - workflow, Case 1 and Case 2 progress are documented', async ({ page }) => {
    test.setTimeout(120_000)
    const requestedImages: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/help/screenshots/recovery-')) requestedImages.push(request.url())
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await loginToGantt(page, BASE)

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

    const recoveryTopics = await page
      .locator('[data-testid^="help-topic-recovery-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
    expect(recoveryTopics).toEqual(
      [
        'recovery-overview',
        'recovery-cost-library',
        'recovery-102',
        'recovery-103',
        'recovery-104',
        'recovery-costs',
        'recovery-case-001',
        'recovery-case-002',
        'recovery-case-003',
        'recovery-case-004',
      ].map((slug) => `help-topic-${slug}`),
    )

    let article = await openTopic(page, 'recovery-overview')
    await expect(article).toContainText('Apply selected option')
    await expect(article).toContainText('unsaved draft')
    await expect(article).toContainText('Ctrl+S')
    await expect(article).toContainText('Apply success alone does not prove recovery is complete')

    article = await openTopic(page, 'recovery-cost-library')
    await expect(article.getByTestId('help-cost-type-table').locator('tbody tr')).toHaveCount(19)
    for (const text of ['Quantity:', 'Fixed:', 'Minimum:', 'Guaranteed pay:', 'Standby credit =', 'Delay bands:', 'Booking:']) {
      await expect(article).toContainText(text)
    }

    article = await openTopic(page, 'recovery-102')
    await expect(article).toContainText('Standby Crew callout')
    await expect(article).toContainText('GH comparison')

    article = await openTopic(page, 'recovery-103')
    await expect(article).toContainText('Swap duty')
    await expect(article).toContainText('six ADD candidates')

    article = await openTopic(page, 'recovery-104')
    await expect(article).toContainText('Flight Delay')
    await expect(article).toContainText('proposed ATD')

    article = await openTopic(page, 'recovery-costs')
    await expect(article).toContainText('unknown costs, not free services')
    await expect(article).toContainText('Mixed currencies')
    await expect(article).toContainText('does not select')

    article = await openTopic(page, 'recovery-case-001')
    await expect(article).toContainText('Getnet Kifle')
    await expect(article).toContainText('J4002')
    await expect(article.getByTestId('s1-standby-costs').locator('tbody tr')).toHaveCount(3)
    await expect(article.getByTestId('s1-swap-costs').locator('tbody tr')).toHaveCount(6)

    article = await openTopic(page, 'recovery-case-002')
    await expect(article).toContainText('S2 published flight delay at ADD')
    await expect(article).toContainText('ET2681')
    await expect(article).toContainText('ET2684 JNB to ADD')
    await expect(article).toContainText('Rule 3007')
    await expect(article).toContainText('T2001')
    await expect(article).toContainText('Request FDP agreement')
    await expect(article).toContainText('Request FDP discretion')
    await expect(article).toContainText('Crew rejected')
    await expect(article).toContainText('Recommended next')
    await expect(article).toContainText('never makes an over-limit FDP legal')
    await expect(article).toContainText('1,350.00')
    await expect(article.getByTestId('s2-standby-costs').locator('tbody tr')).toHaveCount(4)
    await expect(article).toContainText('J4021')
    await expect(article).toContainText('Unpriced')
    await expect(article).toContainText('No executable candidates in the current loaded data range')

    article = await openTopic(page, 'recovery-case-003')
    await expect(article).toContainText('Case 3 - aircraft qualification (Rule 8004)')
    await expect(article).toContainText('152227')
    await expect(article).toContainText('Crew fleet (788) is invalid for the pairing (7M8)')
    for (const text of ['Alert Center', 'Pairing pane', 'Roster pane', 'Roster transfer or exchange', 'Standby Crew callout', 'Cross-base positioning', 'US$410.00', 'incremental guaranteed-hours pay', 'Unpriced', 'Fleet matching is mandatory', 'not listed', 'exchange is also dropped', 'both directions to be fleet-valid', 'Preview is not Apply', 'L3001 to J4003', 'L3007 to J4025']) {
      await expect(article).toContainText(text)
    }
    // The article now documents the FULL clearance, not the old "still Partial / 8004 remains" state.
    await expect(article).toContainText('8004/001')
    await expect(article).toContainText('drops')
    await expect(article).toContainText('zero')
    await expect(article).not.toContainText('a fully clearing replacement is not yet demonstrated')

    const search = page.getByPlaceholder('Search topics…')
    for (const [query, topic] of [
      ['102', 'recovery-102'],
      ['103', 'recovery-103'],
      ['104', 'recovery-104'],
      ['currency', 'recovery-costs'],
      ['J4002', 'recovery-case-001'],
      ['S2', 'recovery-case-002'],
      ['ET2681', 'recovery-case-002'],
      ['discretion', 'recovery-case-002'],
      ['crew app', 'recovery-case-002'],
      ['8004', 'recovery-case-003'],
      ['crew fleet', 'recovery-case-003'],
    ] as const) {
      await search.fill(query)
      await expect(page.getByTestId(`help-topic-${topic}`)).toBeVisible()
    }
    await search.fill('')

    const screenshot = await captureVersioned(page)
    expect(existsSync(screenshot)).toBeTruthy()
  })
})
