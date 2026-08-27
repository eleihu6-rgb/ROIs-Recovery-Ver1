import { expect, test } from '@playwright/test'
import { gotoHelp, openHelpTopic } from './help-test-utils'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal Help navigation', () => {
  test('PBS-3101 — Help is a protected top-nav route with its own manual shell @smoke', async ({ page }) => {
    await gotoHelp(page)

    await expect(page).toHaveURL(/\/help$/)
    await expect(page.getByRole('link', { name: 'Help' }).locator('span').first()).toHaveClass(/text-white/)
    await expect(page.getByRole('heading', { name: 'Help Center' })).toBeVisible()
    await expect(page.getByText('Follow Quick Start for the complete bidding flow')).toBeVisible()
    await expect(page.getByTestId('help-cat-quick-start')).toBeVisible()
    await expect(page.getByTestId('help-cat-dashboard')).toBeVisible()
    await expect(page.getByTestId('help-cat-bid')).toBeVisible()
    await expect(page.getByTestId('help-cat-reserve')).toHaveCount(0)
    await expect(page.getByTestId('help-cat-bid-conditions')).toBeVisible()
    await expect(page.getByTestId('help-cat-standing-bid')).toBeVisible()
    await expect(page.getByTestId('help-cat-award')).toBeVisible()
    await expect(page.getByTestId('help-cat-common-questions')).toBeVisible()
    await expect(page.getByTestId('help-cat-tier')).toHaveCount(0)
  })

  test('PBS-3102 — left navigation opens topics and keeps search scoped to current Help topics', async ({ page }) => {
    await gotoHelp(page)

    await openHelpTopic(page, 'complete-a-bid')
    await expect(page.getByTestId('help-article')).toContainText('Basic bidding flow')
    await expect(page.getByTestId('help-topic-complete-a-bid')).toHaveClass(/bg-\[#f0f1ff\]/)

    await page.getByPlaceholder('Search topics...').fill('standing')
    await expect(page.getByTestId('help-topic-standing-bid-overview')).toBeVisible()
    await expect(page.getByTestId('help-topic-complete-a-bid')).toHaveCount(0)

    await page.getByPlaceholder('Search topics...').fill('search pairings')
    await expect(page.getByTestId('help-topic-bid-favorites-search')).toBeVisible()
    await expect(page.getByTestId('help-topic-standing-bid-overview')).toHaveCount(0)

    await page.getByPlaceholder('Search topics...').fill('pairing preference')
    await expect(page.getByTestId('help-topic-pairing-configure')).toBeVisible()
    await expect(page.getByTestId('help-topic-bid-conditions-pairing')).toBeVisible()
    await expect(page.getByTestId('help-condition-topic-bid-conditions-pairing-pairing-preference')).toBeVisible()
    await expect(page.getByTestId('help-topic-bid-favorites-search')).toHaveCount(0)

    await page.getByPlaceholder('Search topics...').fill('credit window preference')
    await expect(page.getByTestId('help-topic-bid-conditions-roster-line')).toBeVisible()
    await expect(page.getByTestId('help-condition-topic-bid-conditions-roster-line-credit-window-preference')).toBeVisible()
    await expect(page.getByTestId('help-condition-topic-bid-conditions-standing-bid-credit-window-preference')).toBeVisible()
    await expect(page.getByTestId('help-topic-bid-conditions-days-off')).toHaveCount(0)

    await page.getByPlaceholder('Search topics...').fill('bid properties')
    await expect(page.getByTestId('help-topic-bid-overview')).toHaveCount(0)
    await expect(page.getByTestId('help-topic-bid-add-properties')).toBeVisible()

    await page.getByPlaceholder('Search topics...').fill('zz-no-match')
    await expect(page.getByTestId('help-topic-bid-overview')).toHaveCount(0)
    await expect(page.getByTestId('help-topic-standing-bid-overview')).toHaveCount(0)
  })

  test('PBS-3103 — Help navigation and article scroll independently inside a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 640 })
    await gotoHelp(page)

    const helpNav = page.getByRole('navigation', { name: 'Help topics' })
    const articleScrollRegion = page.getByTestId('help-view').locator('> div')
    await expect(helpNav).toBeVisible()
    await expect.poll(() => helpNav.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    const articleScrollTopBeforeNavScroll = await articleScrollRegion.evaluate((element) => element.scrollTop)
    await helpNav.hover()
    await page.mouse.wheel(0, 600)
    await expect.poll(() => helpNav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect.poll(() => articleScrollRegion.evaluate((element) => element.scrollTop)).toBe(
      articleScrollTopBeforeNavScroll,
    )

    await openHelpTopic(page, 'bid-overview')
    await expect.poll(
      () => articleScrollRegion.evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true)
    const helpNavScrollTopBeforeArticleScroll = await helpNav.evaluate((element) => element.scrollTop)
    await page.getByTestId('help-article').hover()
    await page.mouse.wheel(0, 600)
    await expect.poll(() => articleScrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect.poll(() => helpNav.evaluate((element) => element.scrollTop)).toBe(
      helpNavScrollTopBeforeArticleScroll,
    )
    await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBeLessThanOrEqual(1366)
  })

  test('PBS-3108 — Help keeps screenshots aligned to the reading column on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1024 })
    await gotoHelp(page)
    await openHelpTopic(page, 'dashboard-overview')

    const article = page.getByTestId('help-article')
    const articleScrollRegion = page.getByTestId('help-view').locator('> div')
    const readingColumn = page.getByTestId('help-reading-column')
    const screenshot = page.getByTestId('help-screenshot')
    const screenshotImage = screenshot.locator('img')

    const [articleBox, scrollRegionBox, readingColumnBox, screenshotBox] = await Promise.all([
      article.boundingBox(),
      articleScrollRegion.boundingBox(),
      readingColumn.boundingBox(),
      screenshot.boundingBox(),
    ])

    expect(articleBox).not.toBeNull()
    expect(scrollRegionBox).not.toBeNull()
    expect(readingColumnBox).not.toBeNull()
    expect(screenshotBox).not.toBeNull()
    expect(articleBox!.width).toBeCloseTo(1280, 0)
    expect(readingColumnBox!.width).toBeLessThanOrEqual(880)
    expect(screenshotBox!.width).toBeLessThanOrEqual(880)
    expect(Math.abs(screenshotBox!.width - readingColumnBox!.width)).toBeLessThanOrEqual(2)

    const articleLeftGap = articleBox!.x - scrollRegionBox!.x
    const articleRightGap = scrollRegionBox!.x + scrollRegionBox!.width - articleBox!.x - articleBox!.width
    expect(Math.abs(articleLeftGap - articleRightGap)).toBeLessThanOrEqual(2)

    const readingLeftGap = readingColumnBox!.x - articleBox!.x
    const readingRightGap = articleBox!.x + articleBox!.width - readingColumnBox!.x - readingColumnBox!.width
    expect(Math.abs(readingLeftGap - readingRightGap)).toBeLessThanOrEqual(2)

    const screenshotLeftGap = screenshotBox!.x - articleBox!.x
    const screenshotRightGap = articleBox!.x + articleBox!.width - screenshotBox!.x - screenshotBox!.width
    expect(Math.abs(screenshotLeftGap - screenshotRightGap)).toBeLessThanOrEqual(2)
    expect(Math.abs(screenshotBox!.x - readingColumnBox!.x)).toBeLessThanOrEqual(2)
    await expect.poll(() => screenshotImage.evaluate((image) => image.clientWidth <= image.naturalWidth)).toBe(true)

    await page.setViewportSize({ width: 1366, height: 768 })
    await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBeLessThanOrEqual(1366)
    await expect.poll(
      async () => {
        const [responsiveScreenshotBox, responsiveScrollRegionBox] = await Promise.all([
          screenshot.boundingBox(),
          articleScrollRegion.boundingBox(),
        ])
        return responsiveScreenshotBox!.width <= responsiveScrollRegionBox!.width
      },
    ).toBe(true)
  })
})
