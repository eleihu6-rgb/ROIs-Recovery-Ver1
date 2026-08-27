/**
 * §Req1 — 打开 Gantt 时，所有默认面板必须已加载对象，无需任何额外操作触发加载。
 *
 * 默认布局为 Roster + Pairing 两个面板（见 layout-store DEFAULT_GRID）。
 * 本用例只「打开」Gantt，不做任何点击/筛选，然后断言：
 *   - 默认面板类型存在（roster + pairing）
 *   - ready()：所有可见数据面板都已把对象呈现给用户
 *   - store 计数 > 0（对象确实加载）
 *   - Canvas 绘制回执 totalRows>0 且 renders>0（对象确实被画出，非空白面板）
 *
 * 断言基于 window.__ganttTest 自省钩子（store 真值 + Canvas 回执），避免假象。
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady, counts, renderStats } from '../../utils/gantt-hook'

test.describe('Gantt — panes auto-load on open (§Req1)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Live-1141 — opening gantt auto-loads roster + pairing objects with no extra action @smoke', async ({ page }) => {
    await gotoGantt(page)

    // 默认布局应为 roster + pairing（不含 flight）
    const types = await page.evaluate(() => window.__ganttTest!.paneTypes())
    expect(types, 'default panes').toEqual(expect.arrayContaining(['roster', 'pairing']))

    // 关键：不做任何额外操作，仅等待面板把对象呈现出来
    await waitGanttReady(page)

    const c = await counts(page)
    expect(c.roster, 'roster objects loaded on open').toBeGreaterThan(0)
    expect(c.pairing, 'pairing objects loaded on open').toBeGreaterThan(0)

    // Canvas 真的画了这些对象（非空白面板）
    const stats = await renderStats(page)
    const roster = stats.find((s) => s.paneType.startsWith('roster'))
    const pairing = stats.find((s) => s.paneType.startsWith('pairing'))

    expect(roster, 'roster pane render receipt').toBeTruthy()
    expect(roster!.totalRows, 'roster canvas drew rows').toBeGreaterThan(0)
    expect(roster!.renders, 'roster canvas painted').toBeGreaterThan(0)

    expect(pairing, 'pairing pane render receipt').toBeTruthy()
    expect(pairing!.totalRows, 'pairing canvas drew rows').toBeGreaterThan(0)
    expect(pairing!.renders, 'pairing canvas painted').toBeGreaterThan(0)
  })
})
