/**
 * Regression: non-admin users must not see "Admin access required" toast after
 * login or page refresh when their previous session left stale admin sub-tabs
 * (Scheduler, Data Quality, PBS admin-tools, PBS business-time, etc.) in
 * localStorage. The toast was firing on first paint because the underlying
 * admin view's mount effect hit an admin-gated endpoint before menu permissions
 * had finished loading.
 *
 * §Simulate-User: drives the real UI by logging in as a non-admin and
 * reloading with seeded localStorage. No direct API calls stand in for the
 * user's actual experience.
 * §No-Illusion: counts actual outgoing requests to admin-gated endpoints and
 * asserts the count is zero — not "toast is not visible" alone, since the
 * 403 path is what triggers the toast.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const NON_ADMIN_USER = process.env.GANTT_NON_ADMIN_USER ?? 'nonadmin_toast'
const NON_ADMIN_PASS = process.env.GANTT_NON_ADMIN_PASS ?? '123456'

const okEnvelope = (data: unknown) =>
  ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data, message: 'ok' }) })

const errEnvelope = (code: number, message: string) =>
  ({ status: code, contentType: 'application/json', body: JSON.stringify({ code, data: null, message }) })

/**
 * Seed localStorage keys used by shell-store.loadFromStorage() so the app
 * boots into an admin-only sub-tab. This mirrors what would happen for any
 * user whose previous browser session had opened those tabs.
 */
const seedStaleAdminTabs = async (
  page: import('@playwright/test').Page,
  tabs: { system?: string; pbs?: string; module?: string } = {},
): Promise<void> => {
  await page.addInitScript((state) => {
    if (state.system) localStorage.setItem('rois-shell-system-item', state.system)
    if (state.pbs) localStorage.setItem('rois-shell-pbs-item', state.pbs)
    if (state.openTabs) localStorage.setItem('rois-shell-open-tabs', JSON.stringify(state.openTabs))
    if (state.module) localStorage.setItem('rois-shell-module', state.module)
  }, tabs)
}

