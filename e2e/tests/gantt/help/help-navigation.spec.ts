import { test, expect } from '@playwright/test'
import { loginToGantt } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

test.describe('Help page navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginToGantt(page, BASE)
  })

  test('Live-1080 — Help tab is visible in top nav', async ({ page }) => {
    await expect(page.getByTestId('nav-help')).toBeVisible()
  })

  test('Live-1081 — clicking Help tab shows the welcome screen', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')
    await expect(page.getByTestId('help-view')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Help Center' })).toBeVisible()
    await expect(page.getByText('What do you need help with?')).toBeVisible()
  })

  test('Live-1082 — clicking a category card navigates to its overview article', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')
    await page.getByTestId('help-topic-live-overview').click()
    // Overview article heading should appear in content area
    await expect(page.locator('article h1')).toContainText('Live overview', { timeout: 5_000 })
  })

  test('Live-1083 — left nav highlights the active topic with border-r-2', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')
    await page.getByTestId('help-topic-live-overview').click()
    await page.waitForSelector('article h1', { timeout: 5_000 })
    // Active nav button should have the border-r-2 class
    const activeNavBtn = page.locator('nav button.border-r-2')
    await expect(activeNavBtn).toBeVisible()
    await expect(activeNavBtn).toContainText('Live overview')
  })

  test('Help-2001 — Help menu follows tab order with retained bottom groups', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')

    const labels = await page.locator('[data-testid^="help-cat-"]').evaluateAll((buttons) =>
      buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
    )

    expect(labels).toEqual([
      'Dashboard',
      'Live',
      'Scenario',
      'Data',
      'Legality',
      'System',
      'PBS',
      'Release',
      'Settings & Personalization',
      'Legality Rules',
      'Glossary',
    ])
  })

  test('Help-2002 — Live page dialogs render as child topics in the tree', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')

    const edit = await page.getByTestId('help-topic-live-edit').evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))
    const contextMenu = await page.getByTestId('help-topic-live-context-menu').evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))
    const scheduleDetails = await page.getByTestId('help-topic-schedule-details').evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))

    expect(contextMenu).toBeGreaterThan(edit)
    expect(scheduleDetails).toBeGreaterThan(contextMenu)
  })

  test('Help-2003 — new tab overview topics open from the Help tree', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')
    await page.getByTestId('help-topic-dashboard-overview').click()

    const article = page.getByRole('article')
    await expect(article).toBeVisible({ timeout: 5_000 })
    await expect(article).toContainText('What the Dashboard shows')
    await expect(article).toContainText('live stat cards')
  })

  test('Live-1269 — search filters topic list — "date" shows date-range topic, hides unrelated topics', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')
    const search = page.getByPlaceholder('Search topics…')
    await expect(search).toBeVisible()
    await search.fill('date')
    // "Setting a date range" should be visible
    await expect(page.getByRole('button', { name: 'Setting a date range' })).toBeVisible()
    // "Filtering crew" should NOT be visible (does not contain "date")
    await expect(page.getByRole('button', { name: /Filtering crew/i })).not.toBeVisible()
  })

  test('Live-1084 — clearing search restores full topic list', async ({ page }) => {
    await page.click('[data-testid="nav-help"]')
    const search = page.getByPlaceholder('Search topics…')
    await search.fill('date')
    await search.fill('')
    await expect(page.getByRole('button', { name: /Filtering crew/i })).toBeVisible()
  })
})
