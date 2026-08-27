/**
 * Gantt Azure SSO login UI tests.
 *
 * Coverage: SSO button entry + redirect to /auth/sso/login, and `?sso_error=`
 * rendering on the login page. The real Azure SAML round-trip (ACS validation,
 * user matching, JWT issuance) is covered by backend Vitest with a mocked
 * `@node-saml/node-saml` (see live-server/src/routes/auth/sso.test.ts) and must
 * be manually verified on UAT with real Azure credentials.
 */
import { test, expect } from '@playwright/test'

test.describe('Gantt Azure SSO login', () => {
  test('登录页展示 SSO 按钮，点击跳转 sso/login', async ({ page }) => {
    await page.goto('/altair/')
    await expect(page.getByTestId('login-user-code')).toBeVisible()

    const ssoBtn = page.getByTestId('login-sso')
    await expect(ssoBtn).toBeVisible()

    const reqPromise = page.waitForRequest((r) => r.url().includes('/api/auth/sso/login'))
    await ssoBtn.click()
    const req = await reqPromise
    expect(req.method()).toBe('GET')
  })

  test('sso_error 参数渲染错误提示', async ({ page }) => {
    await page.goto('/altair/?sso_error=user_not_found')
    await expect(page.getByTestId('login-error')).toContainText('account is not linked')
  })

  test('SSO 回调 token 在启动阶段完成登录，登录表单不闪现', async ({ page }) => {
    // Mock SSO callback；hold 住响应，把「回调在途期间是否渲染登录页」的窗口暴露出来
    // （回归点：修复前 App 先渲染 LoginPage 再异步 completeSso，这里会闪现登录表单）。
    await page.route('**/api/auth/sso/callback', async (route) => {
      await new Promise((r) => setTimeout(r, 2500))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            token: 'sso-test-token',
            userCode: 'admin',
            userName: 'admin',
            schema: 'f8',
            isAdmin: 1,
            menus: [],
            ctrls: {},
            dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
          },
          message: 'ok',
        }),
      })
    })

    await page.goto('/altair/?token=sso-test-token')

    // 回调 POST 已发出 → 应用正在消费 token
    await page.waitForRequest((r) => r.url().includes('/api/auth/sso/callback') && r.method() === 'POST')

    // 回归断言：回调在途（被 hold 2.5s）期间登录表单不得出现
    await expect(page.getByTestId('login-user-code')).not.toBeVisible()

    // 回调完成后 token 从 URL 移除（SSO 已完成）
    await expect.poll(() => page.url()).not.toContain('token=')
  })
})
