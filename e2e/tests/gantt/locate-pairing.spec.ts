import { test, expect, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, scrollPaneVertically } from '../../utils/gantt-hook'

/**
 * Locate Pairing — right-clicking a roster puck that belongs to a pairing offers
 * "Locate Pairing"; choosing it must bring that pairing to the TOP row of the
 * Pairing pane and scroll the pane to the top so the user can see it.
 *
 * Regression intent (reported bug, 2026-06-11): "right click on roster puck →
 * Locate Pairing seems cannot bring pairing to the top row." The handler only
 * called selectTask + setVisible('pairing') and never floated the pairing into
 * the pane's top "found" tier nor scrolled there. This test asserts the pairing
 * becomes pairingPanelOrder()[0] and the pane scrollY returns to 0 — it fails
 * against the pre-fix handler.
 */

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

/** Compute canvas click coordinates for a probed roster puck (mirrors find-crew). */
const puckClickXY = (probe: RosterProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

/** Read a pairing pane's viewport scrollY via the test hook (paneScrollY takes a pane-type arg). */
const pairingScrollY = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const api = window.__ganttTest as unknown as { paneScrollY: (p: string) => number }
    return api.paneScrollY('pairing')
  })

/** Right-click a roster puck; skip if its computed point falls outside the canvas. */
const rightClickPuck = async (canvas: Locator, probe: RosterProbe): Promise<void> => {
  const box = await canvas.boundingBox()
  const { x, y } = puckClickXY(probe)
  test.skip(!box || x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4,
    'probed roster puck is outside the visible canvas')
  await canvas.click({ position: { x, y }, button: 'right' })
}

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

/** Composition row count for a pairing, straight from the detail endpoint. */
const compositionCountOf = async (
  request: import('@playwright/test').APIRequestContext,
  token: string,
  pairingId: number,
): Promise<number> => {
  const res = await request.get(`${GANTT_API}/api/pairing/${pairingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `pairing detail ${res.status()}`).toBeTruthy()
  const data = (await res.json()).data ?? (await res.json())
  return Array.isArray(data.compositions) ? data.compositions.length : 0
}

type PairingHookRow = { id: number; compLen: number }

test.describe('Locate Pairing', () => {
  let dashboard: GanttDashboardPage
  let token: string

  test.beforeEach(async ({ page, request }) => {
    // Wide viewport → wider canvas time window → more pucks clickable.
    await page.setViewportSize({ width: 1920, height: 1080 })
    token = await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1101 — right-click roster puck → Locate Pairing floats the pairing to the top row and scrolls the pane to top', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()

    // Pre-scroll the pairing pane down so "scroll to top" is observable. Only assert
    // the scroll-back when there were enough rows for it to actually scroll (>0).
    await scrollPaneVertically(page, 'pairing', 800)
    const scrolledDown = await pairingScrollY(page)

    await rightClickPuck(dashboard.rosterCanvas, probe!)

    const locate = page.getByRole('button', { name: 'Locate Pairing' })
    await expect(locate).toBeVisible({ timeout: 5_000 })
    await locate.click()

    // Core regression: the located pairing must become the TOP row of the pairing pane.
    await expect.poll(async () => {
      const order = await readHook<Array<{ id: string; label: string }>>(page, 'pairingPanelOrder')
      return order[0]?.id
    }, { message: 'located pairing floated to the top row', timeout: 10_000 })
      .toBe(String(probe!.pairingId))

    // And the pane scrolled to the top so the row is visible.
    if (scrolledDown > 0) {
      await expect.poll(() => pairingScrollY(page), {
        message: 'pairing pane scrolled to top',
        timeout: 10_000,
      }).toBe(0)
    }
  })

  test('Live-1271 — Locate Pairing loads composition for an OFF-SCREEN pairing (getDetail path, no "-")', async ({ page, request }) => {
    // Regression (2026-06-11): locating a pairing that is NOT in the pairing pane
    // (e.g. filtered out) fetched it via getDetail, which returned composition as
    // separate rows and left Pairing.composition empty — so the located rows showed
    // "-" in the Comp column and read as full coverage. getDetail now backfills it.
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()

    const expectedComp = await compositionCountOf(request, token, probe!.pairingId)
    test.skip(expectedComp === 0, 'probed pairing has no composition rows to verify')

    // Force the off-screen path: empty the pairing pane so Locate must getDetail-load it.
    await page.evaluate(() => (window.__ganttTest as unknown as { clearPairingItems: () => void }).clearPairingItems())
    const loadedBefore = (await readHook<PairingHookRow[]>(page, 'pairings')).find((p) => String(p.id) === String(probe!.pairingId))
    expect(loadedBefore, 'target pairing is off-screen before locating').toBeUndefined()

    await rightClickPuck(dashboard.rosterCanvas, probe!)
    const locate = page.getByRole('button', { name: 'Locate Pairing' })
    await expect(locate).toBeVisible({ timeout: 5_000 })
    await locate.click()

    // The located pairing is loaded WITH its full composition (not "-").
    await expect.poll(async () => {
      const row = (await readHook<PairingHookRow[]>(page, 'pairings')).find((p) => String(p.id) === String(probe!.pairingId))
      return row?.compLen ?? -1
    }, { message: 'located pairing carries its composition', timeout: 10_000 }).toBe(expectedComp)
  })
})
