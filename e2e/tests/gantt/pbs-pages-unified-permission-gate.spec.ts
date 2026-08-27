/**
 * Regression: Unified permission gate for PBS Bid Definitions, Business Time,
 * and Simulated Crew Portal.
 *
 * Bug context (2026-08-25, SIT):
 *   These three pages were gated on the backend by `users.is_admin !== 1`,
 *   so non-admin users with the Roles/profile that grant access still saw
 *   blank or "permission denied" responses. After the refactor, the route
 *   handlers defer to `system_menu.menu_code` (PBS_BID_DEFINITIONS /
 *   PBS_BUSINESS_TIME / PBS_SIMULATED_CREW_PORTAL) — the same permission
 *   the gantt sidebar already uses via /api/auth/menus.
 *
 * Test scope:
 *   1. Non-admin with the three menu permissions sees the sidebar items.
 *   2. Clicking each item mounts its view; no 403 redirect to Period.
 *   3. The page APIs return 200 with the right shape (not 403).
 *   4. Non-admin without the menu permissions is still gated out
 *      (the existing behaviour must be preserved).
 */
import { expect, test, type Page, type Route } from '@playwright/test'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

interface NodeFixture {
  menuCode: string
  menuName: string
  parentMenuCode: string
  hasAccess: boolean
}

const PBS_MODULE_MENU_CODE = 'PBS'

const PBS_NAV_ITEMS = [
  { item: 'period', menuCode: 'PBS_PERIOD', label: 'Period' },
  { item: 'bid-definitions', menuCode: 'PBS_BID_DEFINITIONS', label: 'Bid Definitions' },
  { item: 'business-time', menuCode: 'PBS_BUSINESS_TIME', label: 'Business Time' },
  { item: 'admin-tools', menuCode: 'PBS_ADMIN_TOOLS', label: 'Admin Tools' },
  { item: 'simulated-crew-portal', menuCode: 'PBS_SIMULATED_CREW_PORTAL', label: 'Simulated Crew Portal' },
] as const

type PbsItem = typeof PBS_NAV_ITEMS[number]['item']

const buildMenuNodes = (grantedMenus: readonly string[]): NodeFixture[] => {
  const granted = new Set(grantedMenus)
  // The 'PBS' parent module must be visible — otherwise canAccessModule('pbs')
  // returns false at the top nav and the entire PBS tab disappears, even if
  // the children are permitted.
  const parent: NodeFixture = {
    menuCode: PBS_MODULE_MENU_CODE,
    menuName: 'PBS',
    parentMenuCode: '',
    hasAccess: true,
  }
  const children: NodeFixture[] = PBS_NAV_ITEMS.map(({ menuCode, label }) => ({
    menuCode,
    menuName: label,
    parentMenuCode: PBS_MODULE_MENU_CODE,
    hasAccess: menuCode === 'PBS_PERIOD' || menuCode === 'PBS_ADMIN_TOOLS' || granted.has(menuCode),
  }))
  return [parent, ...children]
}

interface BidDefinitionsPayload {
  rows: Array<Record<string, unknown>>
  weekdays: Array<Record<string, unknown>>
}

interface BusinessTimePayload {
  mode: string
  source: 'system' | 'override'
  realNow: string
  businessNow: string
  anchor: string | null
  anchorReal: string | null
  warnings: string[]
}

const stubBidDefinitions: BidDefinitionsPayload = {
  rows: [
    {
      code: 'redeye',
      name: 'Redeye',
      displayValue: '03:30–05:30 local time',
      description: 'Local operating window used to identify Redeye legs.',
      updatedBy: 'admin',
      updatedAt: '2026-08-25T00:00:00.000Z',
      value: { available: true, startTime: '03:30', endTime: '05:30', crossesMidnight: false, version: '03:30|05:30' },
    },
  ],
  weekdays: [
    { code: 'MON', name: 'Monday', isoDay: 1 },
    { code: 'SUN', name: 'Sunday', isoDay: 7 },
  ],
}

const stubBusinessTime: BusinessTimePayload = {
  mode: 'ROLLING',
  source: 'system',
  realNow: '2026-08-25T07:00:00.000Z',
  businessNow: '2026-08-25T07:00:00.000Z',
  anchor: null,
  anchorReal: null,
  warnings: [],
}

const stubSimulatedPortalConfig = {
  portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
  loginTtlSeconds: 300,
}

