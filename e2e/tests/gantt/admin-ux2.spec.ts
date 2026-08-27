import { test, expect } from '@playwright/test'

// 验证 admin UX2：Menus 树（无 ROOT/图标/折叠）、Roles 左列表→右配置、PBS Users 数据
test('admin UX2 renders', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
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

  // PBS Users 有数据（修复空表）
  await page.getByTestId('system-nav-pbs-user-mgmt').click()
  await page.waitForTimeout(2000)
  await expect(page.getByRole('heading', { name: 'PBS Users' })).toBeVisible()
  const pbsRows = await page.locator('tbody tr').count()
  console.log('DIAG pbs rows=', pbsRows)
  expect(pbsRows).toBeGreaterThan(0)

  // Menus 树：无 ROOT、图标、折叠、点叶子显示按钮
  await page.getByTestId('system-nav-menu-mgmt').click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('heading', { name: 'Menus' })).toBeVisible()
  await expect(page.getByTestId('menu-tree-ROOT')).toHaveCount(0) // ROOT 隐藏
  await expect(page.getByTestId('menu-tree-LIVE')).toBeVisible()
  await page.getByTestId('menu-tree-LIVE_ROSTER').click()
  await page.waitForTimeout(1000)
  await expect(page.getByText('New Button')).toBeVisible()
  console.log('DIAG menus ok, errors=', JSON.stringify(errors))

  // Roles 左列表 → 点击 → 右配置
  await page.getByTestId('system-nav-profile-mgmt').click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
  await page.getByRole('row', { name: /Administrator/ }).click()
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('role-config-pane')).toBeVisible()
  await expect(page.getByText('Menus & Buttons')).toBeVisible()
  await expect(page.getByText('Data Scope')).toBeVisible()
  console.log('DIAG roles pane ok, errors=', JSON.stringify(errors))
  expect(errors).toEqual([])
})
