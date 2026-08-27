/**
 * Live-1400: RES Pairing Creator button in the Live pairing pane toolbar.
 *
 * Verifies that the ShieldPlus icon button (data-testid="res-pairing-button")
 * appears in the pairing-pane condition strip when on the Live view.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test('Live-1400: RES button shows on Live pairing pane', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  // gotoGantt already calls openLiveView → loads data and shows the pairing pane.
  await expect(page.getByTestId('res-pairing-button')).toBeVisible({ timeout: 30_000 })
})
