/**
 * Pane-scoped dirty render (P1-2) regression.
 *
 * 纵向滚动是每个 pane 独立的（scrollY 存于 layout-store 的 viewport）。修复前，三个
 * scrollbar 处理函数在改完本 pane 的 scrollY 后都会调用**全局** markDirty()，导致
 * 其它 pane 也跟着重绘。本用例证明修复后的行为：
 *   - 滚动 roster pane → roster 重绘次数增加；
 *   - 同一时刻 pairing pane 重绘次数**不变**（不再被牵连重绘）。
 *
 * 「pairing 不变」这一断言在旧的全局 dirty 实现下会失败，因此是真正的回归用例
 * （§No-Illusion：断言基于 Canvas 真实绘制回执，而非像素猜测）。
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, paneRenders, scrollPaneVertically, waitGanttReady } from '../../utils/gantt-hook'

/** 等待两个面板的重绘次数稳定（连续两次采样相等），排除首屏/后台 append 的余波。 */
const waitRendersStable = async (page: Page): Promise<{ roster: number; pairing: number }> => {
  let prev = { roster: -1, pairing: -1 }
  await expect
    .poll(
      async () => {
        const cur = { roster: await paneRenders(page, 'roster'), pairing: await paneRenders(page, 'pairing') }
        const stable = cur.roster === prev.roster && cur.pairing === prev.pairing
        prev = cur
        return stable
      },
      { timeout: 15_000, intervals: [400, 400, 400, 400] },
    )
    .toBe(true)
  return prev
}

test.describe('Pane-scoped dirty render', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await new GanttDashboardPage(page).goto()
    await waitGanttReady(page)
  })

  test('Live-1163 — vertical scroll redraws the scrolled pane only, not its sibling', async ({ page }) => {
    const before = await waitRendersStable(page)
    expect(before.roster, 'roster painted before scroll').toBeGreaterThan(0)
    expect(before.pairing, 'pairing painted before scroll').toBeGreaterThan(0)

    // Step 1: 纵向滚动 roster pane（仅改本 pane viewport.scrollY，路径同生产 scrollbar）。
    const scrolled = await scrollPaneVertically(page, 'roster', 240)
    expect(scrolled.length, 'a roster pane was scrolled').toBeGreaterThan(0)

    // Step 2: roster 因自身 scrollY 变化而重绘。
    await expect
      .poll(() => paneRenders(page, 'roster'), { timeout: 5_000 })
      .toBeGreaterThan(before.roster)

    // Step 3: pairing 未被牵连——重绘次数与滚动前一致（旧全局 dirty 实现下此断言会失败）。
    expect(await paneRenders(page, 'pairing'), 'sibling pairing not redrawn').toBe(before.pairing)
  })

  test('Live-1164 — scrolling roster then pairing each redraws only itself', async ({ page }) => {
    const base = await waitRendersStable(page)

    // 滚动 roster：roster+1，pairing 不变
    await scrollPaneVertically(page, 'roster', 180)
    await expect.poll(() => paneRenders(page, 'roster'), { timeout: 5_000 }).toBeGreaterThan(base.roster)
    const afterRoster = { roster: await paneRenders(page, 'roster'), pairing: await paneRenders(page, 'pairing') }
    expect(afterRoster.pairing, 'pairing untouched by roster scroll').toBe(base.pairing)

    // 滚动 pairing：pairing+1，roster 不变
    await scrollPaneVertically(page, 'pairing', 180)
    await expect.poll(() => paneRenders(page, 'pairing'), { timeout: 5_000 }).toBeGreaterThan(base.pairing)
    expect(await paneRenders(page, 'roster'), 'roster untouched by pairing scroll').toBe(afterRoster.roster)
  })
})
