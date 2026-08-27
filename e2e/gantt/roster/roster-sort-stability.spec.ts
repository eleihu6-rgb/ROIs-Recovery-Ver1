import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, waitGanttReady, applyFilterLight } from '../../utils/gantt-hook'

interface PanelOrderRow { crewId: string; rank: string }
interface ZoomState { pxPerHour: number; scrollX: number; rangeStartIso: string }

const indexOf = (rows: PanelOrderRow[], crewId: string): number =>
  (rows ?? []).findIndex((r) => r.crewId === crewId)

/**
 * Regression: Rule 2 失效红线暴露出的排序稳定性问题。1901 的 rank IFD 于窗口内失效
 * （RP08 窗口 07-25..09-07，07-31 失效）。旧行为下默认排序用「视口左侧日期的有效职级」，
 * 横向滚动跨过 07-31 会让 1901 从末尾跳到前面。修复后排序用窗口起点的稳定职级，位置不变。
 * 数据依赖目标环境（UAT 已实证 1901）。
 */
test.describe('roster sort stability across horizontal scroll', () => {
  test('1901 row position does not change when the viewport crosses its rank expiry', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, page.request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await waitGanttReady(page)

    // 选 2026RP08（id=8），窗口 = 2026-07-25..2026-09-07；再 Filter Division=C（Cabin）。
    await page.getByTestId('toolbar-rp-multiselect-trigger').click()
    await expect(page.getByTestId('toolbar-rp-multiselect-opt-8')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('toolbar-rp-multiselect-opt-8').click()
    await page.keyboard.press('Escape')
    await dashboard.openFilters()
    await page.getByTestId('filter-crew-division-C').click()
    await applyFilterLight(page)

    // 等过滤后的 roster 就绪且 1901 在列。
    await expect
      .poll(async () => {
        const rows = (await readHook<PanelOrderRow[]>(page, 'rosterPanelOrder')) ?? []
        return indexOf(rows, '1901')
      }, { timeout: 30_000, message: '1901 loaded after Cabin filter' })
      .toBeGreaterThanOrEqual(0)

    const z = (await readHook<ZoomState>(page, 'zoom')) ?? { pxPerHour: 60, scrollX: 0, rangeStartIso: '' }
    const pxPerHour = z.pxPerHour || 60

    // July 视图：左侧 = 窗口起点（scrollX=0）→ 1901 的 rank IFD 有效。
    await page.evaluate(() => window.__ganttTest?.setScrollX?.(0))
    await expect
      .poll(async () => (await readHook<ZoomState>(page, 'zoom'))?.scrollX === 0, { message: 'scrolled to July' })
      .toBeTruthy()
    await page.waitForTimeout(400) // 等 React 重建 + panelRows 发布
    const idxJuly = indexOf((await readHook<PanelOrderRow[]>(page, 'rosterPanelOrder')) ?? [], '1901')

    // August 视图：左侧 ≈ 窗口起点 +10 天（> 07-31）→ 旧行为下 1901 的显示职级为空、排到末尾。
    const augX = Math.round(pxPerHour * 24 * 10)
    await page.evaluate((x) => window.__ganttTest?.setScrollX?.(x), augX)
    await expect
      .poll(async () => (await readHook<ZoomState>(page, 'zoom'))?.scrollX === augX, { message: 'scrolled to August' })
      .toBeTruthy()
    await page.waitForTimeout(400)
    const idxAug = indexOf((await readHook<PanelOrderRow[]>(page, 'rosterPanelOrder')) ?? [], '1901')

    // 排序必须稳定：1901 在 July 与 August 视图下位置一致。
    expect(idxJuly).toBeGreaterThanOrEqual(0)
    expect(idxAug).toBe(idxJuly)
  })
})
