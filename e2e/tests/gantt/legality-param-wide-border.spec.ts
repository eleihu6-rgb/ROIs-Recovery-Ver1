/**
 * Wide legality param tables (e.g. 8071) must keep the card border around the
 * full table — not clip mid-column (false vertical "splitter").
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Legality param dialog — wide table border', () => {
  test('8071 popup card border wraps the full table width', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-legality').click()
    await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible({ timeout: 30_000 })

    const popup = page.getByTestId('legality-rule-popup-8071-001')
    if (!(await popup.isVisible().catch(() => false))) {
      const cards = page.locator('[data-testid^="legality-ruleset-card-"]')
      const n = await cards.count()
      for (let i = 0; i < Math.min(n, 20); i++) {
        await cards.nth(i).click()
        await page.waitForTimeout(300)
        if (await popup.isVisible().catch(() => false)) break
      }
    }
    await popup.click()
    const dialog = page.getByTestId('legality-param-dialog')
    await expect(dialog).toBeVisible()

    const metrics = await page.evaluate(() => {
      const table = document.querySelector(
        '[data-testid="legality-param-dialog"] [data-testid^="legality-param-table-8071"]',
      )
      const wrap = table?.closest('.rounded-md')
      if (!(table instanceof HTMLElement) || !(wrap instanceof HTMLElement)) {
        return { ok: false as const, reason: 'missing' }
      }
      const tr = table.getBoundingClientRect()
      const wr = wrap.getBoundingClientRect()
      return {
        ok: true as const,
        tableWidth: tr.width,
        wrapWidth: wr.width,
        // Border must track the table; allow 2px for subpixel/border.
        delta: Math.abs(wr.width - tr.width),
      }
    })

    expect(metrics.ok, JSON.stringify(metrics)).toBe(true)
    if (metrics.ok) {
      expect(metrics.tableWidth, '8071 table should be wider than the dialog viewport').toBeGreaterThan(900)
      expect(metrics.delta, `wrap vs table width delta=${metrics.delta}`).toBeLessThanOrEqual(2)
    }
  })
})
