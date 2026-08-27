import { test, expect, type Page } from '@playwright/test'
import { openHelp } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

/**
 * Regression coverage for the f8-usva-tst "Help — Scenario" feedback (2026-06-12).
 * Each test asserts the SPECIFIC corrected content so a revert fails here.
 */
test.describe('Help — Scenario feedback corrections', () => {
  test.beforeEach(async ({ page }) => {
    await openHelp(page, BASE)
  })

  // Filters the topic list by a keyword, then clicks the first matching topic button.
  const openTopic = async (page: Page, search: string, nameRe: RegExp) => {
    const box = page.getByPlaceholder('Search topics…')
    await box.fill(search)
    await page.getByRole('button', { name: nameRe }).first().click()
    await expect(page.getByRole('article')).toBeVisible({ timeout: 5_000 })
  }

  // Note: the Overview status-colour fix (Published violet → amber, distinct from
  // Running) is covered behaviourally by scenario-status-colors.spec.ts.

  test('Scen-2001 — import topic documents the fully-wired Import PBS Material flow', async ({ page }) => {
    await openTopic(page, 'Import', /Importing PBS/)
    const article = page.getByRole('article')
    await expect(article).toContainText('Import PBS Material')
    await expect(article).toContainText('Fetch')
    await expect(article).toContainText('Transform')
    await expect(article).toContainText('Write')
  })

  test('Scen-2002 — duplicate topic documents type-specific configuration (PO/RO/TO)', async ({ page }) => {
    await openTopic(page, 'Duplicating', /Duplicating a scenario/)
    const article = page.getByRole('article')
    await expect(article).toContainText('specific to its type')
    await expect(article).toContainText('Rule Set')
    await expect(article).toContainText('Training scope filters')
  })

  test('Scen-2003 — scope filters: PO statuses match the UI and Crew Bids is documented', async ({ page }) => {
    await openTopic(page, 'scope', /Setting scope filters/)
    const article = page.getByRole('article')
    await expect(article).toContainText('Dep Airports')
    await expect(article).toContainText('Scheduled / Actual / All')
    await expect(article).not.toContainText('only open / only partial')
    await expect(article).toContainText('Crew Bids')
    await expect(article).toContainText('Period')
    // RO + PO + Crew Bids screenshots
    await expect(article.locator('img')).toHaveCount(3)
  })

  test('Scen-2034 — run topic uses "Rule Set" not "Rule Group"', async ({ page }) => {
    await openTopic(page, 'optimization', /Running an optimization/)
    const article = page.getByRole('article')
    await expect(article).toContainText('Rule Set')
    await expect(article).not.toContainText('Rule Group')
  })

  test('Scen-2004 — delete topic uses the same ⋯ menu wording as Duplicate', async ({ page }) => {
    await openTopic(page, 'Deleting', /Deleting a scenario/)
    const article = page.getByRole('article')
    await expect(article).toContainText('menu button')
    await expect(article).toContainText('same menu as Duplicate')
  })

  test('Scen-2092 — publish topic documents current import controls and amber Published status', async ({ page }) => {
    await openTopic(page, 'Importing a roster', /Importing a roster to Live/)
    const article = page.getByRole('article')
    await expect(article).toContainText('Pairing ID')
    await expect(article).toContainText('Pairing Label')
    await expect(article).toContainText('Hide Imported')
    await expect(article).toContainText('Select Unpublished')
    await expect(article).toContainText('Clear Selection')
    await expect(article).toContainText('amber')
    await expect(article).toContainText('Published')
    await expect(article).not.toContainText('blue (solid)')
    await expect(article).not.toContainText('blue badge')
  })
})
