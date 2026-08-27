/**
 * Alert Center footer must match the compact Legality param-dialog chrome
 * (`footerClassName="py-1"` + Close `h-6`) — not the default AppDialog `py-3` bar.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test('Live-1414 — Alert Center Close footer matches Legality compact height', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)

  await expect
    .poll(
      () => page.evaluate(() => {
        const t = (window as unknown as { __ganttTest?: { liveViolations?: () => unknown[] } }).__ganttTest
        return (t?.liveViolations?.() ?? []).length
      }),
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0)

  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  const footerPad = await dialog.locator('.border-t.border-border').last().evaluate((el) => {
    const s = getComputedStyle(el)
    return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom) }
  })
  expect(footerPad, 'footer padding matches Legality param dialog (py-1 = 4px)').toEqual({
    top: 4,
    bottom: 4,
  })

  // Footer text button (not the title-bar X which has aria-label="Close").
  const closeBtn = dialog.locator('.border-t.border-border').last().getByRole('button', { name: 'Close' })
  await expect(closeBtn).toBeVisible()
  const closeHeight = await closeBtn.evaluate((el) => el.getBoundingClientRect().height)
  expect(closeHeight, 'Close button is compact h-6 (24px)').toBe(24)
})
