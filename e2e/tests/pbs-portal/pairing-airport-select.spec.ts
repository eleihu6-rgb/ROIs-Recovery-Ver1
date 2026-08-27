/**
 * PBS-3326 — Airport Preference location picker opens from anywhere in its field.
 *
 * Regression for airport-preference-editor.tsx: the dropdown must open when the
 * user clicks the empty left side of the field, not only the right-aligned
 * "Select airports…" label.
 */
import { test, expect } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '247'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'
const PROPERTY_NAME = 'Airport Preference'
const PAIRING_NUMBER_PROPERTY_NAME = 'Pairing Number'

test.use({ storageState: { cookies: [], origins: [] } })

test('PBS-3326 — airport preference location picker opens when clicking the full field', async ({ page }) => {
  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

  await page.goto('bid')
  const workspace = page.getByTestId('bid-page')
  await expect(workspace).toBeVisible({ timeout: 120_000 })
  await workspace.getByRole('tab', { name: 'PAIRING' }).click()
  const search = workspace.getByPlaceholder('Search Bid Properties')
  await search.fill(PROPERTY_NAME)
  await page.waitForTimeout(700)

  const propertyLabel = workspace.getByText(PROPERTY_NAME, { exact: true }).first()
  await expect(propertyLabel).toBeVisible({ timeout: 10_000 })
  await workspace.getByRole('button', { name: `Add ${PROPERTY_NAME}` }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog).toContainText(PROPERTY_NAME)
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByText('Minimum Required')).toHaveCount(0)
  await expect(dialog.getByText('Maximum Required')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Landing', exact: true }).click()
  const combobox = dialog.getByRole('combobox', { name: `${PROPERTY_NAME} airports or cities` })
  await expect(combobox).toBeVisible()
  await expect(page.getByLabel('Filter airports or cities')).not.toBeVisible()

  const box = await combobox.boundingBox()
  expect(box).not.toBeNull()
  if (!box) {
    return
  }

  // Click the left quarter of the field — away from the right-aligned placeholder.
  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height / 2)

  const filter = page.getByLabel('Filter airports or cities')
  const dropdown = page.getByRole('listbox')
  await expect(filter).toBeVisible({ timeout: 5_000 })
  await expect(dropdown).toBeVisible()
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)

  const dropdownBox = await dropdown.boundingBox()
  expect(dropdownBox, 'airport dropdown should have a visible bounding box').not.toBeNull()
  expect(dropdownBox!.y).toBeGreaterThanOrEqual(box.y + box.height - 1)
})

test('PBS-PairingNumber — pairing number autocomplete opens as a foreground dropdown below the field', async ({ page }) => {
  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

  await page.goto('pairing')
  await expect(page.getByTestId('pairing-add-properties-workspace')).toBeVisible({ timeout: 120_000 })

  const workspace = page.getByTestId('pairing-add-properties-workspace')
  await workspace.getByRole('button', { name: 'ALL PROPERTIES' }).click()
  const search = workspace.getByPlaceholder(/search/i).first()
  if (await search.count()) {
    await search.fill(PAIRING_NUMBER_PROPERTY_NAME)
    await page.waitForTimeout(700)
  }

  await expect(workspace.getByText(PAIRING_NUMBER_PROPERTY_NAME, { exact: true }).first()).toBeVisible({ timeout: 10_000 })
  await workspace.getByRole('button', { name: `Add ${PAIRING_NUMBER_PROPERTY_NAME}` }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog).toContainText(PAIRING_NUMBER_PROPERTY_NAME)

  const bidInput = dialog.getByLabel(`BID ${PAIRING_NUMBER_PROPERTY_NAME}`)
  await bidInput.fill('4')

  const autocomplete = page.getByTestId('pairing-tag-list-autocomplete')
  await expect(autocomplete).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('listbox')).toBeVisible()

  const inputBox = await bidInput.boundingBox()
  const autocompleteBox = await autocomplete.boundingBox()
  expect(inputBox, 'Pairing Number input should have a visible bounding box').not.toBeNull()
  expect(autocompleteBox, 'Pairing Number autocomplete should have a visible bounding box').not.toBeNull()
  expect(autocompleteBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height - 1)
})
