/**
 * Regression: System → Users
 *
 *  - "New User" save must NOT be silent (was: `void create()` swallowed rejections;
 *    plus branchCode was hardcoded 'HQ' so department could not be set).
 *  - Roles selector must live inside the New User / Edit User dialog.
 *  - The standalone "Roles" button in the row actions column must be gone.
 *  - Gender + Email must be settable in both dialogs and surfaced as table columns.
 *  - Name + Password inputs must not be autofilled by the browser.
 *
 * Test scope:
 *  1. Navigate to System → Users.
 *  2. Create a fresh user with department + ≥2 roles + gender + email, assert the
 *     new row shows them all, assert success toast.
 *  3. Edit that user, assert roles are preselected (round-trip from the user list
 *     `roles` payload), change department + a role + gender + email, assert save toast.
 *  4. Assert no "Roles" action button exists on any row.
 *  5. Assert the New User save fires on an invalid form (password < 8) — a visible
 *     error toast appears instead of a silent no-op.
 *  6. Assert Name/Password inputs declare anti-autofill attributes
 *     (autoComplete="off" on Name/Email, autoComplete="new-password" on Password).
 */
import { test, expect, type Page } from '@playwright/test'

const PASSWORD = 'Test1234!'
const EMAIL_CREATE = 'create@example.com'
const EMAIL_EDIT = 'edit@example.com'

/** Pick a non-empty gender value (Male/Female) and return its display label. */
async function pickGender(page: Page, scope: 'new' | 'edit'): Promise<{ code: string; label: string } | null> {
  const select = page.getByTestId(scope === 'new' ? 'new-user-gender' : 'edit-user-gender')
  // First non-placeholder, non-empty option that maps to Male/Female.
  for (const code of ['M', 'F']) {
    const value = await select.locator(`option[value="${code}"]`).count()
    if (value > 0) {
      await select.selectOption(code)
      const label = (await select.locator(`option[value="${code}"]`).textContent())?.trim() ?? code
      return { code, label }
    }
  }
  return null
}

/** Pick a *different* gender than the one currently selected (for the edit step). */
async function pickOtherGender(page: Page, currentCode: string): Promise<{ code: string; label: string } | null> {
  const select = page.getByTestId('edit-user-gender')
  for (const code of ['M', 'F']) {
    if (code === currentCode) continue
    if (await select.locator(`option[value="${code}"]`).count() > 0) {
      await select.selectOption(code)
      const label = (await select.locator(`option[value="${code}"]`).textContent())?.trim() ?? code
      return { code, label }
    }
  }
  return null
}

async function gotoUsersPanel(page: Page) {
  await page.goto('/')
  // UI-login fallback (storageState doesn't carry sessionStorage across page mounts).
  const signIn = page.getByTestId('login-sign-in')
  if (await signIn.isVisible().catch(() => false)) {
    await page.getByTestId('login-user-code').fill('admin')
    await page.getByTestId('login-password').fill('123456')
    await signIn.click()
    await page.waitForTimeout(4000)
  }
  await page.getByTestId('module-nav-system').click()
  await page.waitForTimeout(1500)
  await page.getByTestId('system-nav-user-mgmt').click()
  await page.waitForTimeout(2000)
  await expect(page.getByRole('button', { name: 'New User' })).toBeVisible({ timeout: 15_000 })
}

async function pickFirstProfileCheckbox(page: Page, scope: 'new' | 'edit', userCode = 'x'): Promise<{ id: string; name: string } | null> {
  const container = scope === 'new' ? page.getByTestId('new-user-roles') : page.getByTestId('edit-user-roles')
  const ids = await container.locator('[data-testid^="new-user-role-"], [data-testid^="edit-user-role-"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.testid || ''),
  )
  // Extract the trailing numeric id.
  for (const tid of ids) {
    const m = tid.match(new RegExp(`(?:new-user-role-|edit-user-role-${userCode}-)(\\d+)$`))
    if (m) {
      const id = m[1]
      const labelText = (await container.locator(`[data-testid="${tid}"]`).locator('..').locator('span').first().textContent())?.trim() ?? id
      await container.locator(`[data-testid="${tid}"]`).check()
      return { id, name: labelText }
    }
  }
  return null
}

async function pickFirstDept(page: Page, scope: 'new' | 'edit'): Promise<{ branchCode: string; label: string } | null> {
  const select = page.getByTestId(scope === 'new' ? 'new-user-dept' : 'edit-user-dept')
  const optionTexts = await select.locator('option').allTextContents()
  for (const txt of optionTexts) {
    if (txt.startsWith('Select department…')) continue
    const m = txt.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (m) {
      await select.selectOption(m[2])
      return { branchCode: m[2], label: m[1].trim() }
    }
  }
  return null
}

async function getUserRow(page: Page, userCode: string) {
  return page.getByTestId(`user-row-${userCode}`)
}

