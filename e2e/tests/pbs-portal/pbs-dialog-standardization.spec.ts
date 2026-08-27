import { test, expect, type Locator, type Page } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '247'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'

test.use({ storageState: { cookies: [], origins: [] } })

const login = async (page: Page) => {
  const loginPage = new PbsLoginPage(page)
  await loginPage.goto()
  await loginPage.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })
}

const expectDialogFrame = async (page: Page, dialog: Locator) => {
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  await expect.poll(
    async () => page.evaluate(() => ({
      body: document.body.style.overflow,
      html: document.documentElement.style.overflow,
    })),
    { message: 'PBS dialog should lock background scroll' },
  ).toEqual({ body: 'hidden', html: 'hidden' })

  const box = await dialog.boundingBox()
  const viewport = page.viewportSize()
  expect(box, 'dialog should have a visible bounding box').not.toBeNull()
  expect(viewport, 'viewport size should be available').not.toBeNull()
  if (!box || !viewport) {
    return
  }

  const dialogCenterX = box.x + box.width / 2
  const dialogCenterY = box.y + box.height / 2
  expect(Math.abs(dialogCenterX - viewport.width / 2)).toBeLessThanOrEqual(2)
  expect(Math.abs(dialogCenterY - viewport.height / 2)).toBeLessThanOrEqual(2)
  expect(box.height).toBeLessThanOrEqual(viewport.height - 24)
}

test('PBS dialogs lock background scroll and stay centered for Pairing configure dialogs', async ({ page }) => {
  await login(page)

  await page.goto('pairing')
  await expect(page.getByTestId('pairing-add-properties-workspace')).toBeVisible({ timeout: 120_000 })

  const workspace = page.getByTestId('pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  const search = workspace.getByPlaceholder(/search/i).first()
  if (await search.count()) {
    await search.fill('Any Landing In Airport')
    await page.waitForTimeout(700)
  }

  await expect(workspace.getByText('Any Landing In Airport', { exact: true }).first()).toBeVisible({ timeout: 10_000 })
  await workspace.getByRole('button', { name: 'Add Any Landing In Airport' }).click()

  const dialog = page.getByRole('dialog', { name: 'Configure Any Landing In Airport' })
  await expectDialogFrame(page, dialog)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeVisible()

  const combobox = dialog.getByTestId('pairing-airport-combobox')
  await combobox.click()
  const dropdown = page.getByTestId('pairing-airport-dropdown')
  await expect(dropdown).toBeVisible()

  const dialogBox = await dialog.boundingBox()
  const dropdownBox = await dropdown.boundingBox()
  expect(dialogBox).not.toBeNull()
  expect(dropdownBox).not.toBeNull()
  expect(dropdownBox!.y).toBeGreaterThanOrEqual(dialogBox!.y)
})

test('PBS dialogs lock background scroll and stay centered for Days Off configure dialogs', async ({ page }) => {
  await login(page)

  await page.goto('days-off')
  await expect(page.getByTestId('rule-bid-add-properties-workspace')).toBeVisible({ timeout: 120_000 })

  const workspace = page.getByTestId('rule-bid-add-properties-workspace')
  const allPropertiesTab = workspace.getByRole('button', { name: 'ALL PROPERTIES' })
  if (await allPropertiesTab.count()) {
    await allPropertiesTab.click()
  }
  const search = workspace.getByPlaceholder(/search/i).first()
  if (await search.count()) {
    await search.fill('Dates')
    await page.waitForTimeout(700)
  }

  const datesRow = page.getByTestId('rule-bid-available-row').filter({ hasText: 'Dates' }).first()
  await expect(datesRow).toBeVisible({ timeout: 10_000 })
  await datesRow.getByRole('button').first().click()

  const dialog = page.getByRole('dialog', { name: 'Configure Dates' })
  await expectDialogFrame(page, dialog)
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeVisible()
})
