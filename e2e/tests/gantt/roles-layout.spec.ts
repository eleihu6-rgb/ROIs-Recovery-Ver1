import { test, expect } from '@playwright/test'

// 纯前端 mock：拦截 API 返回固定数据，验证 Roles 分栏布局（左列表常驻 + 右配置树）
const MOCK_MENUS = [
  { id: 1, menuCode: 'ROOT', menuName: 'Root', parentMenuCode: '', idx: 0, icon: null, ctrls: [] },
  { id: 2, menuCode: 'LIVE', menuName: 'Live', parentMenuCode: 'ROOT', idx: 2, icon: 'CalendarDays', ctrls: [] },
  { id: 3, menuCode: 'LIVE_ROSTER', menuName: 'Roster', parentMenuCode: 'LIVE', idx: 1, icon: null, ctrls: [
    { id: 31, menuCtlCode: 'LIVE_SAVE', menuCtlName: 'Save', apiUris: '/api/draft/commit' },
    { id: 32, menuCtlCode: 'LIVE_PUBLISH', menuCtlName: 'Publish', apiUris: '/api/roster/publish/apply' },
  ] },
  { id: 4, menuCode: 'DATA', menuName: 'Data', parentMenuCode: 'ROOT', idx: 4, icon: 'Database', ctrls: [] },
  { id: 5, menuCode: 'DATA_CREW_MASTER', menuName: 'Crew Master', parentMenuCode: 'DATA', idx: 12, icon: null, ctrls: [] },
]

test('Roles split layout: left list persistent + right config pane', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { code: 200, data: null, message: 'ok' } }))
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: { code: 200, data: { token: 'mock-token', userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1, menus: ['ROOT'], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] } }, message: 'ok' } }))
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { code: 200, data: { user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 }, menus: ['ROOT'], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] } }, message: 'ok' } }))
  await page.route('**/api/auth/menus', (route) => route.fulfill({ json: { code: 200, data: { nodes: MOCK_MENUS.map((m) => ({ menuCode: m.menuCode, menuName: m.menuName, parentMenuCode: m.parentMenuCode, factoryName: '', systemType: 'S', idx: m.idx, hasAccess: true, ctrls: [] })) }, message: 'ok' } }))
  await page.route('**/api/admin/profiles', (route) => route.fulfill({ json: { code: 200, data: [
    { id: 1, profileName: 'Administrator', profileCode: 'Administrator', division: 'P', filiale: 'F8', idx: 1 },
    { id: 2, profileName: 'Roster Planner - Pilot', profileCode: 'RosterPlanner-P', division: 'P', filiale: 'F8', idx: 2 },
    { id: 3, profileName: 'Viewer - Pilot', profileCode: 'Viewer-P', division: 'P', filiale: 'F8', idx: 3 },
  ], message: 'ok' } }))
  await page.route('**/api/admin/menus', (route) => route.fulfill({ json: { code: 200, data: MOCK_MENUS, message: 'ok' } }))
  await page.route('**/api/admin/profiles/*/permissions', (route) => route.fulfill({ json: { code: 200, data: { menuCodes: ['LIVE', 'LIVE_ROSTER'], ctrls: [{ menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_SAVE' }], dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] } }, message: 'ok' } }))
  await page.route('**/api/division', (route) => route.fulfill({ json: { code: 200, data: [{ division: 'P', description: 'Pilot' }, { division: 'C', description: 'Cabin' }], message: 'ok' } }))
  await page.route('**/api/rank', (route) => route.fulfill({ json: { code: 200, data: [], message: 'ok' } }))
  await page.route('**/api/fleet', (route) => route.fulfill({ json: { code: 200, data: [], message: 'ok' } }))
  await page.route('**/api/admin/departments?kind=crew', (route) => route.fulfill({ json: { code: 200, data: [], message: 'ok' } }))
  await page.route('**/api/admin/users', (route) => route.fulfill({ json: { code: 200, data: { rows: [], total: 0 }, message: 'ok' } }))
  // 拦截其它会 403 的请求，避免噪音

  // 注入会话，跳过登录页
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 }, token: 'mock-token' }))
  })
  await page.reload()
  await page.waitForTimeout(3000)

  await page.getByTestId('module-nav-system').click()
  await page.waitForTimeout(1500)
  await page.getByTestId('system-nav-profile-mgmt').click()
  await page.waitForTimeout(2000)

  // 左列表：三个角色 + 第一个默认选中
  await expect(page.getByTestId('role-list-Administrator')).toBeVisible()
  await expect(page.getByTestId('role-list-RosterPlanner-P')).toBeVisible()
  await expect(page.getByTestId('role-list-Viewer-P')).toBeVisible()

  // 右配置：默认选中第一个角色 → RoleConfigPane 树形菜单
  await expect(page.getByTestId('role-config-pane')).toBeVisible()
  await expect(page.getByText('Menus & Buttons')).toBeVisible()
  await expect(page.getByText('Data Scope')).toBeVisible()

  // 点击第二个角色 → 右侧更新（仍显示配置，左列表仍在）
  await page.getByTestId('role-list-RosterPlanner-P').click()
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('role-config-pane')).toBeVisible()
  await expect(page.getByTestId('role-list-Administrator')).toBeVisible()
  await expect(page.getByText('Menus & Buttons')).toBeVisible()
  console.log('DIAG roles split layout ok')
})
