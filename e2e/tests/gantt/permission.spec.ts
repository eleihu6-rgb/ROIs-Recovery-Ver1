/**
 * Gantt Permission Tests (P0-P3 权限体系 E2E)
 *
 * 用 DEV 库（f8）验证：
 * - 角色菜单权限：admin 全菜单可见；受限角色（Viewer-P）隐藏无权限 Tab
 * - 按钮权限：无 ctrl 权限的角色看不到操作按钮
 * 登录账号（DEV seed）：admin / 123456（Administrator）、viewer01 / 123456（Viewer-P）
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'

const ADMIN = { userCode: 'admin', password: '123456' }
const VIEWER = { userCode: 'viewer01', password: '123456' }

// 顶层 Tab testid（pbs/help 有自定义 testid）
const TAB_TESTID: Record<string, string> = {
  dashboard: 'module-nav-dashboard',
  live: 'module-nav-live',
  scenario: 'module-nav-scenario',
  data: 'module-nav-data',
  legality: 'module-nav-legality',
  system: 'module-nav-system',
  pbs: 'nav-pbs',
  help: 'nav-help',
}
const ALL_TABS = ['dashboard', 'live', 'scenario', 'data', 'legality', 'system', 'pbs', 'help']
const VIEWER_ALLOWED = ['dashboard', 'live', 'scenario', 'help']
const VIEWER_HIDDEN = ['data', 'legality', 'system', 'pbs']

async function login(page: import('@playwright/test').Page, account: { userCode: string; password: string }) {
  const loginPage = new GanttLoginPage(page)
  await loginPage.goto()
  await loginPage.login(account.userCode, account.password)
  await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
}

test.describe('权限菜单 Tab 可见性', () => {
  test('admin 看到全部 8 个 Tab', async ({ page }) => {
    await login(page, ADMIN)
    for (const tab of ALL_TABS) {
      await expect(page.getByTestId(TAB_TESTID[tab])).toBeVisible({ timeout: 5_000 })
    }
  })

  test('viewer01 只看到授权的 4 个 Tab，看不到 DATA/LEGALITY/SYSTEM/PBS', async ({ page }) => {
    await login(page, VIEWER)
    for (const tab of VIEWER_ALLOWED) {
      await expect(page.getByTestId(TAB_TESTID[tab])).toBeVisible({ timeout: 5_000 })
    }
    for (const tab of VIEWER_HIDDEN) {
      await expect(page.getByTestId(TAB_TESTID[tab])).toHaveCount(0)
    }
  })
})

test.describe('权限按钮可见性（Live 工具栏）', () => {
  test('admin 在 Live 看到 Publish 按钮', async ({ page }) => {
    await login(page, ADMIN)
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('roster-publish-btn')).toBeVisible({ timeout: 10_000 })
  })

  test('viewer01（无 ctrl 权限）在 Live 看不到 Publish 按钮', async ({ page }) => {
    await login(page, VIEWER)
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('roster-publish-btn')).toHaveCount(0)
  })

  test('viewer01（无 ctrl 权限）看不到 Create Ground Task 按钮', async ({ page }) => {
    await login(page, VIEWER)
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByTestId('create-ground-task-btn')).toHaveCount(0)
  })
})

test.describe('权限管理界面可达性', () => {
  test('admin 可进入 System 管理页（Roles）', async ({ page }) => {
    await login(page, ADMIN)
    await page.getByTestId('module-nav-system').click()
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 5_000 })
    // System 侧栏应含 Users/Roles 管理项
    await expect(page.getByRole('button', { name: 'Roles' })).toBeVisible({ timeout: 5_000 })
  })
})
