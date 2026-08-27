import { expect, type Page, type Route } from '@playwright/test'

export const PBS_PORTAL_AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const defaultAuthenticatedSession = {
  user: {
    id: 'u-help',
    name: 'Help Crew',
    employeeNo: 'F8099',
  },
  authMode: 'password' as const,
}

const categoryForTopic = (slug: string): string => {
  if (slug === 'portal-overview' || slug === 'before-you-begin' || slug === 'complete-a-bid') return 'quick-start'
  if (slug.startsWith('dashboard')) return 'dashboard'
  if (slug.startsWith('bid-conditions')) return 'bid-conditions'
  if (slug.startsWith('bid-')) return 'bid'
  if (slug.startsWith('pairing')) return 'bid'
  if (slug.startsWith('reserve')) return 'reserve'
  if (slug.startsWith('standing-bid')) return 'standing-bid'
  if (slug.startsWith('award')) return 'award'
  if (slug === 'common-questions') return 'common-questions'
  throw new Error(`No Help category is registered for topic: ${slug}`)
}

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

export const mockAuthenticatedPortalSession = async (page: Page, token = 'help-jwt') => {
  await page.addInitScript(
    ({ storageKey, storedToken }) => {
      window.sessionStorage.setItem(storageKey, storedToken)
    },
    { storageKey: PBS_PORTAL_AUTH_TOKEN_KEY, storedToken: token },
  )

  await page.route('**/api/auth/session', async (route) => {
    const method = route.request().method()

    if (method === 'GET') {
      await expect(route.request().headers().authorization).toBe(`Bearer ${token}`)
      await fulfillJson(route, defaultAuthenticatedSession)
      return
    }

    if (method === 'DELETE') {
      await fulfillJson(route, { loggedOut: true })
      return
    }

    await route.fallback()
  })
}

export const gotoHelp = async (page: Page) => {
  await mockAuthenticatedPortalSession(page)
  await page.goto('help')
  await expect(page.getByTestId('help-page')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('dashboard-top-nav')).toBeVisible()
}

export const openHelpTopic = async (page: Page, slug: string) => {
  const topic = page.getByTestId(`help-topic-${slug}`)

  if (!(await topic.isVisible().catch(() => false))) {
    await page.getByTestId(`help-cat-${categoryForTopic(slug)}`).click()
  }

  await expect(topic).toBeVisible()
  await topic.click()
  await expect(page.getByTestId('help-article')).toBeVisible()
}