const seedSession = async (
  page: Page,
  options: {
    isAdmin: number
    /** Menu codes the user is permitted to access (besides PBS_PERIOD + PBS_ADMIN_TOOLS). */
    grantedMenus: readonly string[]
  },
): Promise<void> => {
  const grantedSet = new Set(options.grantedMenus)
  const nodes = buildMenuNodes(options.grantedMenus).map((node) => ({
    menuCode: node.menuCode,
    menuName: node.menuName,
    parentMenuCode: node.parentMenuCode,
    factoryName: null,
    systemType: 'GANTT',
    idx: 1,
    hasAccess: node.hasAccess,
    ctrls: [],
  }))

  await page.route('**/altair/live/api/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/api/auth/me')) {
      await route.fulfill({
        json: {
          code: 200,
          data: {
            user: {
              userCode: 'power-user',
              userName: 'Power User',
              schema: 'f8',
              isAdmin: options.isAdmin,
            },
          },
          message: 'ok',
        },
      })
      return
    }

    if (path.endsWith('/api/auth/menus')) {
      await route.fulfill({ json: { code: 200, data: { nodes }, message: 'ok' } })
      return
    }

    if (path.endsWith('/api/pbs/bid-definitions')) {
      await route.fulfill({ json: { code: 200, data: stubBidDefinitions, message: 'ok' } })
      return
    }

    if (path.endsWith('/api/admin/pbs-business-time')) {
      await route.fulfill({ json: { code: 200, data: stubBusinessTime, message: 'ok' } })
      return
    }

    if (path.endsWith('/api/admin/simulated-crew-portal/config')) {
      await route.fulfill({ json: { code: 200, data: stubSimulatedPortalConfig, message: 'ok' } })
      return
    }

    if (path.endsWith('/api/admin/simulated-crew-portal/logs')) {
      await route.fulfill({ json: { code: 200, data: { logs: [] }, message: 'ok' } })
      return
    }

    if (path.endsWith('/api/pbs/period-admin')) {
      await route.fulfill({ json: { code: 200, data: { rows: [], total: 0 }, message: 'ok' } })
      return
    }

    await route.fulfill({ json: { code: 200, data: null, message: 'ok' } })
  })

  await page.addInitScript(({ admin }) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: 'power-user', userName: 'Power User', schema: 'f8', isAdmin: admin },
      token: 'pbs-unified-permission-gate-token',
    }))
    localStorage.setItem('rois-shell-module', 'pbs')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['pbs']))
    localStorage.setItem('rois-shell-pbs-item', 'period')
  }, { admin: options.isAdmin })
}

const selectPbsItem = async (page: Page, item: PbsItem): Promise<void> => {
  await page.getByTestId(`pbs-nav-${item}`).click()
}

test.describe('PBS pages share the unified system_menu permission gate', () => {
  test('non-admin with PBS_BID_DEFINITIONS, PBS_BUSINESS_TIME, and PBS_SIMULATED_CREW_PORTAL menus can open every page', async ({ page }) => {
    await seedSession(page, {
      isAdmin: 0,
      grantedMenus: ['PBS_BID_DEFINITIONS', 'PBS_BUSINESS_TIME', 'PBS_SIMULATED_CREW_PORTAL'],
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()

    // All five PBS sidebar items must be visible because /api/auth/menus
    // returns hasAccess=true for every one of them.
    for (const { item, label } of PBS_NAV_ITEMS) {
      await expect(page.getByTestId(`pbs-nav-${item}`), `PBS sidebar item "${label}" must be visible`).toBeVisible()
    }

    // Bid Definitions — the previously blank page must now render with rows.
    await selectPbsItem(page, 'bid-definitions')
    await expect(page.getByTestId('pbs-bid-definitions-view')).toBeVisible()
    await expect(page.getByTestId('pbs-definition-row-redeye')).toContainText('03:30–05:30 local time')
    // Must NOT have bounced back to the Period view (the original bug symptom).
    await expect(page.getByTestId('pbs-period-view')).toHaveCount(0)

    // Business Time — the page that used to throw "You do not have permission".
    await selectPbsItem(page, 'business-time')
    await expect(page.getByTestId('pbs-business-time-view')).toBeVisible()
    await expect(page.getByTestId('pbs-business-time-view')).toContainText('SYSTEM TIME')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rois-shell-pbs-item')))
      .toBe('business-time')

    // Simulated Crew Portal — the page that threw "You do not have permission to simulate".
    await selectPbsItem(page, 'simulated-crew-portal')
    await expect(page.getByTestId('pbs-simulated-crew-portal-view')).toBeVisible()
    await expect(page.getByTestId('pbs-simulated-portal-url-input')).toHaveValue('https://crew-f8-usva-sit.roiscloud.com/pbs')
  })

  test('non-admin without the PBS_BID_DEFINITIONS menu still cannot open Bid Definitions', async ({ page }) => {
    await seedSession(page, {
      isAdmin: 0,
      grantedMenus: [],
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()

    // Sidebar must hide the previously-admin-only items.
    await expect(page.getByTestId('pbs-nav-period')).toBeVisible()
    await expect(page.getByTestId('pbs-nav-bid-definitions')).toHaveCount(0)
    await expect(page.getByTestId('pbs-nav-business-time')).toHaveCount(0)
    await expect(page.getByTestId('pbs-nav-simulated-crew-portal')).toHaveCount(0)

    // Direct nav to the bid-definitions view must NOT render the page
    // (sidebar gate is enforced by the menu store, not the route).
    await page.evaluate(() => {
      localStorage.setItem('rois-shell-pbs-item', 'bid-definitions')
    })
    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()
    await expect(page.getByTestId('pbs-bid-definitions-view')).toHaveCount(0)
  })
})
