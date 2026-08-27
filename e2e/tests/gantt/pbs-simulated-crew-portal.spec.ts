import { expect, test, type Page, type Route } from '@playwright/test'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

const menuNode = (menuCode: string, menuName: string, parentMenuCode = '') => ({
  menuCode,
  menuName,
  parentMenuCode,
  factoryName: null,
  systemType: 'GANTT',
  idx: 1,
  hasAccess: true,
  ctrls: [],
})

const seedAdminSession = async (
  page: Page,
  options: { configLoadStatusCode?: number } = {},
): Promise<{ configRequests: unknown[]; createdRequests: unknown[] }> => {
  const configRequests: unknown[] = []
  const createdRequests: unknown[] = []

  await page.route('**/altair/live/api/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/api/auth/me')) {
      await route.fulfill({
        json: {
          code: 200,
          data: { user: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 } },
          message: 'ok',
        },
      })
      return
    }

    if (path.endsWith('/api/auth/menus')) {
      await route.fulfill({
        json: {
          code: 200,
          data: {
            nodes: [
              menuNode('PBS', 'PBS'),
              menuNode('PBS_PERIOD', 'Period', 'PBS'),
              menuNode('PBS_ADMIN_TOOLS', 'Admin Tools', 'PBS'),
              menuNode('PBS_SIMULATED_CREW_PORTAL', 'Simulated Crew Portal', 'PBS'),
            ],
          },
          message: 'ok',
        },
      })
      return
    }

    if (path.endsWith('/api/admin/simulated-crew-portal/config')) {
      if (route.request().method() === 'PUT') {
        configRequests.push(route.request().postDataJSON())
        await route.fulfill({
          json: {
            code: 200,
            data: route.request().postDataJSON(),
            message: 'ok',
          },
        })
        return
      }

      if (options.configLoadStatusCode) {
        await route.fulfill({
          status: options.configLoadStatusCode,
          json: {
            code: options.configLoadStatusCode,
            data: null,
            message: 'PBS internal service authorization failed. Check simulated portal configuration.',
          },
        })
        return
      }

      await route.fulfill({
        json: {
          code: 200,
          data: {
            portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
            loginTtlSeconds: 300,
          },
          message: 'ok',
        },
      })
      return
    }

    if (path.endsWith('/api/admin/simulated-crew-portal/sessions')) {
      createdRequests.push(route.request().postDataJSON())
      await route.fulfill({
        json: {
          code: 200,
          data: {
            url: 'https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid',
            expiresAt: '2026-08-17T10:00:00.000Z',
          },
          message: 'ok',
        },
      })
      return
    }

    if (path.endsWith('/api/admin/simulated-crew-portal/logs')) {
      await route.fulfill({
        json: {
          code: 200,
          data: {
            logs: [{
              id: '101',
              adminUser: 'Admin User',
              adminUserCode: 'admin',
              crewCode: 'B79185',
              crewName: 'Mary Nasso',
              result: 'SUCCESS',
              loginTime: '2026-08-17T10:00:00.000Z',
            }],
          },
          message: 'ok',
        },
      })
      return
    }

    await route.fulfill({ json: { code: 200, data: null, message: 'ok' } })
  })

  await page.addInitScript(() => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 },
      token: 'pbs-simulated-crew-portal-token',
    }))
    localStorage.setItem('rois-shell-module', 'pbs')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['pbs']))
    localStorage.setItem('rois-shell-pbs-item', 'period')
    ;(window as unknown as { __pbsOpenedUrls: string[] }).__pbsOpenedUrls = []
    const openedUrls = (window as unknown as { __pbsOpenedUrls: string[] }).__pbsOpenedUrls
    window.open = ((url?: string | URL | undefined) => {
      openedUrls.push(String(url ?? ''))
      return null
    }) as typeof window.open
  })

  return { configRequests, createdRequests }
}

test('GANTT-PBS-SIM-001 — PBS sidebar exposes simulated crew portal and log dialog', async ({ page }) => {
  const { configRequests, createdRequests } = await seedAdminSession(page)

  await page.goto(`${BASE}/altair/`)
  await page.getByTestId('nav-pbs').click()

  await expect(page.getByTestId('pbs-nav-admin-tools')).toBeVisible()
  await expect(page.getByTestId('pbs-nav-simulated-crew-portal')).toBeVisible()
  await expect(page.getByTestId('pbs-nav-admin-tools')).toHaveCSS('padding-left', '12px')
  await expect(page.getByTestId('pbs-nav-simulated-crew-portal')).toHaveCSS('padding-left', '12px')
  await page.getByTestId('pbs-nav-simulated-crew-portal').click()

  await expect(page.getByTestId('pbs-simulated-crew-portal-view')).toBeVisible()
  await expect(page.getByText('Portal Configuration')).toBeVisible()
  await expect(page.getByText('Simulate Portal Login')).toBeVisible()
  await expect(page.getByTestId('pbs-simulated-portal-url-input')).toHaveValue('https://crew-f8-usva-sit.roiscloud.com/pbs')
  await page.getByTestId('pbs-simulated-token-ttl-input').fill('600')
  await page.getByTestId('pbs-simulated-portal-config-save').click()
  await expect.poll(async () => configRequests).toEqual([{
    portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
    loginTtlSeconds: 600,
  }])

  await page.getByTestId('pbs-simulated-crew-code-input').fill('B79185')
  await page.getByTestId('pbs-simulated-crew-portal-submit').click()

  await expect.poll(async () => createdRequests).toEqual([{ crewCode: 'B79185' }])
  await expect.poll(async () => page.evaluate(() => (
    window as unknown as { __pbsOpenedUrls: string[] }
  ).__pbsOpenedUrls)).toEqual([
    'https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid',
  ])

  await page.getByTestId('pbs-simulated-crew-portal-log-btn').click()
  const dialog = page.getByTestId('pbs-simulated-crew-portal-log-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Admin User')
  await expect(dialog).toContainText('B79185')
  await expect(dialog).toContainText('Mary Nasso')
  await expect(dialog).toContainText('SUCCESS')
})

test('GANTT-PBS-SIM-002 — simulated portal config load failure does not log out Altair admin', async ({ page }) => {
  await seedAdminSession(page, { configLoadStatusCode: 502 })

  await page.goto(`${BASE}/altair/`)
  await page.getByTestId('nav-pbs').click()
  await page.getByTestId('pbs-nav-simulated-crew-portal').click()

  await expect(page.getByTestId('pbs-simulated-crew-portal-view')).toBeVisible()
  await expect(page.getByTestId('pbs-simulated-portal-config-error')).toContainText(
    'Portal configuration could not be loaded',
  )
  await expect(page.getByTestId('pbs-nav-simulated-crew-portal')).toBeVisible()
  await expect(page).toHaveURL(/\/altair\/pbs$/)
})
