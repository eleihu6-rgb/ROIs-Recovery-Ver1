import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Rule Manager — professional/restrained palette (2026-06-11 request: "too many
 * colors and background"). Taxonomy badges (Category, Division) used to be a
 * per-value rainbow of saturated dark chips; they are now ONE uniform neutral chip.
 * Color is reserved for Severity, which encodes urgency.
 *
 * Regression intent:
 *  - all Category badges share the SAME background (no rainbow) — would fail when
 *    each category had its own bg-*-950 color.
 *  - Severity still carries color: an ERROR row differs from a neutral category chip.
 */
test.describe('Rule Manager palette', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-rule').click()
    await page.getByRole('button', { name: 'Rule Manager' }).click()
    await expect(page.getByTestId('rule-cat-badge').first()).toBeVisible({ timeout: 15_000 })
  })

  test('Live-1224 — category badges are a single uniform neutral colour (no rainbow)', async ({ page }) => {
    const badges = page.getByTestId('rule-cat-badge')
    const count = await badges.count()
    expect(count, 'several rules visible').toBeGreaterThan(3)

    const colours = new Set<string>()
    for (let i = 0; i < count; i++) {
      colours.add(await badges.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor))
    }
    // Every category chip renders with the identical neutral background.
    expect(colours.size, `category badges should share one colour, got ${[...colours].join(' | ')}`).toBe(1)
  })

  test('Live-1225 — severity keeps colour: an ERROR severity differs from the neutral category chip', async ({ page }) => {
    const catBg = await page.getByTestId('rule-cat-badge').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)

    const selects = page.getByTestId('rule-sev-select')
    const n = await selects.count()
    let errorBg: string | null = null
    for (let i = 0; i < n; i++) {
      const s = selects.nth(i)
      if ((await s.inputValue()) === 'ERROR') {
        errorBg = await s.evaluate((el) => getComputedStyle(el).backgroundColor)
        break
      }
    }
    expect(errorBg, 'an ERROR severity row exists').not.toBeNull()
    // ERROR severity is tinted (destructive), not the neutral taxonomy colour.
    expect(errorBg).not.toBe(catBg)
  })
})
