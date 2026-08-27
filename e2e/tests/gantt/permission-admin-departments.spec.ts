/**
 * Regression: System → Departments
 *
 *  - Division must be editable in both New and Edit dialogs (was: only shown in
 *    the table, not settable).
 *  - Parent must be a dropdown of existing departments (was: free-text input
 *    that users could mistype).
 *  - Self-parent cycle is impossible: edit's parent dropdown excludes the row
 *    being edited.
 *  - Same applies to Crew Departments (separate kind).
 *  - Division options must come from the dictionary (DIVISION) — no hardcoded
 *    P/C/A in the dropdown. The test reads whatever the dictionary returns so
 *    that adding a new division (e.g. 'G' for Ground) does not break the UI.
 *
 * Test scope:
 *  1. Navigate to System → Departments.
 *  2. Assert the New Dept Division dropdown exposes ≥2 options from the
 *     DIVISION dictionary.
 *  3. Create a User dept with division=first dictionary value, parent=none.
 *  4. Create a User dept with division=second dictionary value, parent=the
 *     first dept.
 *  5. Edit the second dept: switch division to the first dictionary value
 *     (different from current) and clear parent; assert row reflects both.
 *     Assert edit does not offer the row being edited as a parent.
 *  6. Switch to Crew Dept tab, create + edit a crew dept (different scope).
 *     Assert the new-edit parent dropdown does NOT include user depts.
 */
import { test, expect, type Page } from '@playwright/test'

async function gotoDepartmentsPanel(page: Page) {
  await page.goto('/')
  const signIn = page.getByTestId('login-sign-in')
  if (await signIn.isVisible().catch(() => false)) {
    await page.getByTestId('login-user-code').fill('admin')
    await page.getByTestId('login-password').fill('123456')
    await signIn.click()
    await page.waitForTimeout(4000)
  }
  await page.getByTestId('module-nav-system').click()
  await page.waitForTimeout(1500)
  await page.getByTestId('system-nav-dept-mgmt').click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('button', { name: 'New Dept' })).toBeVisible({ timeout: 15_000 })
}

/** Select a parent option by its branchCode value (returns its display label). */
async function pickParent(page: Page, scope: 'new' | 'edit', code: string): Promise<{ code: string; label: string } | null> {
  const select = page.getByTestId(scope === 'new' ? 'new-dept-parent' : 'edit-dept-parent')
  const optionCount = await select.locator(`option[value="${code}"]`).count()
  if (optionCount === 0) return null
  await select.selectOption(code)
  const label = (await select.locator(`option[value="${code}"]`).textContent())?.trim() ?? code
  return { code, label }
}

/** Read all parent option values for self-parent / cross-kind guards. */
async function parentOptionValues(page: Page, scope: 'new' | 'edit'): Promise<string[]> {
  const select = page.getByTestId(scope === 'new' ? 'new-dept-parent' : 'edit-dept-parent')
  return select.locator('option').evaluateAll((els) =>
    els.map((el) => (el as HTMLOptionElement).value),
  )
}

async function pickDivision(page: Page, scope: 'new' | 'edit', index: 0 | 1): Promise<{ code: string; label: string }> {
  const select = page.getByTestId(scope === 'new' ? 'new-dept-division' : 'edit-dept-division')
  const options = await select.locator('option').evaluateAll((els) =>
    els.map((el) => {
      const opt = el as HTMLOptionElement
      return { value: opt.value, label: opt.textContent?.trim() ?? opt.value }
    }),
  )
  // Drop the placeholder (empty value); everything else is a real division from
  // the DIVISION dictionary.
  const real = options.filter((o) => o.value !== '')
  expect(real.length, `Division dropdown must expose ≥2 dictionary options (got ${real.length})`).toBeGreaterThan(1)
  const picked = real[index]!
  await select.selectOption(picked.value)
  return { code: picked.value, label: picked.label }
}

async function getDeptRow(page: Page, code: string) {
  return page.getByTestId(`dept-row-${code}`)
}

