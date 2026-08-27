import { test, expect, type Page } from '@playwright/test'
import { openHelp } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

/**
 * Regression coverage for the f8-usva-tst "Help — Live" feedback (2026-06-12).
 * Each test asserts the SPECIFIC corrected content, so a revert to the old
 * (stale) help text fails here — not just "the page renders".
 */
test.describe('Help — Live feedback corrections', () => {
  test.beforeEach(async ({ page }) => {
    await openHelp(page, BASE)
  })

  const openTopic = async (page: Page, nav: string) => {
    const search = page.getByPlaceholder('Search topics…')
    await search.fill(nav)
    await page.getByRole('button', { name: nav, exact: true }).first().click()
    await expect(page.getByRole('article')).toBeVisible({ timeout: 5_000 })
  }

  test('Live-1076 — date range topic documents the Refresh button location', async ({ page }) => {
    await openTopic(page, 'Setting a date range')
    const article = page.getByRole('article')
    await expect(article).toContainText('Refresh button')
    await expect(article).toContainText('latest crew data')
  })

  test('Live-1340 — date range topic documents the roster-period selector and 6-RP span', async ({ page }) => {
    await openTopic(page, 'Setting a date range')
    const article = page.getByRole('article')
    await expect(article).toContainText('roster-period selector')
    await expect(article).toContainText('six consecutive roster periods')
    await expect(article).toContainText('Load earlier RPs')
    await expect(article).toContainText('seven days of context')
    // Selecting an RP must NOT auto-query — the topic documents the apply-filters flow.
    await expect(article).toContainText('apply filters to pull data')
    await expect(article).toContainText('Apply Filters')
    // Stale free-form date-picker wording must be gone.
    await expect(article).not.toContainText('two-month window')
    await expect(article).not.toContainText('first calendar month fits the viewport')
  })

  test('Live-1341 — panes topic states the default Roster + Pairing layout', async ({ page }) => {
    await openTopic(page, 'Working with panes')
    const article = page.getByRole('article')
    await expect(article).toContainText('default layout')
    await expect(article).toContainText('no Flight pane')
  })

  test('Live-1267 — panes topic renamed to "Working with panes" and states the 2/2/1 limits', async ({ page }) => {
    await openTopic(page, 'Working with panes')
    const article = page.getByRole('article')
    await expect(article.locator('h1')).toContainText('Working with panes')
    await expect(article).toContainText('2 Roster')
    await expect(article).toContainText('1 Flight')
    await expect(article).toContainText('4 panes in total')
    // The stale "Max 3 Roster panes" example must be gone.
    await expect(article).not.toContainText('Max 3 Roster panes')
  })

  test('Live-1268 — new "Editing assignments" topic covers the core edit operations', async ({ page }) => {
    await openTopic(page, 'Editing assignments')
    const article = page.getByRole('article')
    await expect(article.locator('h1')).toContainText('Editing assignments')
    await expect(article).toContainText('Reassign crew by dragging')
    await expect(article).toContainText('Swap Task')
    await expect(article).toContainText('Pin Selected Rows')
    // "Create Pairing from flights" (Ctrl+Q) is out of scope for f8 — it must not
    // appear in this topic (neither the step nor the controls reference row).
    await expect(article).not.toContainText('Create Pairing')
    await expect(article).not.toContainText('Ctrl+Q')
  })

  test('Live-1269 — Editing topic documents mouse box-select and keyboard Delete', async ({ page }) => {
    await openTopic(page, 'Editing assignments')
    const article = page.getByRole('article')
    // Mouse drag-box (rubber-band) multi-select — was previously missing.
    await expect(article).toContainText('drag a box')
    await expect(article).toContainText('Box-select works in the Roster, Pairing, and Flight panes')
    // Keyboard delete — Del and its Backspace alternate both called out.
    await expect(article).toContainText('Del')
    await expect(article).toContainText('Backspace')
    // Right-click Delete acts on the whole box-selection (menu shows the count).
    await expect(article).toContainText('Delete N Tasks')
    await expect(article).toContainText('removes the whole selection at once')
  })

  test('Live-1270 — Editing topic controls reference shows leading icons', async ({ page }) => {
    await openTopic(page, 'Editing assignments')
    const article = page.getByRole('article')
    // The "Controls on this screen" reference renders a leading icon per row.
    const controls = article.locator('table', {
      has: page.getByText('Drag a box', { exact: true }),
    })
    await expect(controls).toBeVisible()
    // The fun box-select row carries an inline SVG icon in its leading cell.
    const boxRow = controls.locator('tr', { hasText: 'Drag a box' })
    await expect(boxRow.locator('svg').first()).toBeVisible()
    // Several control rows render leading icons (box-select, eraser, pin …).
    expect(await controls.locator('tr td:first-child svg').count()).toBeGreaterThanOrEqual(6)
  })

  test('Live-1077 — ground task topic uses the real field labels (Crew IDs / Assignment / Group)', async ({ page }) => {
    await openTopic(page, 'Creating a ground task')
    const article = page.getByRole('article')
    await expect(article).toContainText('Crew IDs')
    await expect(article).toContainText('Assignment')
    await expect(article).toContainText('Group')
    await expect(article).toContainText('Remark')
  })

  test('Live-1078 — timezone topic reflects the enhanced list (Display Timezone, UTC first)', async ({ page }) => {
    await openTopic(page, 'Switching time zones')
    const article = page.getByRole('article')
    await expect(article).toContainText('Display Timezone')
    await expect(article).toContainText('Airline Bases')
    await expect(article).toContainText('re-anchored to local midnight')
  })

  test('Live-1079 — keyboard reference matches the in-app dialog wording', async ({ page }) => {
    await openTopic(page, 'Keyboard shortcuts')
    const article = page.getByRole('article')
    await expect(article).toContainText('Create Pairing from selected flights')
    await expect(article).toContainText('Toggle multi-select')
    // Alternates moved to the note, not baked into table rows.
    await expect(article).toContainText('Ctrl+Shift+Z')
  })
})
