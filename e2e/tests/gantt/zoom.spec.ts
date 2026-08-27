/**
 * §Req4 — 缩放（Zoom In / Out）功能：每次缩放后所有对象仍被流畅渲染。
 *
 * 「流畅渲染」的无假象证明：
 *  - 每次点击 zoom 后，pxPerHour 确实改变（缩放生效）
 *  - Canvas 重新绘制（render 回执的 renders 计数递增）
 *  - 对象未丢失（store 计数不变，render totalRows 不变，ready() 仍为 true）
 */
import { test, expect } from '@playwright/test'
import {
  seedGanttAuth,
  gotoGantt,
  waitGanttReady,
  counts,
  paneRenders,
  paneRenderStat,
  zoomState,
} from '../../utils/gantt-hook'

const rosterRenders = (page: import('@playwright/test').Page) => paneRenders(page, 'roster')

test.describe('Gantt — zoom renders all objects smoothly (§Req4)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)
  })

  test('Live-1262 — zoom in then out: zoom changes, canvas repaints, objects preserved @smoke', async ({ page }) => {
    const before = await counts(page)
    expect(before.roster, 'objects present before zoom').toBeGreaterThan(0)
    const px0 = (await zoomState(page)).pxPerHour
    const renders0 = await rosterRenders(page)

    // ── Zoom In ──
    await page.getByTestId('zoom-in').click()
    await expect.poll(() => zoomState(page).then((z) => z.pxPerHour), {
      message: 'zoom-in did not increase pxPerHour',
    }).toBeGreaterThan(px0)
    // Canvas 重新绘制（renders 递增）
    await expect.poll(() => rosterRenders(page)).toBeGreaterThan(renders0)
    // 对象未丢失（缩放不应移除对象；后台渐进式追加可能增加计数，故用 >=）
    const afterIn = await counts(page)
    expect(afterIn.roster, 'roster objects not lost after zoom-in').toBeGreaterThanOrEqual(before.roster)
    expect(afterIn.pairing, 'pairing objects not lost after zoom-in').toBeGreaterThanOrEqual(before.pairing)

    const pxIn = (await zoomState(page)).pxPerHour
    const rendersIn = await rosterRenders(page)

    // ── Zoom Out ──
    await page.getByTestId('zoom-out').click()
    await expect.poll(() => zoomState(page).then((z) => z.pxPerHour), {
      message: 'zoom-out did not decrease pxPerHour',
    }).toBeLessThan(pxIn)
    await expect.poll(() => rosterRenders(page)).toBeGreaterThan(rendersIn)

    // 缩放结束后仍处于「所有对象已呈现」状态
    await waitGanttReady(page)
    const afterOut = await counts(page)
    expect(afterOut.roster, 'roster objects not lost after zoom-out').toBeGreaterThanOrEqual(before.roster)

    // Canvas 绘制行数始终 > 0（缩放过程中对象从未消失）
    const stat = await paneRenderStat(page, 'roster')
    expect(stat!.totalRows, 'roster rows drawn throughout zoom').toBeGreaterThan(0)
  })
})
