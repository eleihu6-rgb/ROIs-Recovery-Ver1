/**
 * §Req7 — 其余核心功能的回归覆盖：刷新、布局重置。
 * 均以「Gantt 实际呈现的对象」为断言依据（避免假象）。
 */
import { test, expect } from '@playwright/test'
import {
  seedGanttAuth,
  gotoGantt,
  waitGanttReady,
  counts,
  paneRenders,
  paneTypes,
} from '../../utils/gantt-hook'

const rosterRenders = (page: import('@playwright/test').Page) => paneRenders(page, 'roster')

test.describe('Gantt — other functions (§Req7)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)
  })

  test('Live-1108 — Refresh re-fetches and preserves all objects @smoke', async ({ page }) => {
    const before = await counts(page)
    expect(before.roster).toBeGreaterThan(0)
    expect(before.pairing).toBeGreaterThan(0)
    const renders0 = await rosterRenders(page)

    await page.getByTestId('refresh-btn').click()
    await waitGanttReady(page)

    const after = await counts(page)
    expect(after.roster, 'roster objects present after refresh').toBeGreaterThan(0)
    expect(after.pairing, 'pairing objects present after refresh').toBeGreaterThan(0)
    // Canvas 重新绘制
    await expect.poll(() => rosterRenders(page)).toBeGreaterThan(renders0)
  })

  test('Live-1109 — Reset layout returns to default roster + pairing panes', async ({ page }) => {
    // 先新增一个 flight 面板
    await page.getByTestId('add-pane-flight').click()
    await expect.poll(() => paneTypes(page)).toContain('flight')

    // 重置布局
    await page.getByTestId('reset-layout').click()

    // 回到默认两个面板，且默认面板对象仍呈现
    await expect.poll(() => paneTypes(page)).not.toContain('flight')
    const types = await paneTypes(page)
    expect(types).toEqual(expect.arrayContaining(['roster', 'pairing']))

    await waitGanttReady(page)
    const c = await counts(page)
    expect(c.roster, 'roster still shows objects after reset').toBeGreaterThan(0)
    expect(c.pairing, 'pairing still shows objects after reset').toBeGreaterThan(0)
  })
})
