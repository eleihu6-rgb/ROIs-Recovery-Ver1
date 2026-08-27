/**
 * 真实用户登录 + 基础 Gantt 功能验证。
 *
 * 用真实账号 Jen（密码 Our2027，由 live-server/scripts/create-demo-users.cjs 创建）
 * 走 UI 登录（非 seed sessionStorage），然后进入 Live 视图验证基础排班功能可用：
 *   - 登录成功并写入 sessionStorage
 *   - 默认面板（roster + pairing）自动加载对象
 *   - 缩放等基础交互正常（对象不丢失）
 *
 * 断言基于 window.__ganttTest（store 真值 + Canvas 回执），避免假象。
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'
import { openLiveView, waitGanttReady, counts, renderStats, zoomState } from '../../utils/gantt-hook'

const USER = TEST_ACCOUNTS.jen

test.describe('Real user (Jen) — login + basic gantt', () => {
  test('Live-1177 — Jen logs in via UI and the gantt loads roster + pairing objects @smoke', async ({ page }) => {
    const login = new GanttLoginPage(page)

    // 1) 真实 UI 登录
    await login.goto()
    await login.login(USER.userCode, USER.password)

    // 登录后进入已认证的 shell（Live 导航可见）
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    // session 已写入
    const stored = await page.evaluate(() => window.sessionStorage.getItem('rois-auth'))
    expect(stored, 'rois-auth persisted after login').not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.user.userCode, 'logged-in user is Jen').toBe(USER.userCode)

    // 2) 进入 Live，基础 Gantt 自动加载对象
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await openLiveView(page)
    await waitGanttReady(page)

    const c = await counts(page)
    expect(c.roster, 'roster objects loaded for Jen').toBeGreaterThan(0)
    expect(c.pairing, 'pairing objects loaded for Jen').toBeGreaterThan(0)

    // Canvas 真的画了（非空白）
    const stats = await renderStats(page)
    expect(stats.find((s) => s.paneType.startsWith('roster'))?.totalRows ?? 0).toBeGreaterThan(0)
    expect(stats.find((s) => s.paneType.startsWith('pairing'))?.totalRows ?? 0).toBeGreaterThan(0)

    // 3) 基础交互：缩放后对象仍在
    const px0 = (await zoomState(page)).pxPerHour
    await page.getByTestId('zoom-in').click()
    await expect.poll(() => zoomState(page).then((z) => z.pxPerHour)).toBeGreaterThan(px0)
    expect((await counts(page)).roster, 'roster objects preserved after zoom').toBeGreaterThan(0)
  })
})
