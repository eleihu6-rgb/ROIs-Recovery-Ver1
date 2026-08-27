/**
 * V4-P02 regression: pairing geometry + duty grouping must be unchanged after
 * the render-model (memoized buckets + msToX) refactor.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, waitGanttReady } from '../../utils/gantt-hook'

let dashboard: GanttDashboardPage

test.beforeEach(async ({ page, request }) => {
  await seedGanttAuth(page, request)
  dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await waitGanttReady(page)
})

test('Live-1172 — pairing segment click-selection works at computed position (parity pin)', async ({ page }) => {
  type Probe = {
    segId: number; schStrDtUtc: string; rowIndex: number; scrollX: number
    scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
  }
  const probe = await readHook<Probe | null>(page, 'pairingProbe')
  expect(probe, 'a visible pairing segment exists').not.toBeNull()

  const iso = probe!.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z')
  const rangeStartMs = Date.parse(probe!.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe!.pxPerHour - probe!.scrollX
  const rowTop = probe!.headerHeight + probe!.rowIndex * probe!.rowHeight - probe!.scrollY
  const centerY = rowTop + Math.floor(probe!.rowHeight / 2)

  await page.getByTestId('pairing-canvas').click({ position: { x: x + 5, y: centerY } })
  const selected = await page.evaluate(
    (id) => (window as unknown as { __ganttTest: { isPairingSegSelected: (i: number) => boolean } }).__ganttTest.isPairingSegSelected(id),
    probe!.segId,
  )
  expect(selected).toBe(true)
})

test('Live-1173 — duty grouping identical between live grouping and prebuilt buckets', async ({ page }) => {
  const result = await readHook<{ compared: number; mismatches: unknown[] }>(page, 'comparePairingBuckets20')
  expect(result.mismatches).toEqual([])
  expect(result.compared).toBeGreaterThan(0)
})
