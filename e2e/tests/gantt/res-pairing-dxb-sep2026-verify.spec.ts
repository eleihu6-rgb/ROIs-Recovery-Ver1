import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

/**
 * Read-only visual verification (§PW-Snapshot) of the DXB Sep-2026 RES pairing
 * seed done via res-pairing-dxb-sep2026-seed.spec.ts. Opens the RES Pairing
 * Planner's Manage tab (read-only list), filters to base=DXB / division=Pilot,
 * and screenshots the result so the created PRAM/PRPM rows are visually
 * inspectable. No writes performed here.
 */

test('DXB Sep-2026 RES pairings visible in Manage tab (visual verification)', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()

  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible()

  await page.getByTestId('res-tab-manage').click()
  await page.getByTestId('manage-filter-base').selectOption('DXB')
  await page.getByTestId('manage-filter-division').selectOption('P')
  await page.getByTestId('manage-filter-load').click()

  await expect(page.getByTestId('manage-summary-total')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('manage-summary-total')).toContainText('60')

  const dialog = page.getByTestId('res-planner-dialog')
  await page.waitForTimeout(300) // let the row list settle visually before capture
  await dialog.screenshot({ path: '../docs/assets/screenshots/gantt/res-pairing-dxb-sep2026-Ver1.png' })
})
