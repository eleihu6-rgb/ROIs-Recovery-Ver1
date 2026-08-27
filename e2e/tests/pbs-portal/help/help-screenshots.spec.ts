import { expect, test } from '@playwright/test'
import { gotoHelp, openHelpTopic } from './help-test-utils'

const screenshotTopics = [
  'dashboard-overview',
  'bid-overview',
  'bid-calendar',
  'standing-bid-overview',
  'award-overview',
]

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal Help screenshots', () => {
  test('PBS-3103 — current screenshot topics load exactly one safe generated screenshot each', async ({ page }) => {
    await gotoHelp(page)

    for (const slug of screenshotTopics) {
      await openHelpTopic(page, slug)

      const images = page.getByTestId('help-article').locator('img')
      await expect(images).toHaveCount(1)
      await expect
        .poll(async () => images.first().evaluate((image) => {
          const img = image as HTMLImageElement
          return img.complete && img.naturalWidth >= 200 && img.naturalHeight >= 120
        }))
        .toBe(true)
    }

    await openHelpTopic(page, 'complete-a-bid')
    await expect(page.getByTestId('help-article').locator('img')).toHaveCount(0)
  })
})
