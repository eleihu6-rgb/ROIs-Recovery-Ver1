/**
 * Help "Controls on this screen" reference — leading icons.
 *
 * The Running-an-optimization topic's controls reference now shows a small
 * icon beside each control (Play / pre-run checklist / amber Stop / coloured
 * status dots / Eraser) so the reference visually matches the real toolbar.
 *
 * This proves the icons actually render — not just that the rows exist:
 *   - the "Play icon (Kick off run)" row carries an inline SVG icon,
 *   - the controls table renders multiple leading icons,
 *   - at least one coloured status dot (Running/Done/Failed) is present.
 */
import { test, expect } from '@playwright/test'
import { openHelp } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

test.describe('Help controls reference — icons', () => {
  test.beforeEach(async ({ page }) => {
    await openHelp(page, BASE)
  })

  test('Live-1075 — Running-an-optimization controls show leading icons and a status dot', async ({ page }) => {
    // Open the topic via search (robust regardless of category collapse state).
    await page.getByPlaceholder('Search topics…').fill('Running an optimization')
    await page.getByRole('button', { name: 'Running an optimization', exact: true }).first().click()

    const article = page.getByRole('article')
    await expect(article).toBeVisible()

    // Locate the controls reference table (the one under "Controls on this screen").
    const controls = article.locator('table', {
      has: page.getByText('Play icon (Kick off run)'),
    })
    await expect(controls).toBeVisible()

    // The Play row carries an inline SVG icon in its leading cell.
    const playRow = controls.locator('tr', { hasText: 'Play icon (Kick off run)' })
    await expect(playRow.locator('svg').first()).toBeVisible()

    // Several control rows render leading icons (Play, checklist, Stop, Eraser …).
    expect(await controls.locator('tr td:first-child svg').count()).toBeGreaterThanOrEqual(4)

    // Status controls show as coloured status icons (Running / Done / Failed) —
    // lucide icons with a leading SVG, replacing the old coloured status dots.
    for (const status of ['Running status', 'Done status', 'Failed status']) {
      const row = controls.locator('tr', { hasText: status })
      await expect(row).toBeVisible()
      await expect(row.locator('td:first-child svg').first()).toBeVisible()
    }
  })
})