test('permission admin Departments: division + parent dropdown work for user and crew kinds', async ({ page }) => {
  const stamp = Date.now()
  const userDeptA = `t_ud_a_${stamp}` // top-level, division = first dictionary entry
  const userDeptB = `t_ud_b_${stamp}` // child of A, division = second dictionary entry
  const crewDeptA = `t_cd_a_${stamp}` // top-level, division = first dictionary entry

  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await gotoDepartmentsPanel(page)

  // ——— Division dropdown must reflect the DIVISION dictionary, not hardcoded ———
  // Pre-flight: open the New dialog once to read what the dictionary offers.
  await page.getByRole('button', { name: 'New Dept' }).click()
  await expect(page.getByTestId('new-dept-dialog')).toBeVisible()
  const divA = await pickDivision(page, 'new', 0)
  const divB = await pickDivision(page, 'new', 1)
  // We need at least 2 distinct division values to exercise the edit-switch
  // path; the dictionary has P + C in dev (and adds A=Airmarshal in UAT). If
  // the env only seeds one, this test isn't meaningful and we skip.
  if (divA.code === divB.code) {
    test.skip(true, `DIVISION dictionary only exposes one unique value (${divA.code}); cannot exercise edit-switch`)
    return
  }
  // For edit, switch back to divA so the round-trip is "saved as B → edited to A".
  await page.getByTestId('new-dept-code').fill(userDeptA)
  await page.getByTestId('new-dept-name').fill(`Test User Dept A ${stamp}`)
  // Division currently selected = divB (last pickDivision call); bring it back
  // to divA so userDeptA persists with the first dictionary value.
  await pickDivision(page, 'new', 0)
  // parent left at "" (top level)
  await page.getByTestId('new-dept-save').click()
  await expect(page.getByTestId('new-dept-dialog')).not.toBeVisible({ timeout: 10_000 })

  const rowA = await getDeptRow(page, userDeptA)
  await expect(rowA).toBeVisible({ timeout: 10_000 })
  await expect(rowA.locator('[data-testid^="dept-division-"]')).toContainText(divA.code)
  await expect(rowA.locator('[data-testid^="dept-parent-"]')).toContainText('-')

  // 2) Create userDeptB (child of A, division = second dictionary entry)
  await page.getByRole('button', { name: 'New Dept' }).click()
  await expect(page.getByTestId('new-dept-dialog')).toBeVisible()
  await page.getByTestId('new-dept-code').fill(userDeptB)
  await page.getByTestId('new-dept-name').fill(`Test User Dept B ${stamp}`)
  const parentA = await pickParent(page, 'new', userDeptA)
  expect(parentA?.code).toBe(userDeptA)
  await pickDivision(page, 'new', 1)
  await page.getByTestId('new-dept-save').click()
  await expect(page.getByTestId('new-dept-dialog')).not.toBeVisible({ timeout: 10_000 })

  const rowB = await getDeptRow(page, userDeptB)
  await expect(rowB).toBeVisible({ timeout: 10_000 })
  await expect(rowB.locator('[data-testid^="dept-division-"]')).toContainText(divB.code)
  await expect(rowB.locator('[data-testid^="dept-parent-"]')).toContainText(userDeptA)

  // 3) Edit userDeptB: switch division back to divA (≠ current) + clear parent
  await rowB.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByTestId(`edit-dept-dialog-${userDeptB}`)).toBeVisible()
  // Division preselected to whatever we saved (divB), parent preselected to userDeptA
  await expect(page.getByTestId('edit-dept-division')).toHaveValue(divB.code)
  await expect(page.getByTestId('edit-dept-parent')).toHaveValue(userDeptA)

  // Self-parent guard: userDeptB must NOT appear in its own parent dropdown
  const editParentOptions = await parentOptionValues(page, 'edit')
  expect(editParentOptions, 'self-parent cycle guard').not.toContain(userDeptB)

  // Switch division back to divA (the *other* dictionary value) + clear parent
  await pickDivision(page, 'edit', 0)
  await page.getByTestId('edit-dept-parent').selectOption('')
  await page.getByTestId(`edit-dept-save-${userDeptB}`).click()
  await expect(page.getByTestId(`edit-dept-dialog-${userDeptB}`)).not.toBeVisible({ timeout: 10_000 })
  await expect(rowB.locator('[data-testid^="dept-division-"]')).toContainText(divA.code)
  await expect(rowB.locator('[data-testid^="dept-parent-"]')).toContainText('-')

  // ——— Crew Dept: same code path, different scope ———
  await page.getByTestId('dept-tab-crew').click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'New Dept' }).click()
  await expect(page.getByTestId('new-dept-dialog')).toBeVisible()
  await page.getByTestId('new-dept-code').fill(crewDeptA)
  await page.getByTestId('new-dept-name').fill(`Test Crew Dept A ${stamp}`)
  await pickDivision(page, 'new', 0)
  await page.getByTestId('new-dept-save').click()
  await expect(page.getByTestId('new-dept-dialog')).not.toBeVisible({ timeout: 10_000 })

  const crewRowA = await getDeptRow(page, crewDeptA)
  await expect(crewRowA).toBeVisible({ timeout: 10_000 })
  await expect(crewRowA.locator('[data-testid^="dept-division-"]')).toContainText(divA.code)
  await expect(crewRowA.locator('[data-testid^="dept-parent-"]')).toContainText('-')

  // Crew dept parent dropdown must NOT see user depts (different kind)
  await crewRowA.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByTestId(`edit-dept-dialog-${crewDeptA}`)).toBeVisible()
  const crewParentOptions = await parentOptionValues(page, 'edit')
  expect(crewParentOptions, 'crew dept parent dropdown must not show user depts').not.toContain(userDeptA)
  expect(crewParentOptions, 'crew dept parent dropdown must not show crew dept being edited').not.toContain(crewDeptA)
  // Cancel (no edit needed for this row)
  await page.getByRole('button', { name: 'Cancel' }).first().click()
  await expect(page.getByTestId(`edit-dept-dialog-${crewDeptA}`)).not.toBeVisible()

  expect(pageErrors, `unexpected page errors: ${pageErrors.join('; ')}`).toEqual([])
})
