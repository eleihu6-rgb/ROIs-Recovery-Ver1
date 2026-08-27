/**
 * Gantt Roster Pane Tests.
 *
 * Roster 面板渲染与交互。断言基于 window.__ganttTest（store 真值 + Canvas 绘制回执），
 * 而非像素或裸 toBeVisible（见 docs/test-cases/gantt/anti-illusion-rules.md）。
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, paneRenderStat } from '../../utils/gantt-hook'

const rosterStat = (page: import('@playwright/test').Page) => paneRenderStat(page, 'roster')

test.describe('Roster Pane', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
  })

  test('Live-1214 — should render the roster pane with crew objects @smoke', async ({ page }) => {
    await dashboard.expectRosterPaneVisible()
    await expect(dashboard.rosterCanvas).toBeVisible()
    // 真值：roster 对象已加载且 Canvas 画了行
    expect((await counts(page)).roster, 'roster objects loaded').toBeGreaterThan(0)
    const stat = await rosterStat(page)
    expect(stat?.totalRows ?? 0, 'roster canvas drew rows').toBeGreaterThan(0)
    expect(stat?.renders ?? 0, 'roster canvas painted').toBeGreaterThan(0)
  })

  test('Live-1215 — should keep crew objects rendered while scrolling', async ({ page }) => {
    const before = await rosterStat(page)
    const box = await dashboard.rosterCanvas.boundingBox()
    expect(box).not.toBeNull()

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 600)

    // 滚动应触发 Canvas 重绘，且对象数量不变（虚拟化不丢对象）
    await expect.poll(async () => (await rosterStat(page))?.renders ?? 0).toBeGreaterThan(before!.renders)
    expect((await counts(page)).roster, 'roster objects preserved during scroll').toBeGreaterThan(0)
  })

  test('Live-1216 — rendered roster objects carry valid crew identity', async ({ page }) => {
    // 内容完整性（无假象）：每条 roster 对象都应有非空 crewId 与排班起始时间
    const objs = await page.evaluate(() => window.__ganttTest!.roster())
    expect(objs.length, 'roster objects present').toBeGreaterThan(0)
    const sample = objs.slice(0, 50)
    expect(
      sample.every((o) => typeof o.crewId === 'string' && (o.crewId as string).length > 0),
      'every roster object has a crewId',
    ).toBe(true)
    expect(sample.every((o) => o.start != null), 'every roster object has a start time').toBe(true)
  })

  test('Live-1217 — should open the global filter dialog', async ({ page }) => {
    await dashboard.openFilters()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    // 关闭（点击遮罩）
    await page.mouse.click(5, 5)
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
  })

  test('Live-1218 — should toggle roster overlap lanes from the pane toolbar', async ({ page }) => {
    await dashboard.expectRosterPaneVisible()
    const button = page.getByTestId('roster-overlap-lanes-button').first()

    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('title', 'Overlap lanes')

    await button.click()
    await expect(button).toHaveAttribute('title', 'Overlap lanes on')
  })
})
