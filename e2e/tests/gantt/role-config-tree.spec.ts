import { test, expect } from '@playwright/test'

// 纯前端 mock：验证 RoleConfigPane 树形菜单 —— 不渲染 ROOT 行、菜单图标显示、
// 勾选任意层级的菜单会级联其下所有后代菜单与按钮全选/全不选、部分勾选时父级半选。
const MOCK_MENUS = [
  { id: 1, menuCode: 'ROOT', menuName: 'Root', parentMenuCode: '', idx: 0, icon: null, ctrls: [] },
  { id: 2, menuCode: 'LIVE', menuName: 'Live', parentMenuCode: 'ROOT', idx: 2, icon: 'CalendarDays', ctrls: [] },
  { id: 3, menuCode: 'LIVE_ROSTER', menuName: 'Roster', parentMenuCode: 'LIVE', idx: 1, icon: null, ctrls: [
    { id: 31, menuCtlCode: 'LIVE_SAVE', menuCtlName: 'Save', apiUris: '/api/draft/commit' },
    { id: 32, menuCtlCode: 'LIVE_PUBLISH', menuCtlName: 'Publish', apiUris: '/api/roster/publish/apply' },
  ] },
  { id: 33, menuCode: 'LIVE_SCHEDULE', menuName: 'Schedule', parentMenuCode: 'LIVE', idx: 2, icon: null, ctrls: [
    { id: 34, menuCtlCode: 'LIVE_SCHEDULE_PRINT', menuCtlName: 'Print', apiUris: null },
  ] },
  { id: 4, menuCode: 'DATA', menuName: 'Data', parentMenuCode: 'ROOT', idx: 4, icon: 'Database', ctrls: [] },
  { id: 5, menuCode: 'DATA_CREW_MASTER', menuName: 'Crew Master', parentMenuCode: 'DATA', idx: 12, icon: null, ctrls: [] },
]

const EMPTY_SCOPE = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }

