import { test, expect } from '@playwright/test'
import { openHelp } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

/**
 * Every help topic that embeds a screenshot. The test opens each topic and
 * asserts that all <img> elements inside the article have actually LOADED
 * (naturalWidth > 0) — proving the PNG exists and renders, not a broken image
 * or the dashed "missing screenshot" placeholder.
 */
const TOPICS_WITH_SHOTS: Array<{ nav: string; minImages: number }> = [
  { nav: 'Live overview',                             minImages: 2 }, // Live overview → live-empty-state + live-toolbar
  { nav: 'Filtering crew, pairings, and flights',     minImages: 5 },
  { nav: 'Working with panes',                        minImages: 1 },
  { nav: 'Navigating flights with Flight Navi',        minImages: 1 },
  { nav: 'Switching time zones',                       minImages: 1 },
  { nav: 'Choosing a rule set',                        minImages: 1 },
  { nav: 'Browsing and searching scenarios',          minImages: 1 },
  { nav: 'Setting scope filters',                      minImages: 3 }, // RO + PO scope-filters + Crew Bids snapshots
  { nav: 'Creating a new scenario',                    minImages: 1 },
  { nav: 'Running an optimization',                    minImages: 1 },
  { nav: 'Reading your optimization results',          minImages: 1 },
  { nav: 'Importing a roster to Live',                  minImages: 1 },
  { nav: 'Changing the theme',                          minImages: 1 },
  { nav: 'Keyboard shortcuts',                          minImages: 1 },
]

test.describe('Help page screenshots render', () => {
  test.beforeEach(async ({ page }) => {
    await openHelp(page, BASE)
  })

  // Some categories are collapsed by default, so their topic buttons are hidden
  // until revealed. Typing the title into the search box force-expands matching
  // categories — robust regardless of default state.
  const openTopic = async (page: import('@playwright/test').Page, nav: string) => {
    const search = page.getByPlaceholder('Search topics…')
    await search.fill(nav)
    await page.getByRole('button', { name: nav, exact: true }).first().click()
  }

  for (const { nav, minImages } of TOPICS_WITH_SHOTS) {
    test(`Live-1270 — "${nav}" shows ${minImages} loaded screenshot(s)`, async ({ page }) => {
      await openTopic(page, nav)

      const article = page.getByRole('article')
      await expect(article).toBeVisible({ timeout: 5_000 })

      const imgs = article.locator('img')
      await expect(imgs).toHaveCount(minImages)

      // Every embedded image must have decoded with real pixels AND carry
      // enough of them to stay sharp. Screenshots are captured at 2× DPR, so
      // even small toolbar crops should be ≥ 200px wide. A 29px funnel icon
      // upscaled to fill the panel (the original bug) would fail this guard.
      const MIN_NATURAL_WIDTH = 200
      const count = await imgs.count()
      for (let i = 0; i < count; i++) {
        const img = imgs.nth(i)
        await expect(img).toBeVisible()
        await expect
          .poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), {
            timeout: 5_000,
            message: `image ${i} under "${nav}" must be ≥ ${MIN_NATURAL_WIDTH}px wide (got a smaller/blurry capture)`,
          })
          .toBeGreaterThanOrEqual(MIN_NATURAL_WIDTH)
      }
    })
  }

  test('Live-1085 — no help screenshot 404s while browsing every topic', async ({ page }) => {
    const failed: string[] = []
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/help/screenshots/') && res.status() >= 400) {
        failed.push(`${res.status()} ${url}`)
      }
    })

    for (const { nav } of TOPICS_WITH_SHOTS) {
      await openTopic(page, nav)
      await page.getByRole('article').waitFor({ timeout: 5_000 })
      await page.waitForTimeout(200)
    }

    expect(failed, `screenshot requests failed:\n${failed.join('\n')}`).toHaveLength(0)
  })
})
