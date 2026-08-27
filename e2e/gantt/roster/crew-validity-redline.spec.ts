import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, waitGanttReady } from '../../utils/gantt-hook'

interface ValidityBlock { crewId: string; blockMs: number }

/**
 * Rule 2（失效红线）：机组 rank/base 在窗口内有覆盖断档时，其行上会从断档点画红色虚线段。
 * 探针 rosterValidityBlocks 暴露每个机组窗口内首个断档时刻（ms）。
 * 数据依赖目标环境（UAT 已实证：1901 rank IFD 于 2026-07-31 失效且无后续覆盖 → 有 block；
 * 2109 rank/base 覆盖整窗口 → 无 block）。
 */
test.describe('crew validity red line', () => {
  test('crew with rank expiry inside the RP window exposes a validity block at the expiry', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, page.request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await waitGanttReady(page)

    // 显式选 2026RP08（id=8）：窗口 = 2026-07-25..2026-09-07。
    await page.getByTestId('toolbar-rp-multiselect-trigger').click()
    await expect(page.getByTestId('toolbar-rp-multiselect-opt-8')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('toolbar-rp-multiselect-opt-8').click()
    await page.keyboard.press('Escape')

    // 完整 crew 历史（含 ranks/bases）后台加载后，失效点探针才出现 1901 的 block。
    await expect
      .poll(async () => {
        const blocks = (await readHook<ValidityBlock[]>(page, 'rosterValidityBlocks')) ?? []
        return blocks.find((b) => b.crewId === '1901')?.blockMs ?? null
      }, { timeout: 30_000, message: '1901 validity block appears after crew history load' })
      .not.toBeNull()

    const blocks = (await readHook<ValidityBlock[]>(page, 'rosterValidityBlocks')) ?? []
    const row = blocks.find((b) => b.crewId === '1901')
    expect(row).toBeTruthy()
    // 1901 的 rank IFD 失效于 2026-07-31（窗口内）→ 红线从该日期开始。
    expect(new Date(row!.blockMs).toISOString().slice(0, 10)).toBe('2026-07-31')
    // 有效机组（2109）覆盖整窗口 → 不应有 block 条目。
    expect(blocks.find((b) => b.crewId === '2109')).toBeUndefined()
  })
})
