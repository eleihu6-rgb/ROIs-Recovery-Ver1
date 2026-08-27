import { expect, test } from '@playwright/test'
import { gotoHelp, openHelpTopic } from './help-test-utils'

const allTopicSlugs = [
  'portal-overview',
  'before-you-begin',
  'complete-a-bid',
  'dashboard-overview',
  'dashboard-profile',
  'dashboard-calendar',
  'dashboard-entries',
  'bid-overview',
  'bid-calendar',
  'bid-add-properties',
  'pairing-configure',
  'bid-manage-properties',
  'bid-favorites-search',
  'bid-conditions-days-off',
  'bid-conditions-pairing',
  'bid-conditions-roster-line',
  'bid-conditions-standing-bid',
  'standing-bid-overview',
  'standing-bid-manage',
  'award-overview',
  'common-questions',
]

const prohibitedIdentityTerms = [
  /\bbeginner\b/i,
  /\bnovice\b/i,
  /\bintern\b/i,
  /\btrainee\b/i,
  /\bnew user\b/i,
  /\bflight deck\b/i,
  /\bcabin crew\b/i,
  /\bpilot\b/i,
  /\bflight attendant\b/i,
]

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal Help content boundaries', () => {
  test('PBS-3107 — every registered topic loads and avoids retired or identity-based language', async ({ page }) => {
    await gotoHelp(page)

    for (const slug of allTopicSlugs) {
      await openHelpTopic(page, slug)
      const article = page.getByTestId('help-article')
      await expect(article).toBeVisible()
      await expect(article).not.toContainText(/\bLayer\b/)

      const text = await article.innerText()
      for (const prohibitedTerm of prohibitedIdentityTerms) {
        expect(text).not.toMatch(prohibitedTerm)
      }
    }
  })
})
