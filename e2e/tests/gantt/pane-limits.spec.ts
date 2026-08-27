/**
 * Pane 数量与放置限制（本次需求）：
 *   1. 每类面板最多 2 个：最多 2 个 roster、最多 2 个 pairing。
 *      达到上限后对应的 Add 按钮禁用（即便总数还没到 4）。
 *   2. 新增面板（sub-pane）始终堆叠在现有面板「下方」，绝不放到右侧列。
 *      —— 网格中任何一行的右列（col 1）都应为空。
 *
 * 断言基于 window.__ganttTest 暴露的 store 真值（panes / grid），不靠像素或纯可见性。
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady, readHook } from '../../utils/gantt-hook'

type Grid = Array<Array<string | null>>
const grid = (page: import('@playwright/test').Page) => readHook<Grid>(page, 'grid')
const panes = (page: import('@playwright/test').Page) =>
  readHook<Array<{ id: string; type: string }>>(page, 'panes')
const countType = async (page: import('@playwright/test').Page, type: string) =>
  (await panes(page)).filter((p) => p.type === type).length

test.describe('Gantt — pane limits (max 2 per type, stack below)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)
  })

  test('Live-1160 — caps roster panes at 2 and stacks the new pane below (not on the right)', async ({ page }) => {
    // 默认布局：1 个 roster（row 0）+ 1 个 pairing（row 1），均为单面板行。
    expect(await countType(page, 'roster')).toBe(1)
    const before = await grid(page)
    expect(before.filter((r) => r.some(Boolean)).length).toBe(2)
    expect(before.every((r) => r[1] === null), 'no pane on the right column initially').toBe(true)

    // 新增第 2 个 roster 面板。
    await page.getByTestId('add-pane-roster').click()
    await expect.poll(() => countType(page, 'roster')).toBe(2)

    // 堆叠校验：新面板进入新的一行（col 0），右列始终为空——没有左右并排。
    const after = await grid(page)
    const nonEmpty = after.filter((r) => r.some(Boolean))
    expect(nonEmpty.length, 'a new row was added below').toBe(3)
    expect(after.every((r) => r[1] === null), 'new pane stacked below, nothing on the right').toBe(true)
    // 最后一行 col 0 是刚加的第二个 roster。
    const lastRow = nonEmpty[nonEmpty.length - 1]
    expect(lastRow[0]).toBe('roster-2')

    // 上限校验：roster 已达 2，即便总面板数为 3（< 4），Add Roster 按钮仍禁用。
    await expect(page.getByTestId('add-pane-roster')).toBeDisabled()

    // 再次点击不会新增（受 disabled 保护，强制点击也无副作用）。
    await page.getByTestId('add-pane-roster').click({ force: true }).catch(() => {})
    expect(await countType(page, 'roster')).toBe(2)
  })

  test('Live-1161 — caps pairing panes at 2 independently of roster', async ({ page }) => {
    expect(await countType(page, 'pairing')).toBe(1)

    // pairing 按钮此时可用（pairing 只有 1 个，总数 2 < 4）。
    await expect(page.getByTestId('add-pane-pairing')).toBeEnabled()
    await page.getByTestId('add-pane-pairing').click()
    await expect.poll(() => countType(page, 'pairing')).toBe(2)

    // 第二个 pairing 也堆叠在下方，右列为空。
    const g = await grid(page)
    expect(g.every((r) => r[1] === null), 'pairing pane stacked below, not on the right').toBe(true)

    // pairing 达上限 → 禁用；roster 仍是 1，roster 按钮仍可用（per-type 独立）。
    await expect(page.getByTestId('add-pane-pairing')).toBeDisabled()
    await expect(page.getByTestId('add-pane-roster')).toBeEnabled()
  })

  // Flight 面板上限为 1（Ryan：roster 2 / pairing 2 / flight 1）。
  // 回归保护：若 MAX_PANES_PER_TYPE.flight 退回 2，加第二个 flight 面板会成功 → 本测试失败。
  test('Live-1162 — caps flight panes at 1', async ({ page }) => {
    // 默认布局不含 flight 面板，按钮可用（0 < 1，总数 2 < 4）。
    expect(await countType(page, 'flight')).toBe(0)
    await expect(page.getByTestId('add-pane-flight')).toBeEnabled()

    await page.getByTestId('add-pane-flight').click()
    await expect.poll(() => countType(page, 'flight')).toBe(1)

    // 达上限 → 禁用；强制再点也不新增。
    await expect(page.getByTestId('add-pane-flight')).toBeDisabled()
    await page.getByTestId('add-pane-flight').click({ force: true }).catch(() => {})
    expect(await countType(page, 'flight')).toBe(1)
  })
})
