import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginToGantt } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

/**
 * Content regression for the "Legality Rules" Help section (gantt/src/components/
 * help/topics/legality/*). Asserts each of the 15 rule topics renders its function
 * id, regulatory origin, and parameters — content sourced from the Flair PBS BRD
 * and workset 433 "F8 Full Ruleset" param_json. Navigates via the nav testids
 * (help-cat-* / help-topic-*) so it is robust to collapse state and label collisions.
 */

const openHelp = async (page: Page) => {
  await page.click('[data-testid="nav-help"]')
  await expect(page.getByTestId('help-view')).toBeVisible()
  // Expand the (default-collapsed) Legality Rules category once.
  await page.getByTestId('help-cat-legality').click()
}

/** Click a Legality topic by its slug and wait for the article to render. */
const gotoTopic = async (page: Page, slug: string) => {
  await page.getByTestId(`help-topic-${slug}`).click()
  await page.waitForSelector('article h1', { timeout: 5_000 })
}

test.describe('Help — Legality Rules section', () => {
  test.beforeEach(async ({ page }) => {
    await loginToGantt(page, BASE)
  })

  test('Live-1350 — Legality overview names the 433 ruleset, the BRD, and all six families', async ({ page }) => {
    await openHelp(page)
    await gotoTopic(page, 'legality-overview')
    const article = page.locator('article')
    await expect(article.locator('h1')).toContainText('Overview')
    await expect(article).toContainText('F8 Full Ruleset')
    await expect(article).toContainText('workset 433')
    await expect(article).toContainText('Flair PBS BRD')
    // Families enumerated
    await expect(article).toContainText('Definitions & calculators')
    await expect(article).toContainText('Cumulative limits')
    await expect(article).toContainText('Qualification')
    // The sample-values caveat
    await expect(article).toContainText('regulatory baseline')
    // Where violations surface — bells + the Alert Center (Live and Scenario)
    await expect(article).toContainText('Where violations appear')
    await expect(article).toContainText('Alert Center')
    await expect(article).toContainText('group the remaining rows by Severity, Rule, Base or Rank')
    // Row column + Row N recheck-message prefix (2026-08-14)
    await expect(article).toContainText('Row column')
    await expect(article).toContainText('Row 2:')
  })

  test('Live-1351 — 8002 Maximum Flight Time cites CAR 700.27(1) and documents its parameters', async ({ page }) => {
    await openHelp(page)
    await gotoTopic(page, 'legality-8002-flight-time')
    const article = page.locator('article')
    await expect(article.locator('h1')).toContainText('8002 — Maximum Flight Time')
    await expect(article).toContainText('Function 8002')
    // Origin
    await expect(article).toContainText('CAR 700.27(1)')
    await expect(article).toContainText('112 hours in any 28 consecutive days')
    // Parameter section + a specific column + the BH type
    await expect(article).toContainText('Where it comes from')
    await expect(article).toContainText('Period')
    await expect(article).toContainText('block hours')
  })

  test('Live-1352 — definition rules show the No-violations marker and their source', async ({ page }) => {
    await openHelp(page)

    // 7500 Acc State — a definition, cites the acclimatization regulation.
    await gotoTopic(page, 'legality-7500')
    let article = page.locator('article')
    await expect(article.locator('h1')).toContainText('7500 — Basic definition of Acc State')
    await expect(article).toContainText('No violations')
    await expect(article).toContainText('CAR 700.28(5)')
    await expect(article).toContainText('acclimatized reference time zone')

    // 2014 Local Night — a definition, regulatory local-night window.
    await gotoTopic(page, 'legality-2014')
    article = page.locator('article')
    await expect(article.locator('h1')).toContainText('2014 — Local Night Definition')
    await expect(article).toContainText('No violations')
    await expect(article).toContainText("local night's rest")
    await expect(article).toContainText('Local Night Start')
  })

  test('Live-1353 — WOCL rules document the circadian-low window and CAR origin', async ({ page }) => {
    await openHelp(page)
    await gotoTopic(page, 'legality-7503')
    const article = page.locator('article')
    await expect(article.locator('h1')).toContainText('7503 — Limits of Consecutive WOCLs')
    await expect(article).toContainText('02:00')
    await expect(article).toContainText('05:59')
    await expect(article).toContainText('CAR 700.51(1)')
    await expect(article).toContainText('Max Consecutive WOCLs')
  })

  test('Live-1354 — every legality rule topic renders id, origin, and parameters', async ({ page }) => {
    await openHelp(page)
    // [topic slug, function id (no instance), h1 name fragment]
    const rules: [string, string, string][] = [
      ['legality-2014',             '2014', 'Local Night Definition'],
      ['legality-2015',             '2015', 'DO Start Time Definition'],
      ['legality-7500',             '7500', 'Basic definition of Acc State'],
      ['legality-7502',             '7502', 'The Calculation of Credit Hours'],
      ['legality-7272',             '7272', 'Calculate DP of the Reserves'],
      ['legality-8002-flight-time', '8002', 'Maximum Flight Time'],
      ['legality-8002-hours',       '8002', 'Maximum Hours of Work'],
      ['legality-7501',             '7501', 'Single Day Free from Duty'],
      ['legality-7505',             '7505', 'Min # GDOs in a RP'],
      ['legality-7507',             '7507', 'Min # GDOs (fly/reserve filters)'],
      ['legality-7508',             '7508', 'Single Day Free from Duty in Calendar Days'],
      ['legality-7503',             '7503', 'Limits of Consecutive WOCLs'],
      ['legality-7504',             '7504', 'Spacing Rule - WOCL'],
      ['legality-7506',             '7506', 'One Checkin Per Day'],
      ['legality-8004',             '8004', 'Basic Competency-F8'],
      ['legality-8030',             '8030', 'Age Restriction'],
      ['legality-8056',             '8056', 'Roster Spacing'],
    ]
    for (const [slug, fnId, nameFrag] of rules) {
      await gotoTopic(page, slug)
      const article = page.locator('article')
      // Title shows the function id only (no function/instance prefix like 7507/001)
      // followed by the rule name. The rule name itself may contain normal prose slashes.
      await expect(article.locator('h1')).toContainText(`${fnId} — ${nameFrag}`)
      await expect(article.locator('h1')).not.toContainText(`${fnId}/`)
      await expect(article).toContainText(`Function ${fnId}`)
      await expect(article).toContainText('What it does')
      await expect(article).toContainText('Where it comes from')
      await expect(article).toContainText('Parameters')
    }
  })
})
