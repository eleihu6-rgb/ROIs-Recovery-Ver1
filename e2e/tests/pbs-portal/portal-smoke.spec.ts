import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const defaultAuthenticatedSession = {
  user: {
    id: 'u-1',
    name: 'Casey Crew',
    employeeNo: 'F8030',
  },
  authMode: 'password' as const,
}

type MockAuthSessionOptions = {
  expectedToken?: string
  loginResponse?: {
    user: {
      id: string
      name: string
      employeeNo: string
    }
    authMode: 'password'
    token: string
  }
  sessionResponse?: typeof defaultAuthenticatedSession | null
}

test.use({
  storageState: { cookies: [], origins: [] },
})

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const mockAuthSessionApi = async (
  page: Page,
  {
    expectedToken,
    loginResponse = {
      ...defaultAuthenticatedSession,
      token: 'jwt-token',
    },
    sessionResponse = null,
  }: MockAuthSessionOptions = {},
) => {
  let activeSession = sessionResponse
  let activeToken = expectedToken ?? null

  await page.route('**/api/auth/session', async (route) => {
    const method = route.request().method()
    const authHeader = route.request().headers().authorization

    if ((method === 'GET' || method === 'DELETE') && activeToken) {
      await expect(authHeader).toBe(`Bearer ${activeToken}`)
    }

    if (method === 'GET') {
      await fulfillJson(route, activeSession)
      return
    }

    if (method === 'POST') {
      activeSession = {
        user: loginResponse.user,
        authMode: loginResponse.authMode,
      }
      activeToken = loginResponse.token
      await fulfillJson(route, loginResponse)
      return
    }

    if (method === 'DELETE') {
      activeSession = null
      activeToken = null
      await fulfillJson(route, { loggedOut: true })
      return
    }

    await route.fallback()
  })
}

test('PBS-3009 — guests are redirected from /portal to /login with redirect preserved @smoke', async ({ page }) => {
  await mockAuthSessionApi(page)

  await page.goto('portal')

  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'SSO Login' })).toBeVisible()
})

test('PBS-3010 — password login stores the token and redirects to the dashboard @smoke', async ({ page }) => {
  await mockAuthSessionApi(page)

  await page.goto('login')
  await page.getByLabel('User Code').click()
  await page.getByLabel('User Code').fill('casey.crew')
  await page.getByLabel('Password').click()
  await page.getByLabel('Password').fill('super-secret')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Casey Crew' })).toBeVisible()
  await expect(page.getByText(/^BIDDING CALENDAR$/)).toBeVisible()
  await expect
    .poll(async () => page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), AUTH_TOKEN_KEY))
    .toBe('jwt-token')
})

test('PBS-3012 — simulated login uses a clean URL and sends no token body @smoke', async ({ page }) => {
  await mockAuthSessionApi(page)
  let simulatedPostBody: string | null = 'not-called'

  await page.route('**/api/auth/simulated-session', async (route) => {
    simulatedPostBody = route.request().postData()
    await fulfillJson(route, {
      token: 'simulated-jwt-token',
      user: {
        id: 'u-4',
        name: 'Mary Nasso',
        employeeNo: 'B79185',
      },
      authMode: 'simulated',
    })
  })

  await page.goto('login?simulate=1&redirect=%2Fbid')

  await expect.poll(async () => simulatedPostBody).toBeNull()
  await expect(page).toHaveURL(/\/bid$/)
  expect(page.url()).not.toContain('simulateToken')
  expect(page.url()).not.toContain('simulated-jwt-token')
  await expect
    .poll(async () => page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), AUTH_TOKEN_KEY))
    .toBe('simulated-jwt-token')
})

test('PBS-3011 — stored sessions are restored and can be logged out from the dashboard', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'persisted-jwt')
  }, AUTH_TOKEN_KEY)

  await mockAuthSessionApi(page, {
    expectedToken: 'persisted-jwt',
    sessionResponse: defaultAuthenticatedSession,
  })

  await page.goto('dashboard')

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Casey Crew' })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Log out of ROIS Crew?' })).toBeVisible()
  await page.locator('button').filter({ hasText: /^Log Out$/ }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  await expect
    .poll(async () => page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), AUTH_TOKEN_KEY))
    .toBeNull()
})
