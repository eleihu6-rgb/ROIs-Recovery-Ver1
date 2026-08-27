/**
 * Live-1401: RES Pairing Planner dialog opens on button click.
 *
 * Verifies that clicking the RES button opens the ResPairingPlannerDialog
 * (data-testid="res-planner-dialog"), the Define and Manage existing tabs are
 * visible, and the removed Review & Generate tab is not.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test('Live-1401: RES button opens planner dialog', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  // gotoGantt already navigates to Live view with data loaded.
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('res-tab-define')).toBeVisible()
  await expect(page.getByTestId('res-tab-manage')).toBeVisible()
  await expect(page.getByTestId('res-tab-review')).toHaveCount(0)
})

test('Live-1401b: Pilot RES assignments default all selected including PRPM', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('res-div-P').click()
  for (const code of ['PRAM', 'PRMM', 'PRPM'] as const) {
    await expect(page.getByTestId(`res-assignment-${code}`)).toHaveAttribute('data-active', 'true')
  }
})
