import { test, expect } from '@playwright/test'

// 验证权限管理界面增强（Users 列/编辑、Roles Config、Menus 树）在 worktree 前端 + DEV 后端渲染正常
test('admin System pages render with new UX', async ({ page }) => {
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

  // Users 页：标题 + Dept/Roles 列 + admin 行
  await page.getByTestId('system-nav-user-mgmt').click()
  await page.waitForTimeout(2000)
  await expect(page.getByText('Users / 排班用户')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Department' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'admin', exact: true }).first()).toBeVisible()
  console.log('DIAG users ok, errors=', JSON.stringify(errors))

  // Roles 页：Config 按钮 → RoleConfigDialog（菜单与按钮 tab）
  await page.getByTestId('system-nav-profile-mgmt').click()
  await page.waitForTimeout(1500)
  await expect(page.getByText('Roles / 角色权限')).toBeVisible()
  await page.getByRole('button', { name: 'Config' }).first().click()
  await page.waitForTimeout(1500)
  await expect(page.getByText('Menus & Buttons')).toBeVisible()
  await expect(page.getByText('Data Scope')).toBeVisible()
  console.log('DIAG role config dialog rendered, errors=', JSON.stringify(errors))
  await page.getByRole('button', { name: 'Cancel' }).first().click()
  await page.waitForTimeout(500)

  // Menus 页：左侧树 + 右侧按钮
  await page.getByTestId('system-nav-menu-mgmt').click()
  await page.waitForTimeout(1500)
  await expect(page.getByText('Menus / 菜单管理')).toBeVisible()
  await expect(page.getByTestId('menu-tree-LIVE_ROSTER')).toBeVisible()
  // 点击叶子页面 → 右侧显示按钮
  await page.getByTestId('menu-tree-LIVE_ROSTER').click()
  await page.waitForTimeout(1000)
  await expect(page.getByText('New Button')).toBeVisible()
  console.log('DIAG menus ok, errors=', JSON.stringify(errors))
  expect(errors).toEqual([])
})
