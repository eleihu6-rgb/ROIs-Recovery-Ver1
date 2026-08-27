/**
 * §Req8 — 多步骤真实操作链：用户不会做完一步就停。
 * 场景：应用筛选 → 校验对象被收窄且都匹配 → 取消筛选 → 校验对象恢复 → 再次应用。
 * 每一步都有中间断言，且都基于「Gantt 实际呈现的对象」（避免假象）。
 *
 * 采用 Pairing Base 作为可逐条核对、且确实收窄的筛选项。
 */
import { test, expect } from '@playwright/test'
import {
  seedGanttAuth,
  gotoGantt,
  waitGanttReady,
  counts,
  pairingObjects,
  openFilter,
  applyFilter,
  selectDropdownOption,
} from '../../utils/gantt-hook'

const BASE = 'YVR'
const baseSet = (objs: Array<Record<string, unknown>>): string[] =>
  [...new Set(objs.map((o) => String(o.base)))].sort()

test.describe('Gantt — multi-step query workflow (§Req8)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)
  })

  test('Live-1104 — apply base filter → narrow → clear → restore → re-apply', async ({ page }) => {
    // Step 0 — 基线
    const baseline = await pairingObjects(page)
    expect(baseline.length, 'baseline pairings present').toBeGreaterThan(0)
    const baselineBases = baseSet(baseline)

    // Step 1 — 应用 base=YVR：收窄且每条都匹配
    await openFilter(page, 'pairing')
    await selectDropdownOption(page, 'filter-pairing-base', BASE, 'pairing')
    await applyFilter(page)
    const filtered = await pairingObjects(page)
    expect(filtered.length, 'filtered pairings present').toBeGreaterThan(0)
    expect(baseSet(filtered), 'only YVR after filter').toEqual([BASE])

    // Step 2 — 取消筛选（Reset + Apply）：对象恢复到基线集合
    await openFilter(page, 'pairing')
    await page.getByTestId('filter-reset').click()
    await applyFilter(page)
    const restored = await pairingObjects(page)
    expect(restored.length, 'restored pairings present').toBeGreaterThan(0)
    expect(baseSet(restored), 'base set restored to baseline').toEqual(baselineBases)

    // Step 3 — 再次应用 base=YVR：可继续操作，且仍逐条匹配
    await openFilter(page, 'pairing')
    await selectDropdownOption(page, 'filter-pairing-base', BASE, 'pairing')
    await applyFilter(page)
    const reFiltered = await pairingObjects(page)
    expect(reFiltered.length, 'pairings after re-filter').toBeGreaterThan(0)
    expect(baseSet(reFiltered), 'only YVR after re-filter').toEqual([BASE])

    // 全程面板始终「有对象呈现」
    expect((await counts(page)).pairing).toBeGreaterThan(0)
  })
})
