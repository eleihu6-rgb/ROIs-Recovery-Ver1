/**
 * Gantt Flight Pane Tests.
 *
 * Flight 面板渲染、选择、双击打开 Flight Detail。Flight 面板默认不在布局里，
 * 由 beforeEach 新增并等待自动加载。断言基于 window.__ganttTest + 弹窗真实内容。
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, paneRenderStat, readHook } from '../../utils/gantt-hook'

const flightStat = (page: import('@playwright/test').Page) => paneRenderStat(page, 'flight')

type FlightProbe = {
  id: number
  schDepDtUtc: string
  rowIndex: number
  rowCenterY: number
  scrollX: number
  pxPerHour: number
  rangeStartIso: string
}

const flightBlockX = (probe: FlightProbe): number => {
  const iso = probe.schDepDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z')
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  return (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
}

const countFlightPixels = async (page: import('@playwright/test').Page, x: number, y: number): Promise<number> =>
  page.evaluate(
    ({ px, py }) => {
      const canvas = document.querySelector('[data-testid="flight-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('flight-canvas not found')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('flight-canvas context not available')
      const sx = Math.max(0, Math.round(px) - 12)
      const sy = Math.max(0, Math.round(py) - 12)
      const data = ctx.getImageData(sx, sy, 24, 24).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (Math.max(r, g, b) - Math.min(r, g, b) > 55) count += 1
      }
      return count
    },
    { px: x, py: y },
  )

const rightClickFlightHeaderRow = async (page: import('@playwright/test').Page, rowIndex: number): Promise<void> => {
  const header = page.getByTestId('pane-header-canvas-flight')
  const box = await header.boundingBox()
  expect(box, 'flight header canvas must have a bounding box').toBeTruthy()
  await page.mouse.click(box!.x + 24, box!.y + 30 + rowIndex * 43 + 21.5, { button: 'right' })
}

const clickFlightHeaderPinIcon = async (page: import('@playwright/test').Page): Promise<void> => {
  const header = page.getByTestId('pane-header-canvas-flight')
  const box = await header.boundingBox()
  expect(box, 'flight header canvas must have a bounding box').toBeTruthy()
  await page.mouse.click(box!.x + box!.width - 10, box!.y + 30 + 21.5)
}

test.describe('Flight Pane', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
  })

  test('Live-1071 — should render the flight pane with flight objects @smoke', async ({ page }) => {
    await expect(dashboard.flightPane).toBeVisible({ timeout: 10_000 })
    await expect(dashboard.flightCanvas).toBeVisible()
    // 真值：flight 对象已加载且 Canvas 画了行（非空白）
    const c = await counts(page)
    expect(c.flightRegistrations, 'flight registrations loaded').toBeGreaterThan(0)
    expect(c.flightLegs, 'flight legs loaded').toBeGreaterThan(0)
    const stat = await flightStat(page)
    expect(stat?.totalRows ?? 0, 'flight canvas drew rows').toBeGreaterThan(0)
  })

  test('Live-1072 — should keep flight objects rendered while scrolling', async ({ page }) => {
    const before = await flightStat(page)
    const box = await dashboard.flightCanvas.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 400)
    await expect.poll(async () => (await flightStat(page))?.renders ?? 0).toBeGreaterThan(before!.renders)
    expect((await counts(page)).flightRegistrations, 'flight objects preserved during scroll').toBeGreaterThan(0)
  })

  test('Live-1073 — double-click a flight puck opens Flight Detail with real flight info', async ({ page }) => {
    const box = await dashboard.flightCanvas.boundingBox()
    expect(box).not.toBeNull()

    // 在内容区前几行、靠近时间轴起点处尝试命中最早的航班 puck。
    const headerHeight = 30
    const dialog = dashboard.flightDetailDialog
    const candidates = [40, 40 + 44, 40 + 88]
    let opened = false
    for (const dy of candidates) {
      await page.mouse.dblclick(box!.x + 70, box!.y + headerHeight + dy)
      if (await dialog.isVisible().catch(() => false)) { opened = true; break }
      await page.waitForTimeout(150)
    }
    expect(opened, 'flight detail dialog opened on a puck').toBe(true)

    // 弹窗含真实航班信息（航段机场三字码），不是空壳
    await expect(dialog).toBeVisible()
    const arp = dialog.locator('.route-arp-code').first()
    await expect(arp).toBeVisible()
    await expect(arp).toHaveText(/^[A-Z]{3}$/)

    // Flight Date = departure-airport local calendar day of STD (same zone as STD).
    const flightDateEl = dialog.getByTestId('flight-detail-flight-date')
    await expect(flightDateEl).toBeVisible()
    await expect(flightDateEl).not.toHaveText('—')
    const flightDateText = (await flightDateEl.textContent())?.trim() ?? ''
    expect(flightDateText).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
    await expect(dialog.getByTestId('flight-detail-header-date')).toContainText(flightDateText)

    // Crew Assignment: five columns only (Live + Scenario shared dialog)
    const crewTable = dialog.locator('.crew-table')
    await expect(crewTable).toBeVisible()
    const headers = crewTable.locator('thead th')
    await expect(headers).toHaveCount(6)
    await expect(headers).toHaveText(['Crew ID', 'Name', 'Base', 'Active Rank', 'Acting Rank', 'Source'])
    for (const gone of ['Seq', 'Label', 'MBH', 'MFDP']) {
      await expect(crewTable.locator('thead th', { hasText: gone })).toHaveCount(0)
    }

    // Wait for crew fetch to settle, then assert UI matches GET /api/flight/:id/crew
    // (same-origin via Vite proxy + session auth — page.request would miss Bearer).
    await expect(dialog.getByText('Loading crew data')).toHaveCount(0, { timeout: 15_000 })
    const idText = await dialog.getByTestId('flight-detail-flight-id').textContent()
    const idMatch = idText?.match(/#(\d+)/)
    expect(idMatch, 'flight detail header includes #fltId').toBeTruthy()
    const fltId = Number(idMatch![1])
    const apiItems = await page.evaluate(async (id) => {
      const raw = sessionStorage.getItem('rois-auth')
      if (!raw) throw new Error('rois-auth missing')
      const { token } = JSON.parse(raw) as { token: string }
      const res = await fetch(`/altair/live/api/flight/${id}/crew`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`crew API ${res.status}`)
      const body = await res.json() as { data?: { items?: Array<{ crewId: string }> } }
      return body.data?.items ?? []
    }, fltId)
    if (apiItems.length > 0) {
      await expect(crewTable.locator('.crew-id-val')).toHaveCount(apiItems.length)
      await expect(crewTable.locator('.crew-id-val').first()).toHaveText(apiItems[0].crewId)
      await expect(dialog).not.toContainText('No crew assigned')

      // Crew ID opens Crew Info above Flight Detail; Close returns to Flight Detail.
      const firstCrewId = apiItems[0].crewId
      await crewTable.getByTestId(`flight-crew-id-${firstCrewId}`).click()
      const crewInfo = page.getByTestId('crew-info-dialog')
      await expect(crewInfo).toBeVisible({ timeout: 10_000 })
      await expect(crewInfo).toContainText(firstCrewId)
      await expect(dialog).toBeVisible()
      await page.getByTestId('crew-info-close').click()
      await expect(crewInfo).toHaveCount(0)
      await expect(dialog).toBeVisible()
    } else {
      await expect(dialog).toContainText('No crew assigned')
    }

    // 关闭（关闭按钮，Escape 兜底）
    await dialog.getByTestId('flight-detail-close').click()
    await expect(dialog).toBeHidden()
  })

  test('Live-1074 — flight header row can be pinned and unpinned without blanking the right canvas', async ({ page }) => {
    const probe = await readHook<FlightProbe | null>(page, 'flightProbe')
    expect(probe, 'a visible flight block exists').not.toBeNull()
    const x = flightBlockX(probe!) + 5

    await rightClickFlightHeaderRow(page, probe!.rowIndex)
    const menu = page.locator('.fixed.z-50')
    await expect(menu.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)
    await menu.getByText('Pin 1 Selected Row', { exact: true }).click()
    await expect(menu).toHaveCount(0)

    await expect
      .poll(() => countFlightPixels(page, x, 30 + 21.5), {
        timeout: 5_000,
        message: 'pinned live flight row should still show its flight block on the right canvas',
      })
      .toBeGreaterThan(20)

    await clickFlightHeaderPinIcon(page)
    await rightClickFlightHeaderRow(page, probe!.rowIndex)
    const afterUnpinMenu = page.locator('.fixed.z-50')
    await expect(afterUnpinMenu.getByText('Pin 1 Selected Row', { exact: true })).toHaveCount(1)
    await expect(afterUnpinMenu.getByText('Unpin All (1)', { exact: true })).toHaveCount(0)
  })
})
