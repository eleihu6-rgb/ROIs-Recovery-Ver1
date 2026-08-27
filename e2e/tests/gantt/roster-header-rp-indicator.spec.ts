/**
 * Roster pane header — crew loaded/total count + current-RP indicator.
 * The RP block shows the roster period of the leftmost visible gantt day and
 * updates on horizontal pan / RP-nav (driven by LiveRpIndicator subscribing to
 * the view store's scrollX/pxPerHour + the pane dateRange).
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady } from '../../utils/gantt-hook'

test.describe('Roster header — RP indicator + crew count', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page, 90_000)
  })

  test('shows the current-RP indicator', async ({ page }) => {
    const rp = page.getByTestId('roster-header-rp').first()
    await expect(rp, 'current-RP indicator renders').toBeVisible({ timeout: 15_000 })
    await expect(rp).toContainText(/20\d\dRP\d{2}/)
  })

  test('RP indicator tracks the leftmost visible day on horizontal pan', async ({ page }) => {
    const rp = page.getByTestId('roster-header-rp').first()
    await expect(rp).toBeVisible({ timeout: 15_000 })
    await expect(rp).toContainText(/20\d\dRP\d{2}/)

    // Pan the time axis right (keyboard) — the indicator must still show a valid RP
    // (it follows whichever RP the leftmost visible day belongs to).
    const axis = page.getByTestId('roster-pane').getByTestId('pane-time-axis')
    await axis.focus()
    for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowRight')
    await expect(rp).toContainText(/20\d\dRP\d{2}/)
  })
})
