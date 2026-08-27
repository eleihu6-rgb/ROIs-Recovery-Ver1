import { test, expect } from '@playwright/test'

// 验证权限管理面板（System → Users/Roles）在 http-client 已解包响应下能正确渲染（回归：ok 二次解包 bug）
test('admin System Users page renders (no map/rows crash)', async ({ page }) => {
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
  // 进入 System → Users
  await page.getByTestId('module-nav-system').click()
  await page.getByTestId('system-nav-user-mgmt').click()
  await page.waitForTimeout(3000)
  // 页面应显示 Users 标题 + 用户表格中含 admin 行
  await expect(page.getByText('Users / 排班用户')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('cell', { name: 'admin', exact: true })).toBeVisible({ timeout: 5000 })
  // 无渲染错误
  expect(errors).toEqual([])
})
