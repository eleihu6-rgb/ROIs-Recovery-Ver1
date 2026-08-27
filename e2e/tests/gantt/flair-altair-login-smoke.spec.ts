import { expect, test } from '@playwright/test'

const userCode = process.env.GANTT_TEST_USER ?? 'Ryan'
const password = process.env.GANTT_TEST_PASS ?? ''
const liveApiBase = process.env.GANTT_LIVE_API_BASE ?? '/altair/live'

test('Altair route supports basic login', async ({ page, request }) => {
  expect(password, 'GANTT_TEST_PASS must be provided via environment or GitHub Secrets').toBeTruthy()

  const shell = await request.get('/altair/')
  expect(shell.status()).toBe(200)

  const loginResponse = await request.post(`${liveApiBase}/api/auth/login`, {
    data: { userCode, password },
  })
  expect(loginResponse.status()).toBe(200)

  const payload = await loginResponse.json()
  const token = payload.data?.token ?? payload.token
  expect(token).toBeTruthy()

  await page.addInitScript(({ auth }) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify(auth))
  }, {
    auth: {
      token,
      user: {
        userCode,
        userName: payload.data?.userName ?? payload.userName ?? userCode,
        schema: payload.data?.schema ?? payload.schema ?? 'f8',
      },
    },
  })

  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Bad Gateway')
  await expect(page.locator('body')).not.toContainText('Request failed with status code 500')
})
