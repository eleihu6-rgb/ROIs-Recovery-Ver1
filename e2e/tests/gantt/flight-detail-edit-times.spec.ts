/**
 * Flight Detail dialog — STD/STA/ATD/ATA edit mode (all four editable, per Ryan's
 * "clone from evacc project" item 1: polish flight-puck "edit flight info" with
 * date/time pickers instead of a raw text field).
 *
 * Real UI login + real clicks through Flight Navi -> COF -> Flight Detail -> Edit
 * (see §Simulate-User). Only the ATA field is mutated (widening the ATD->ATA gap
 * can never violate the "ATA must be after ATD" backend check), and the test
 * restores the original ATA before finishing so the shared dev DB row is left
 * unchanged.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

const USER = TEST_ACCOUNTS.admin

/** Shift an "HH:MM" time by deltaMin, reversing direction if it would cross midnight. */
const shiftTime = (hhmm: string, deltaMin: number): string => {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m
  const forward = total + deltaMin
  const shifted = forward >= 0 && forward < 24 * 60 ? forward : total - deltaMin
  const nh = Math.floor(shifted / 60) % 24
  const nm = shifted % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

const openFirstFlightDetail = async (page: Page, dashboard: GanttDashboardPage): Promise<void> => {
  await dashboard.addFlightPane()
  await page.getByTestId('flight-navi-button').click()
  await expect(page.getByTestId('flight-navi-dialog')).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(async () => page.locator('[data-testid^="navi-cof-"]').count(), {
      message: 'flight navi table never populated a row',
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await page.locator('[data-testid^="navi-cof-"]').first().click()
  await expect(dashboard.flightDetailDialog).toBeVisible({ timeout: 10_000 })
}

test.describe('Flight Detail — edit STD/STA/ATD/ATA', () => {
  test('Live-1720 — Edit ATA via picker, persists, and round-trips back @smoke', async ({ page }) => {
    test.setTimeout(90_000)
    const login = new GanttLoginPage(page)
    await login.goto()
    await login.login(USER.userCode, USER.password)
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await openFirstFlightDetail(page, dashboard)

    const dialog = dashboard.flightDetailDialog
    const editBtn = dialog.getByTestId('flight-detail-edit')
    await expect(editBtn).toBeEnabled({ timeout: 15_000 })

    const originalAta = (await dialog.getByTestId('flight-detail-ata').innerText()).trim()
    expect(originalAta, 'flight has a real ATA to edit').not.toBe('—')

    // Zone map can still be loading right after dialog open — retry the click.
    const ataTimeInput = dialog.getByTestId('flight-detail-ata-time')
    for (let attempt = 0; attempt < 5; attempt++) {
      await editBtn.click()
      if (await ataTimeInput.isVisible({ timeout: 3_000 }).catch(() => false)) break
      await page.waitForTimeout(500)
    }
    await expect(ataTimeInput).toBeVisible({ timeout: 5_000 })
    await expect(ataTimeInput).toHaveValue(originalAta)

    const shifted = shiftTime(originalAta, 15)
    await ataTimeInput.fill(shifted)
    await dialog.getByTestId('flight-detail-edit-save').click()

    await expect(dialog.getByTestId('flight-detail-edit')).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByTestId('flight-detail-ata')).toHaveText(shifted, { timeout: 10_000 })

    // ── Cleanup: restore the original ATA so the shared dev DB row is unchanged.
    await dialog.getByTestId('flight-detail-edit').click()
    await expect(ataTimeInput).toBeVisible({ timeout: 5_000 })
    await expect(ataTimeInput).toHaveValue(shifted)
    await ataTimeInput.fill(originalAta)
    await dialog.getByTestId('flight-detail-edit-save').click()

    await expect(dialog.getByTestId('flight-detail-edit')).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByTestId('flight-detail-ata')).toHaveText(originalAta, { timeout: 10_000 })
  })
})
