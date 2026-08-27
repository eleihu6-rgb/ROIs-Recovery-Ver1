/**
 * Locate Flight — right-click a roster puck that has a flight id offers
 * "Locate Flight" only when the Flight pane is open; choosing it floats that
 * flight into the Flight pane's found tier (top) and selects it.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

interface RosterProbe {
  id: number
  pairingId: number
  crewId: string
  schStrDtUtc: string
  rowIndex: number
  scrollX: number
  scrollY: number
  pxPerHour: number
  rangeStartIso: string
  headerHeight: number
  rowHeight: number
}

const puckClickXY = (probe: RosterProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

const rightClickPuck = async (canvas: Locator, probe: RosterProbe): Promise<void> => {
  const box = await canvas.boundingBox()
  const { x, y } = puckClickXY(probe)
  test.skip(!box || x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4,
    'probed roster puck is outside the visible canvas')
  await canvas.click({ position: { x, y }, button: 'right' })
}

const foundFlightIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__ganttTest!.foundIds!('flight'))

const setFlightPaneVisible = async (page: Page, visible: boolean): Promise<void> => {
  await page.evaluate(
    (v) => window.__ganttTest!.setPaneVisible!('flight', v),
    visible,
  )
}

test.describe('Locate Flight', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1401 — Locate Flight absent when Flight pane is closed', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster pairing puck exists').not.toBeNull()

    const items = await readHook<Array<{ id: number; fltId: number | null }>>(page, 'roster')
    const withFlt = items.find((i) => i.id === probe!.id && i.fltId != null)
    test.skip(!withFlt?.fltId, 'probed roster duty has no flight id')

    await setFlightPaneVisible(page, false)
    await rightClickPuck(dashboard.rosterCanvas, probe!)
    await expect(page.getByRole('button', { name: 'Locate Pairing' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Locate Flight' })).toHaveCount(0)
  })

  test('Live-1402 — Locate Flight floats the flight into the Flight pane found tier', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster pairing puck exists').not.toBeNull()

    const items = await readHook<Array<{ id: number; fltId: number | null }>>(page, 'roster')
    const withFlt = items.find((i) => i.id === probe!.id && i.fltId != null)
    test.skip(!withFlt?.fltId, 'probed roster duty has no flight id')

    await setFlightPaneVisible(page, true)
    await rightClickPuck(dashboard.rosterCanvas, probe!)
    const locate = page.getByRole('button', { name: 'Locate Flight' })
    await expect(locate).toBeVisible({ timeout: 5_000 })
    await locate.click()

    await expect.poll(() => foundFlightIds(page), {
      message: 'located flight floated into Flight pane found tier',
      timeout: 10_000,
    }).toEqual([String(withFlt!.fltId)])
  })
})
