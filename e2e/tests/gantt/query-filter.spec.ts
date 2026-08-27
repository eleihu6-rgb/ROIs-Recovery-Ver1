/**
 * §Req3 — 覆盖查询/筛选功能：单条件、单条件多取值、多条件组合。
 * 每条用例只有在「Gantt 上确有对象呈现，且这些对象都匹配筛选条件」时才通过（避免假象）。
 *
 * 选用经数据探查确认「确实会收窄且可逐条核对」的筛选项：
 *  - Pairing Base：pairing 对象的 base 可逐条核对（base=YVR 把 6054→1455）
 *  - Flight Dep Airport：flight 航段对象的 depArp 可逐条核对（depArp=YYZ 全部命中）
 *  - 多条件：Pairing Base + Fully-Crewed 同时下发
 *
 * （注：本 demo 数据里 crew division、pairing isFull 不构成对象级可判定不变量，
 *  roster.division 也并非机组 division 的纯映射，故不作为「逐条匹配」断言依据。）
 */
import { test, expect } from '@playwright/test'
import {
  seedGanttAuth,
  gotoGantt,
  waitGanttReady,
  pairingObjects,
  flightObjects,
  openFilter,
  applyFilter,
  selectDropdownOption,
  addFlightPane,
} from '../../utils/gantt-hook'

const PAIRING_BASE = 'YVR'
const FLIGHT_DEP = 'YYZ'

test.describe('Gantt — query / filter (§Req3)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)
  })

  test(`Live-1174 — pairing base = ${PAIRING_BASE}: every pairing object matches base @smoke`, async ({ page }) => {
    await openFilter(page, 'pairing')
    await selectDropdownOption(page, 'filter-pairing-base', PAIRING_BASE, 'pairing')
    await applyFilter(page)

    const after = await pairingObjects(page)
    expect(after.length, 'filtered pairings present').toBeGreaterThan(0)
    // 无假象核心断言：每一条 pairing 对象的 base 都等于所选 base
    expect(
      after.every((p) => p.base === PAIRING_BASE),
      `every pairing base === ${PAIRING_BASE}`,
    ).toBe(true)
    expect([...new Set(after.map((p) => p.base))], 'only one base present').toEqual([PAIRING_BASE])
  })

  test(`Live-1175 — multiple criteria: pairing base ${PAIRING_BASE} + Fully-Crewed Full`, async ({ page }) => {
    await openFilter(page, 'pairing')
    await selectDropdownOption(page, 'filter-pairing-base', PAIRING_BASE, 'pairing')
    await page.getByTestId('filter-pairing-isfull-full').click()
    await applyFilter(page)

    const after = await pairingObjects(page)
    expect(after.length, 'filtered pairings present').toBeGreaterThan(0)
    expect(after.every((p) => p.base === PAIRING_BASE), `all base ${PAIRING_BASE}`).toBe(true)
    expect(after.every((p) => p.isFull === true), 'all fully crewed').toBe(true)
  })

  test(`Live-1176 — flight dep airport = ${FLIGHT_DEP}: every flight leg departs ${FLIGHT_DEP}`, async ({ page }) => {
    // Flight 面板默认不存在，先新增并等待自动加载
    await addFlightPane(page)

    await openFilter(page, 'flight')
    await page.getByTestId('filter-flight-dep').fill(FLIGHT_DEP)
    await page.getByTestId('filter-flight-dep').press('Enter')
    await applyFilter(page)

    const legs = await flightObjects(page)
    expect(legs.length, 'filtered flight legs present').toBeGreaterThan(0)
    // 每一条航段的 depArp 都必须等于所选机场
    expect(legs.every((f) => f.depArp === FLIGHT_DEP), `every leg depArp === ${FLIGHT_DEP}`).toBe(true)
  })
})
