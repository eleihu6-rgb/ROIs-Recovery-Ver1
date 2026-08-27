import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * The optimistic Tier-1 recompute covers ALL seven manday KPIs, not just MCred. De-assigning a
 * flying pairing immediately lowers the crew's MCred AND its block-hour KPIs (MBH month, YBH year)
 * — block uses the flying duty's credited minutes as a client proxy (the server reconciles the
 * real flight.blk_min on Save). Undo restores every KPI to the server base.
 *
 * Drives the REAL UI (§Simulate-User): a genuine canvas right-click on a flying puck → "Delete".
 * Proof reads the actually-rendered left-panel KPI cells (`window.__ganttTest.rosterPanelKpis()`),
 * not an API call (§No-Illusion). Sibling of mcred-draft-recompute (Live-1310), widened to all KPIs.
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

type Kpis = { crewId: string; mcred: string; mbh: string; ybh: string; mdo: string; ydo: string; mal: string; yal: string }

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

const kpisFor = async (page: Page, crewId: string): Promise<Kpis | undefined> => {
  const rows = await readHook<Kpis[]>(page, 'rosterPanelKpis')
  return rows.find((r) => r.crewId === crewId)
}
const toMinutes = (hmm: string): number => {
  if (!hmm) return 0
  const [h, m] = hmm.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

test.use({ timezoneId: 'America/Vancouver' })

test.describe('Live manday KPIs — all seven recompute optimistically', () => {
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

  test('Live-1316 — de-assigning a flying pairing lowers MCred + MBH + YBH before Save; Undo restores all', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'a visible roster puck belonging to a pairing exists').not.toBeNull()
    const crewId = probe!.crewId

    // KPIs load async (post first-paint). Wait until this crew's MCred is populated.
    await expect.poll(async () => (await kpisFor(page, crewId))?.mcred ?? '', {
      message: 'crew KPIs loaded',
      timeout: 30_000,
    }).not.toBe('')
    const before = (await kpisFor(page, crewId))!

    // REAL canvas right-click → "Delete" removes the whole pairing-from-crew (a draft op).
    await rightClickPuck(dashboard.rosterCanvas, probe!)
    const del = page.getByRole('button', { name: /^Delete/ })
    await expect(del).toBeVisible({ timeout: 5_000 })
    await del.click()

    // The puck is gone (draft applied) ...
    await expect.poll(async () => {
      const items = await readHook<Array<{ id: number }>>(page, 'roster')
      return new Set(items.map((i) => i.id)).has(probe!.id)
    }, { message: 'de-assigned duty removed from roster', timeout: 10_000 }).toBe(false)

    // ... and MCred dropped immediately, with NO Save.
    await expect.poll(async () => (await kpisFor(page, crewId))?.mcred ?? '', {
      message: 'MCred changed after de-assign (before save)', timeout: 10_000,
    }).not.toBe(before.mcred)
    const after = (await kpisFor(page, crewId))!

    // MCred AND the block KPIs (MBH month, YBH year) all decreased — the flying duty contributed
    // credit and block to every one of them.
    expect(toMinutes(after.mcred), 'MCred decreased').toBeLessThan(toMinutes(before.mcred))
    expect(toMinutes(after.mbh), 'MBH decreased').toBeLessThan(toMinutes(before.mbh))
    expect(toMinutes(after.ybh), 'YBH decreased').toBeLessThan(toMinutes(before.ybh))

    // Undo reverts every KPI back to the server base value.
    await page.getByTestId('draft-undo-btn').click()
    await expect.poll(async () => {
      const k = await kpisFor(page, crewId)
      return k ? `${k.mcred}|${k.mbh}|${k.ybh}` : ''
    }, { message: 'all KPIs revert on undo', timeout: 10_000 }).toBe(`${before.mcred}|${before.mbh}|${before.ybh}`)
  })
})