test('RoleConfigPane: no ROOT row, icons shown, cascade select/deselect at every level', async ({ page }) => {
  let savedMenus: string[] = []
  let savedCtrls: string[] = []
  await page.route('**/api/**', (route) => route.fulfill({ json: { code: 200, data: null, message: 'ok' } }))
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: { code: 200, data: { token: 'mock-token', userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1, menus: ['ROOT'], ctrls: {}, dataScope: EMPTY_SCOPE }, message: 'ok' } }))
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { code: 200, data: { user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 }, menus: ['ROOT'], ctrls: {}, dataScope: EMPTY_SCOPE }, message: 'ok' } }))
  await page.route('**/api/auth/menus', (route) => route.fulfill({ json: { code: 200, data: { nodes: MOCK_MENUS.map((m) => ({ menuCode: m.menuCode, menuName: m.menuName, parentMenuCode: m.parentMenuCode, factoryName: '', systemType: 'S', idx: m.idx, hasAccess: true, ctrls: [] })) }, message: 'ok' } }))
  await page.route('**/api/admin/profiles', (route) => route.fulfill({ json: { code: 200, data: [
    { id: 1, profileName: 'Administrator', profileCode: 'Administrator', division: 'P', filiale: 'F8', idx: 1 },
  ], message: 'ok' } }))
  await page.route('**/api/admin/menus', (route) => route.fulfill({ json: { code: 200, data: MOCK_MENUS, message: 'ok' } }))
  await page.route('**/api/admin/profiles/*/permissions', (route) => route.fulfill({ json: { code: 200, data: { menuCodes: [], ctrls: [], dataScope: EMPTY_SCOPE }, message: 'ok' } }))
  await page.route('**/api/admin/profiles/*/menus', (route) => {
    savedMenus = JSON.parse(route.request().postData() ?? '{}').menuCodes ?? []
    return route.fulfill({ json: { code: 200, data: null, message: 'ok' } })
  })
  await page.route('**/api/admin/profiles/*/ctrls', (route) => {
    savedCtrls = (JSON.parse(route.request().postData() ?? '{}').ctrls ?? []).map((c: { menuCode: string; ctlCode: string }) => `${c.menuCode}:${c.ctlCode}`)
    return route.fulfill({ json: { code: 200, data: null, message: 'ok' } })
  })
  await page.route('**/api/division', (route) => route.fulfill({ json: { code: 200, data: [], message: 'ok' } }))
  await page.route('**/api/rank', (route) => route.fulfill({ json: { code: 200, data: [], message: 'ok' } }))
  await page.route('**/api/fleet', (route) => route.fulfill({ json: { code: 200, data: [], message: 'ok' } }))
  await page.route('**/api/admin/departments?kind=crew', (route) => route.fulfill({ json: { code: 200, data: [], message: 'ok' } }))

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

  const pane = page.getByTestId('role-config-pane')
  await expect(pane).toBeVisible()
  await expect(pane.getByText('Live', { exact: true })).toBeVisible()

  // 1. ROOT 行不渲染
  await expect(pane.getByText('Root', { exact: true })).toHaveCount(0)
  await expect(pane.getByText('ROOT', { exact: true })).toHaveCount(0)

  // 2. 菜单图标渲染（LIVE=CalendarDays / DATA=Database / 无 icon 叶子回退 MENU_ICONS→Users）
  //    只统计树行 label 内的图标，排除 tab 按钮上的图标
  await expect(pane.locator('label .lucide-calendar-days').first()).toBeVisible()
  await expect(pane.locator('label .lucide-database')).toBeVisible()
  await expect(pane.locator('label .lucide-users')).toBeVisible()

  // 树行 label 里带 icon 和按钮数徽章，用包含匹配定位复选框
  const checkboxOf = (name: string) => pane.locator('label').filter({ hasText: name }).locator('input[type="checkbox"]')
  const liveCheck = checkboxOf('Live')
  const rosterCheck = checkboxOf('Roster')
  const scheduleCheck = checkboxOf('Schedule')
  const dataCheck = checkboxOf('Data')
  const crewMasterCheck = checkboxOf('Crew Master')
  const saveChip = checkboxOf('Save')
  const publishChip = checkboxOf('Publish')
  const printChip = checkboxOf('Print')

  // 3. 逐级级联：勾选 LIVE → 其下所有后代菜单与按钮全选
  await expect(rosterCheck).not.toBeChecked()
  await liveCheck.check()
  await expect(rosterCheck).toBeChecked()
  await expect(scheduleCheck).toBeChecked()
  await expect(saveChip).toBeChecked()
  await expect(publishChip).toBeChecked()
  await expect(printChip).toBeChecked()

  // 取消 LIVE → 全部取消
  await liveCheck.uncheck()
  await expect(rosterCheck).not.toBeChecked()
  await expect(scheduleCheck).not.toBeChecked()
  await expect(saveChip).not.toBeChecked()
  await expect(publishChip).not.toBeChecked()
  await expect(printChip).not.toBeChecked()

  // 勾选 DATA → 子树 Crew Master 选中
  await dataCheck.check()
  await expect(crewMasterCheck).toBeChecked()

  // 4. 半选：只勾子菜单 → 父菜单 indeterminate
  await dataCheck.uncheck()
  await crewMasterCheck.check()
  await expect(dataCheck).toHaveJSProperty('indeterminate', true)

  // 5. 树面板纵向铺满可用高度，Close/Save 按钮钉在面板底部
  const paneBox = await pane.boundingBox()
  const saveBtn = pane.getByRole('button', { name: 'Save' })
  const saveBox = await saveBtn.boundingBox()
  expect(paneBox).not.toBeNull()
  expect(saveBox).not.toBeNull()
  expect(Math.round(paneBox!.y + paneBox!.height) - Math.round(saveBox!.y + saveBox!.height)).toBeLessThanOrEqual(12)

  // 6. Save 提交包含级联后的全部后代菜单与按钮
  await liveCheck.check()
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => savedMenus).toContain('LIVE')
  await expect.poll(() => savedMenus).toContain('LIVE_ROSTER')
  await expect.poll(() => savedMenus).toContain('LIVE_SCHEDULE')
  await expect.poll(() => savedMenus).toContain('DATA_CREW_MASTER')
  await expect.poll(() => savedCtrls).toContain('LIVE_ROSTER:LIVE_SAVE')
  await expect.poll(() => savedCtrls).toContain('LIVE_ROSTER:LIVE_PUBLISH')
  await expect.poll(() => savedCtrls).toContain('LIVE_SCHEDULE:LIVE_SCHEDULE_PRINT')
})