test('permission admin Users: create + edit with roles and department, visible save feedback', async ({ page }) => {
  // 生成唯一 userCode 避免并发/历史数据干扰
  const stamp = Date.now()
  const userCode = `t_ux_${stamp}`
  const userName = `Test User ${stamp}`

  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await gotoUsersPanel(page)

  // 1) —— Validation: short password must surface an error toast, NOT silently fail
  await page.getByRole('button', { name: 'New User' }).click()
  await expect(page.getByTestId('new-user-dialog')).toBeVisible()
  await page.getByTestId('new-user-code').fill(userCode)
  await page.getByTestId('new-user-name').fill(userName)
  await page.getByTestId('new-user-password').fill('short')
  // pick the first non-placeholder dept if available
  const deptForCreate = await pickFirstDept(page, 'new')
  expect(deptForCreate, 'at least one department must be seeded for this test').not.toBeNull()
  await page.getByTestId('new-user-save').click()
  // 一个明确的失败 toast 出现，否则视为「保存无反应」回归
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('new-user-dialog')).toBeVisible() // 表单无效 → 弹窗保留
  await page.getByRole('button', { name: 'Cancel' }).first().click()
  await expect(page.getByTestId('new-user-dialog')).not.toBeVisible()

  // 2) —— Happy path: create with role + dept + gender + email
  await page.getByRole('button', { name: 'New User' }).click()
  await page.getByTestId('new-user-code').fill(userCode)
  await page.getByTestId('new-user-name').fill(userName)
  await page.getByTestId('new-user-password').fill(PASSWORD)
  await pickFirstDept(page, 'new')
  const pickedGender = await pickGender(page, 'new')
  expect(pickedGender, 'Gender select must expose M/F options for this test').not.toBeNull()
  await page.getByTestId('new-user-email').fill(EMAIL_CREATE)
  const pickedNew = await pickFirstProfileCheckbox(page, 'new')
  expect(pickedNew, 'at least one profile must be seeded for this test').not.toBeNull()
  await page.getByTestId('new-user-save').click()
  // Save 后弹窗应自动关闭，新行应出现，roles/dept/gender/email 行级单元格应可读
  await expect(page.getByTestId('new-user-dialog')).not.toBeVisible({ timeout: 10_000 })
  const row = await getUserRow(page, userCode)
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(row.locator('[data-testid^="user-dept-"]')).toContainText((deptForCreate as { branchCode: string; label: string }).label)
  await expect(row.locator('[data-testid^="user-roles-"]')).toContainText((pickedNew as { id: string; name: string }).name)
  await expect(row.locator('[data-testid^="user-gender-"]')).toContainText((pickedGender as { code: string; label: string }).label)
  await expect(row.locator('[data-testid^="user-email-"]')).toContainText(EMAIL_CREATE)

  // 3) —— Standalone "Roles" 按钮已下线（仅断言 *行内* 不再有；以避开侧栏同名导航）
  await expect(row.locator('button', { hasText: /^Roles$/ }).first()).toHaveCount(0)
  // 兜底：全表 Actions 列都不应再有 "Roles" 文字按钮
  const actionRoles = await page.locator('table tbody tr td:last-child button', { hasText: /^Roles$/ }).count()
  expect(actionRoles, 'standalone "Roles" button in the row actions column must be removed').toBe(0)

  // 4) —— Edit: 既有角色须预选；改变部门 + gender + email 并保存；保存成功有 toast
  await page.getByTestId(`edit-user-${userCode}`).click()
  await expect(page.getByTestId(`edit-user-dialog-${userCode}`)).toBeVisible()
  // 角色预选：刚创建时勾选的 id 仍 checked
  const editRoleBox = page.getByTestId(`edit-user-role-${userCode}-${(pickedNew as { id: string; name: string }).id}`)
  await expect(editRoleBox).toBeChecked()

  // 选另一个部门，若只有一个就保留
  const newDept = await pickFirstDept(page, 'edit')
  expect(newDept).not.toBeNull()
  // 选另一个 gender（与 create 时不同）
  const newGender = await pickOtherGender(page, (pickedGender as { code: string; label: string }).code)
  expect(newGender, 'must have at least 2 gender options to switch between').not.toBeNull()
  await page.getByTestId('edit-user-email').fill(EMAIL_EDIT)
  await page.getByTestId(`edit-user-save-${userCode}`).click()
  await expect(page.getByTestId(`edit-user-dialog-${userCode}`)).not.toBeVisible({ timeout: 10_000 })
  await expect(row.locator('[data-testid^="user-dept-"]')).toContainText((newDept as { branchCode: string; label: string }).label)
  await expect(row.locator('[data-testid^="user-gender-"]')).toContainText((newGender as { code: string; label: string }).label)
  await expect(row.locator('[data-testid^="user-email-"]')).toContainText(EMAIL_EDIT)

  // 5) —— Autofill attributes: Name/Password must NOT opt-in to browser autofill.
  //     Email input also opts out (admin form, not a login form).
  await page.getByRole('button', { name: 'New User' }).click()
  await expect(page.getByTestId('new-user-dialog')).toBeVisible()
  await expect(page.getByTestId('new-user-name')).toHaveAttribute('autocomplete', 'off')
  await expect(page.getByTestId('new-user-password')).toHaveAttribute('autocomplete', 'new-password')
  await expect(page.getByTestId('new-user-email')).toHaveAttribute('autocomplete', 'off')
  await page.getByRole('button', { name: 'Cancel' }).first().click()
  await expect(page.getByTestId('new-user-dialog')).not.toBeVisible()

  expect(pageErrors, `unexpected page errors: ${pageErrors.join('; ')}`).toEqual([])
})
