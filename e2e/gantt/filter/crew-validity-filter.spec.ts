import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, waitGanttReady, applyFilterLight } from '../../utils/gantt-hook'

interface PanelRow { crewId: string; seniority?: string }

/**
 * Crew 列表在窗口内 rank/base 双有效（Rule 1）：只勾 Division C（Cabin）时，
 * rank 已过期的组员（如 895，rank IFD 于 2026-03-31 失效）不得进入 roster 面板。
 * 数据依赖目标环境（UAT 已实证：895 过期 / 2109 有效 / RP08 2026 窗口 07-25..09-07）。
 */
test.describe('crew rank/base validity filter', () => {
  test('division-only Cabin filter excludes expired crew within the RP window', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, page.request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await waitGanttReady(page)

    // 显式选择 2026RP08（id=8）：窗口 = 2026-07-25..2026-09-07（RP±7d）。
    await page.getByTestId('toolbar-rp-multiselect-trigger').click()
    const rpOpt = page.getByTestId('toolbar-rp-multiselect-opt-8')
    await expect(rpOpt).toBeVisible({ timeout: 15_000 })
    await rpOpt.click()
    await page.keyboard.press('Escape')
    // RP 选择只更新筛选条件，不再自动触发查询 —— 数据在下方 Filter Apply 后才按新窗口拉取。
    // 这里等第一次默认 Apply（openLiveView）的 roster 数据到达（RP 选择本身不重载）。
    await expect
      .poll(async () => (await counts(page)).roster, { timeout: 30_000, message: 'roster after RP select' })
      .toBeGreaterThan(0)

    // 打开 Filter → Division 选 C — Cabin → Apply。
    await dashboard.openFilters()
    await page.getByTestId('filter-crew-division-C').click()
    await applyFilterLight(page)

    // 等待过滤后的 roster 面板行出现，再断言具体 crew 存在性。
    await expect
      .poll(async () => (await readHook<PanelRow[]>(page, 'rosterPanel'))?.length, {
        timeout: 30_000,
        message: 'filtered roster panel rows',
      })
      .toBeGreaterThan(0)
    const rows = (await readHook<PanelRow[]>(page, 'rosterPanel')) ?? []
    const crewIds = rows.map((r) => r.crewId)
    // 895：rank 于 2026-03-31 失效，窗口内无 rank 交集 → 必须排除。
    expect(crewIds).not.toContain('895')
    // 2109：rank/base 窗口内有效 → 必须包含。
    expect(crewIds).toContain('2109')
  })
})
