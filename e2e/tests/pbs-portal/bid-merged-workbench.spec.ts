import { expect, test } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'

test.use({ storageState: { cookies: [], origins: [] } })

const WORKBENCH_VIEWPORTS = [
  { height: 1080, layoutMode: 'adaptive', width: 1920 },
  { height: 600, layoutMode: 'adaptive', width: 1366 },
  { height: 768, layoutMode: 'fit', width: 1024 },
] as const

test.describe('PBS merged Bid workbench (real backend)', () => {
  test('PBS-BID-001 — merges categories and exposes the dual-mode date action @smoke', async ({ page }) => {
    const login = new PbsLoginPage(page)

    await login.goto()
    await login.login(PBS_USER, PBS_PASS)
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

    await page.getByRole('link', { name: 'Bid', exact: true }).click()
    await expect(page).toHaveURL(/\/bid$/)

    const bidPage = page.getByTestId('bid-page')
    await expect(bidPage).toBeVisible({ timeout: 15_000 })
    await expect(bidPage.getByText('EXISTING BID PROPERTIES')).toBeVisible()
    await expect(bidPage.getByText('ADD BID PROPERTIES')).toBeVisible()

    const existingRows = bidPage.getByTestId('tier-summary-row')
    const tierFilterLabel = bidPage.getByTestId('bid-existing-tier-filter-label')
    const bidReviewPanel = bidPage.getByTestId('bid-review-panel')
    const tier1Button = page.getByRole('button', { name: 'TIER-01' }).first()
    const tier2Button = page.getByRole('button', { name: 'TIER-02' }).first()
    await expect(tierFilterLabel).toContainText('T1 only')
    await expect(bidReviewPanel).toContainText('BID REVIEW')
    await expect(bidReviewPanel.getByText('T1', { exact: true })).toHaveCount(0)
    await expect(bidReviewPanel).not.toContainText('Mock warnings')
    await expect(tier1Button).toHaveAttribute('aria-pressed', 'true')
    await expect(tier2Button).toHaveAttribute('aria-pressed', 'false')

    const assertVisibleSummariesDoNotExposeRawPayload = async () => {
      const summaryText = await bidPage.getByTestId('tier-summary-readable-text').allTextContents()

      expect(summaryText.join(' ')).not.toMatch(/\{"type"|"pairingIds"|"pairingLabels"/)
      expect(summaryText.join(' ')).not.toContain('147163')
    }

    await assertVisibleSummariesDoNotExposeRawPayload()

    if (await existingRows.count() > 0) {
      const pairingRow = existingRows.filter({ hasText: 'Pairing' }).first()
      if (await pairingRow.count() > 0) {
        await expect(pairingRow.getByRole('button', { name: /^Preview / })).toBeVisible()
      }
      await expect(existingRows.first().getByRole('button', { name: /^Delete / })).toBeVisible()
      await existingRows.first().getByRole('button', { name: /^Delete / }).click()
      await expect(page.getByText('Delete this bid from the current draft?')).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByText('Delete this bid from the current draft?')).toHaveCount(0)

      const actionWidths = await existingRows.evaluateAll((rows) => rows.map((row) => {
        const actions = row.querySelector<HTMLElement>('[data-testid="tier-summary-actions"]')

        return actions ? Number.parseFloat(getComputedStyle(actions).width) : 0
      }))
      expect(actionWidths.length).toBeGreaterThan(0)
      expect(actionWidths.every((width) => Math.abs(width - 150) <= 1)).toBe(true)
    }

    await tier2Button.click()
    await expect(tier2Button).toHaveAttribute('aria-pressed', 'true')
    await expect(tierFilterLabel).toContainText('T2 only')
    await expect(bidReviewPanel.getByText('T2', { exact: true })).toHaveCount(0)
    await assertVisibleSummariesDoNotExposeRawPayload()
    await tier2Button.click()
    await expect(tier2Button).toHaveAttribute('aria-pressed', 'false')
    await expect(tier1Button).toHaveAttribute('aria-pressed', 'true')
    await expect(tierFilterLabel).toContainText('T1 only')

    const categoryTabs = bidPage.getByRole('tab')
    await expect(categoryTabs).toHaveCount(4)
    await expect(categoryTabs.nth(0)).toHaveText('FAVORITED PROPERTIES')
    await expect(categoryTabs.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(categoryTabs.nth(1)).toHaveText('DAYS OFF')
    await expect(categoryTabs.nth(2)).toHaveText('PAIRING')
    await expect(categoryTabs.nth(3)).toHaveText('ROSTER')
    await expect(bidPage.getByText('ALL PROPERTIES', { exact: true })).toHaveCount(0)

    await categoryTabs.nth(3).click()
    await expect(categoryTabs.nth(3)).toHaveAttribute('aria-selected', 'true')
    await expect(bidPage.getByText('Credit Window Preference', { exact: true })).toBeVisible()
    await categoryTabs.nth(0).click()

    for (const viewport of WORKBENCH_VIEWPORTS) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })

      const canvasViewport = page.getByTestId('shared-bidding-workbench-viewport')
      await expect(canvasViewport).toHaveAttribute('data-layout-mode', viewport.layoutMode)

      await expect.poll(async () => page.evaluate(() => {
        const scrollingElement = document.scrollingElement

        if (!scrollingElement) {
          throw new Error('Missing document scrolling element')
        }

        return {
          hasPageScroll: scrollingElement.scrollHeight > scrollingElement.clientHeight + 1,
          scrollTop: scrollingElement.scrollTop,
        }
      })).toEqual({ hasPageScroll: false, scrollTop: 0 })
      await expect(page.getByRole('link', { name: 'Bid', exact: true })).toBeInViewport()
      await expect(page.getByTestId('shared-bidding-calendar-column')).toBeInViewport()
      await expect(bidPage.getByText('EXISTING BID PROPERTIES')).toBeInViewport()
      await expect(bidPage.getByText('ADD BID PROPERTIES')).toBeInViewport()
      await expect(bidPage.getByRole('tab', { name: 'PAIRING' })).toBeInViewport()
      await expect(bidPage.getByPlaceholder('Search Bid Properties')).toBeInViewport()
      await expect(bidPage.getByTestId('bid-available-properties-scroll')).toBeInViewport()
    }

    await page.setViewportSize({ height: 900, width: 1440 })
    await categoryTabs.nth(2).click()

    const availableScroll = bidPage.getByTestId('bid-available-properties-scroll')
    const existingScroll = bidPage.getByTestId('bid-existing-properties-scroll')
    const initialScrollState = await page.evaluate(() => ({
      available: document.querySelector<HTMLElement>('[data-testid="bid-available-properties-scroll"]')?.scrollTop ?? -1,
      existing: document.querySelector<HTMLElement>('[data-testid="bid-existing-properties-scroll"]')?.scrollTop ?? -1,
      page: document.scrollingElement?.scrollTop ?? -1,
    }))

    expect(initialScrollState.available).toBe(0)
    expect(initialScrollState.page).toBe(0)
    await availableScroll.hover()
    await page.mouse.wheel(0, 1200)

    await expect.poll(async () => availableScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    expect(await existingScroll.evaluate((element) => element.scrollTop)).toBe(initialScrollState.existing)
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? -1)).toBe(0)

    await availableScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await availableScroll.hover()
    await page.mouse.wheel(0, 1200)
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? -1)).toBe(0)

    const dateAction = page.getByRole('button', { name: /^Add bid for / }).first()
    await expect(dateAction).toBeVisible()
    await dateAction.click()

    const popover = page.getByTestId('schedule-action-popover')
    await expect(popover.getByRole('tab', { name: 'DAYS OFF' })).toBeVisible()
    await expect(popover.getByRole('tab', { name: 'PAIRING' })).toBeVisible()
    await popover.getByRole('tab', { name: 'PAIRING' }).click()
    await expect(popover.getByText('APPLY TO TIERS · REQUIRED', { exact: true })).toBeVisible()

    for (const viewport of [
      { height: 1080, width: 1920 },
      { height: 700, width: 1366 },
    ]) {
      await page.setViewportSize(viewport)

      await expect.poll(async () => page.evaluate(() => {
        const calendarPanel = document.querySelector<HTMLElement>('[data-uiid="dashboard-schedule-panel"]')
        const actionPopover = document.querySelector<HTMLElement>('[data-testid="schedule-action-popover"]')

        if (!calendarPanel || !actionPopover) {
          return null
        }

        const boundary = calendarPanel.getBoundingClientRect()
        const popup = actionPopover.getBoundingClientRect()

        return {
          bottomInside: popup.bottom <= boundary.bottom + 1,
          leftInside: popup.left >= boundary.left - 1,
          rightInside: popup.right <= boundary.right + 1,
          topInside: popup.top >= boundary.top - 1,
        }
      })).toEqual({
        bottomInside: true,
        leftInside: true,
        rightInside: true,
        topInside: true,
      })
      await expect(popover.getByRole('button', { name: 'Cancel' })).toBeInViewport()
      await expect(popover.getByRole('button', { name: 'ADD BID' })).toBeInViewport()
      await expect(page.getByTestId('pairing-calendar-run-list')).toHaveCSS('overflow-y', 'auto')
      await expect.poll(async () => page.evaluate(() => {
        const scrollingElement = document.scrollingElement

        return scrollingElement
          ? scrollingElement.scrollHeight <= scrollingElement.clientHeight + 1
          : false
      })).toBe(true)
    }

    await expect(page.getByRole('link', { name: 'Tier', exact: true })).toHaveCount(0)
    await page.goto(page.url().replace(/\/bid$/, '/tier'))
    await expect(page).toHaveURL(/\/bid$/)
    await expect(page.getByTestId('bid-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('PAIRING POOLS', { exact: true })).toHaveCount(0)
  })
})
