/**
 * Flight Detail dialog — Fleet/Register edit (bundled into the existing "Edit" flow)
 * and Cancel/Restore Flight (per Ryan's "add fleet and cancel in the same flight info
 * edit ui, all in one to manage flight" request).
 *
 * Real UI login + real clicks through Flight Navi -> COF -> Flight Detail -> Edit / Cancel
 * (see §Simulate-User). Both tests restore the flight to its original state before
 * finishing so the shared dev DB row is left unchanged (§Remote-DB-Only).
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

const USER = TEST_ACCOUNTS.admin

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

/** "FLEET · REGISTER" (or just "FLEET" when no register) -> { fleet, register }. */
const parseFleetLine = (text: string): { fleet: string; register: string } => {
  const [fleet, register = ''] = text.split(' · ')
  return { fleet: fleet.trim(), register: register.trim() }
}

test.describe('Flight Detail — Fleet edit & Cancel/Restore', () => {
  test('Live-1721 — Edit Fleet/Register via the same edit flow, persists, and round-trips back @smoke', async ({ page }) => {
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

    const originalLine = (await dialog.getByTestId('flight-detail-fleet').innerText()).trim()
    const original = parseFleetLine(originalLine)
    expect(original.fleet, 'flight has a real fleet to edit').not.toBe('')

    const fleetInput = dialog.getByTestId('flight-detail-fleet-input')
    for (let attempt = 0; attempt < 5; attempt++) {
      await editBtn.click()
      if (await fleetInput.isVisible({ timeout: 3_000 }).catch(() => false)) break
      await page.waitForTimeout(500)
    }
    await expect(fleetInput).toBeVisible({ timeout: 5_000 })
    await expect(fleetInput).toHaveValue(original.fleet)

    const registerInput = dialog.getByTestId('flight-detail-register-input')
    await expect(registerInput).toHaveValue(original.register)

    const newFleet = `${original.fleet}X`
    const newRegister = 'B-TEST'
    await fleetInput.fill(newFleet)
    await registerInput.fill(newRegister)
    await dialog.getByTestId('flight-detail-edit-save').click()

    await expect(dialog.getByTestId('flight-detail-edit')).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByTestId('flight-detail-fleet')).toHaveText(`${newFleet} · ${newRegister}`, { timeout: 10_000 })

    // ── Cleanup: restore the original fleet/register so the shared dev DB row is unchanged.
    await dialog.getByTestId('flight-detail-edit').click()
    await expect(fleetInput).toBeVisible({ timeout: 5_000 })
    await expect(fleetInput).toHaveValue(newFleet)
    await fleetInput.fill(original.fleet)
    await registerInput.fill(original.register)
    await dialog.getByTestId('flight-detail-edit-save').click()

    await expect(dialog.getByTestId('flight-detail-edit')).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByTestId('flight-detail-fleet')).toHaveText(originalLine, { timeout: 10_000 })
  })

  test('Live-1722 — Cancel Flight requires confirm, updates Status badge, and Restore reverts it @smoke', async ({ page }) => {
    test.setTimeout(90_000)
    const login = new GanttLoginPage(page)
    await login.goto()
    await login.login(USER.userCode, USER.password)
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await openFirstFlightDetail(page, dashboard)

    const dialog = dashboard.flightDetailDialog
    const cancelBtn = dialog.getByTestId('flight-detail-cancel-flight')
    await expect(cancelBtn).toBeVisible({ timeout: 15_000 })
    await expect(cancelBtn).toBeEnabled()

    const originalStatus = (await dialog.getByTestId('flight-detail-ops-status').innerText()).trim()
    expect(originalStatus, 'flight starts out not cancelled').not.toBe('Cancelled')

    // Status badge text is visually upper-cased via CSS (text-transform) — match the
    // underlying DOM text case-insensitively rather than the rendered glyphs.
    const originalStatusRe = new RegExp(`^${originalStatus}$`, 'i')

    // First click only arms the confirm — flight must NOT be cancelled yet.
    await cancelBtn.click()
    await expect(cancelBtn).toHaveText(/Confirm Cancel\?/, { timeout: 5_000 })
    await expect(dialog.getByTestId('flight-detail-ops-status')).toHaveText(originalStatusRe)

    // Second click actually cancels.
    await cancelBtn.click()
    const restoreBtn = dialog.getByTestId('flight-detail-restore')
    await expect(restoreBtn).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByTestId('flight-detail-ops-status')).toHaveText(/^Cancelled$/i, { timeout: 10_000 })

    // ── Cleanup: restore so the shared dev DB row is unchanged.
    await restoreBtn.click()
    await expect(dialog.getByTestId('flight-detail-cancel-flight')).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByTestId('flight-detail-ops-status')).toHaveText(originalStatusRe, { timeout: 10_000 })
  })
})
