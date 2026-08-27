import { test, expect } from '@playwright/test'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login — browser credential autofill', () => {
  test('username + password allow sectioned autofill and sync silent DOM values', async ({ page }) => {
    // Fresh context (no seeded auth) → the login page renders.
    await page.goto(`${BASE}/altair/`)

    const user = page.getByTestId('login-user-code')
    await expect(user).toBeVisible({ timeout: 20_000 })
    await expect(user).toHaveAttribute('type', 'text')
    await expect(user).toHaveAttribute('name', 'altairUserCode')
    await expect(user).toHaveAttribute('id', 'login-username')
    await expect(user).toHaveAttribute('autocomplete', 'section-altair username')
    await expect(user).not.toHaveAttribute('readonly', '')

    const pass = page.getByTestId('login-password')
    await expect(pass).toHaveAttribute('type', 'password')
    await expect(pass).toHaveAttribute('name', 'altairPassword')
    await expect(pass).toHaveAttribute('id', 'login-password')
    await expect(pass).toHaveAttribute('autocomplete', 'section-altair current-password')
    await expect(pass).not.toHaveAttribute('readonly', '')

    const form = page.locator('form#altair-login-form')
    await expect(form).toHaveCount(1)
    await expect(form).toHaveAttribute('name', 'altair-login-form')
    await expect(form).toHaveAttribute('action', /\/altair\/live\/api\/auth\/login$/)
    await expect(form).toHaveAttribute('autocomplete', 'on')
    await expect(form).toHaveAttribute('method', 'post')
    await expect(form.locator('input[name="altairUserCode"]')).toHaveCount(1)
    await expect(form.locator('input[name="altairPassword"]')).toHaveCount(1)
    await expect(page.locator('label[for="login-username"]')).toHaveCount(1)
    await expect(page.locator('label[for="login-password"]')).toHaveCount(1)

    await page.evaluate(() => {
      const userInput = document.querySelector<HTMLInputElement>('input[name="altairUserCode"]')
      const passwordInput = document.querySelector<HTMLInputElement>('input[name="altairPassword"]')
      if (!userInput || !passwordInput) throw new Error('Login fields are missing')
      userInput.value = 'Ryan'
      passwordInput.value = 'Our2027'
    })

    await page.waitForTimeout(300)
    await page.getByTestId('login-show-hide').click()
    await expect(user).toHaveValue('Ryan')
    await expect(pass).toHaveValue('Our2027')
    await expect(page.getByTestId('login-sign-in')).toBeEnabled()
  })
})