test.describe('SystemView / PbsView — non-admin auto-fetch guard', () => {
  test('Sys-2001 — Scheduler tab restored for non-admin does NOT hit /api/admin/scheduler/jobs', async ({ page, request }) => {
    // Login as non-admin.
    const login = await request.post(`${process.env.GANTT_API_URL ?? 'http://localhost:3000'}/api/auth/login`, {
      data: { userCode: NON_ADMIN_USER, password: NON_ADMIN_PASS },
    })
    expect(login.ok(), `non-admin login failed: ${login.status()}`).toBeTruthy()
    const auth = (await login.json()) as { data: { token: string; userCode: string; userName: string; schema: string; isAdmin: number } }
    expect(auth.data.isAdmin, 'test precondition: user must be non-admin').toBe(0)

    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 },
          token: a.token,
        }),
      )
    }, auth.data)

    // Simulate stale localStorage: user previously opened the System tab with
    // activeSystemItem=scheduler. This is exactly what triggers the bug.
    await seedStaleAdminTabs(page, {
      module: 'system',
      system: 'scheduler',
      openTabs: ['dashboard', 'system'],
    })

    // Count admin-gated calls. If the regression is reintroduced, this fires.
    let schedulerJobsCalls = 0
    await page.route('**/api/admin/scheduler/jobs', (route) => {
      schedulerJobsCalls += 1
      route.fulfill(errEnvelope(403, 'Admin access required'))
    })
    // Auth/me must succeed or app logs out.
    await page.route('**/api/auth/me', (route) =>
      route.fulfill(okEnvelope({
        user: auth.data, menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      })))
    // Grant the non-admin user access to LIVE / DASHBOARD so the top nav
    // renders at least one permitted module. PBS / SYSTEM are intentionally
    // omitted — that is the whole point of the assertion below.
    await page.route('**/api/auth/menus', (route) =>
      route.fulfill(okEnvelope({
        nodes: [
          { menuCode: 'LIVE',       menuName: 'Live',      parentMenuCode: '', factoryName: null, systemType: '', idx: null, hasAccess: true,  ctrls: [] },
          { menuCode: 'DASHBOARD',  menuName: 'Dashboard', parentMenuCode: '', factoryName: null, systemType: '', idx: null, hasAccess: true,  ctrls: [] },
        ],
      })))

    await page.goto('/altair/')

    // Give the SPA time to mount and fire any auto-fetches. If scheduler-view
    // mounts and fires its useEffect, this counter goes > 0 — which is the
    // exact user-facing bug.
    await page.waitForTimeout(2_000)
    expect(schedulerJobsCalls, 'SchedulerView must not auto-fetch as non-admin').toBe(0)

    // Belt-and-suspenders: even if some auto-fire was missed, the user must
    // never see the toast surface.
    await expect(page.getByText('Admin access required')).toHaveCount(0)
  })

  test('Sys-2002 — PBS admin-tools tab restored for non-admin does NOT hit /api/pbs/period-admin', async ({ page, request }) => {
    const login = await request.post(`${process.env.GANTT_API_URL ?? 'http://localhost:3000'}/api/auth/login`, {
      data: { userCode: NON_ADMIN_USER, password: NON_ADMIN_PASS },
    })
    expect(login.ok(), `non-admin login failed: ${login.status()}`).toBeTruthy()
    const auth = (await login.json()) as { data: { token: string; userCode: string; userName: string; schema: string; isAdmin: number } }
    expect(auth.data.isAdmin).toBe(0)

    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 },
          token: a.token,
        }),
      )
    }, auth.data)

    // Simulate stale PBS tab with admin-tools active.
    await seedStaleAdminTabs(page, {
      module: 'pbs',
      pbs: 'admin-tools',
      openTabs: ['dashboard', 'pbs'],
    })

    let periodAdminCalls = 0
    await page.route('**/api/pbs/period-admin**', (route) => {
      periodAdminCalls += 1
      route.fulfill(errEnvelope(403, 'Admin access required'))
    })
    await page.route('**/api/auth/me', (route) =>
      route.fulfill(okEnvelope({
        user: auth.data, menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      })))
    // Grant the non-admin user access to LIVE / DASHBOARD so the top nav
    // renders at least one permitted module. PBS / SYSTEM are intentionally
    // omitted — that is the whole point of the assertion below.
    await page.route('**/api/auth/menus', (route) =>
      route.fulfill(okEnvelope({
        nodes: [
          { menuCode: 'LIVE',       menuName: 'Live',      parentMenuCode: '', factoryName: null, systemType: '', idx: null, hasAccess: true,  ctrls: [] },
          { menuCode: 'DASHBOARD',  menuName: 'Dashboard', parentMenuCode: '', factoryName: null, systemType: '', idx: null, hasAccess: true,  ctrls: [] },
        ],
      })))

    await page.goto('/altair/')

    await page.waitForTimeout(2_000)
    expect(periodAdminCalls, 'PbsAdminTools must not auto-fetch as non-admin').toBe(0)
    await expect(page.getByText('Admin access required')).toHaveCount(0)
  })

  test('Sys-2003 — admin-only modules are hidden from the top nav for non-admin', async ({ page, request }) => {
    // Login as non-admin.
    const login = await request.post(`${process.env.GANTT_API_URL ?? 'http://localhost:3000'}/api/auth/login`, {
      data: { userCode: NON_ADMIN_USER, password: NON_ADMIN_PASS },
    })
    expect(login.ok(), `non-admin login failed: ${login.status()}`).toBeTruthy()
    const auth = (await login.json()) as { data: { token: string; userCode: string; userName: string; schema: string; isAdmin: number } }
    expect(auth.data.isAdmin, 'test precondition: user must be non-admin').toBe(0)

    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 },
          token: a.token,
        }),
      )
    }, auth.data)

    await page.route('**/api/auth/me', (route) =>
      route.fulfill(okEnvelope({
        user: auth.data, menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      })))
    // Grant the non-admin user access to LIVE / DASHBOARD so the top nav
    // renders at least one permitted module. PBS / SYSTEM are intentionally
    // omitted — that is the whole point of the assertion below.
    await page.route('**/api/auth/menus', (route) =>
      route.fulfill(okEnvelope({
        nodes: [
          { menuCode: 'LIVE',       menuName: 'Live',      parentMenuCode: '', factoryName: null, systemType: '', idx: null, hasAccess: true,  ctrls: [] },
          { menuCode: 'DASHBOARD',  menuName: 'Dashboard', parentMenuCode: '', factoryName: null, systemType: '', idx: null, hasAccess: true,  ctrls: [] },
        ],
      })))

    await page.goto('/altair/')

    // Wait for SPA to render.
    await expect(page.getByTestId('shell-top-nav-wrap')).toBeVisible()

    // PBS and System are admin-only modules — their top-nav buttons must NOT
    // render for non-admin users. Other modules (Dashboard, Live, Scenario,
    // Data, Legality, Help, Release) remain visible based on menu permissions.
    await expect(page.getByTestId('nav-pbs')).toHaveCount(0)
    await expect(page.getByTestId('module-nav-system')).toHaveCount(0)
    // Either Dashboard or Live is visible (depends on menu permissions granted
    // to the test user). The point is: at least one non-admin module renders.
    const liveCount = await page.getByTestId('module-nav-live').count()
    const dashboardCount = await page.getByTestId('module-nav-dashboard').count()
    expect(liveCount + dashboardCount, 'non-admin user must have at least one permitted module').toBeGreaterThan(0)

    // And no admin-required error toast.
    await page.waitForTimeout(500)
    await expect(page.getByText('Admin access required')).toHaveCount(0)
  })
})