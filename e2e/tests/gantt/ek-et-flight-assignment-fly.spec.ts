/**
 * EK/ET legs carry `flight_assignment = 'FLY'`, exactly like F8 — proven through the real UI.
 *
 * Background (2026-09-13): EK was seeded from the synthetic fixture with
 * `flightAssignment: "PAX"` and the ET SSIM load never wrote the column (NULL). In this column
 * PAX is not "passenger service" (`flt_type` is) — it is **Positioning** (group DHD) per
 * `sql/seed/03-assignment.sql`. `pairing-build-service.ts` copies `flight.flight_assignment`
 * into `pairing_segment.seg_assignment` (`?? 'FLY'`) when a planner builds a pairing from
 * flights, so every pairing built from an EK/ET leg came out as a positioning duty, and
 * `live-legality.mjs` fed the same code into the rule `Attributes` value.
 * Fixed by `sql/migration/2026-09-13-ek-et-flight-assignment-to-fly.sql` plus the seed fixture
 * (`fixtures/ek-dxb-a380.json`) and the SSIM loader (`scripts/load-ssim-flights.mjs`).
 *
 * This spec is the regression guard at the user-visible surface (§Simulate-User, §No-Illusion):
 * a planner right-clicks EK/ET legs in the Live Flight pane (real context menu), builds a real
 * base→base round-trip pairing ("Create Pairing (2 flights)"), and opens the **Pairing Info**
 * dialog — the segment table's assignment column must read `FLY`. Before the fix this failed:
 * EK segments rendered `PAX`, ET segments rendered blank.
 *
 * Fixture choices (§Real-Business-Case-Test): real home-base round trips — EK001 (DXB→LHR) +
 * EK002 (LHR→DXB) on 2026-08-10, and ET514 (ADD→LFW) + ET515 (LFW→ADD) on 2026-09-04. Both
 * pairs are deliberately chosen on dates where the legs are NOT already covered by an existing
 * pairing (a covered flight is rejected by the build guard).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl, counts, readHook } from '../../utils/gantt-hook'
import { readSegmentCells, SEG } from '../../utils/pairing-info'
import {
  applyFlightFilter, focusFlight, isoMs, openPairingInfoViaMenu, pairingsNow,
  segsNow, selectFlights, setDateRange,
  type FlightRow, type FocusResult, type PairingObj,
} from '../../utils/pairing-build'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')
const SCREENSHOT_DIR = path.join(ROOT, 'docs/assets/screenshots/gantt')

/** §PW-Snapshot — capture the dialog from this same run; never overwrite an earlier round. */
const capture = async (dialog: Locator, feature: string): Promise<string> => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let version = 1
  let target: string
  do { target = path.join(SCREENSHOT_DIR, `${feature}-Ver${version++}.png`) } while (fs.existsSync(target))
  await dialog.screenshot({ path: target })
  return path.relative(ROOT, target)
}

/** Assignment (QUAL) cell of every segment row, in row order. */
const assignmentCells = async (dialog: Locator): Promise<string[]> =>
  (await readSegmentCells(dialog)).map((row) => row[SEG.QUAL] ?? '')

/** Flight numbers of every segment row, in row order — proves we opened the pairing we built. */
const flightCells = async (dialog: Locator): Promise<string[]> =>
  (await readSegmentCells(dialog)).map((row) => row[SEG.FLIGHT] ?? '')

test.describe('EK/ET flight_assignment = FLY (positioning PAX/NULL regression guard)', () => {
  // Serial: both cases build real pairings against the same live DB / pairing pane, so running
  // them in parallel would race on shared pane + selection state (fullyParallel is on globally).
  test.describe.configure({ mode: 'serial' })

  let dashboard: GanttDashboardPage
  let createdPairingIds: number[] = []

  /**
   * Right-click one of the selected flights' pucks until the real context menu opens with the
   * expected selection size. `applyFlightFilter` resolves before its (fire-and-forget) flight
   * fetch lands, and a virtualized canvas repaints a frame late, so re-focus + re-right-click
   * until the menu actually appears — the pattern Live-1716 uses.
   *
   * `focusFlight` scrolls the puck on-screen but also collapses the selection to that one
   * flight, so the multi-selection is (re)applied AFTER focusing and the right-click is aimed
   * at the geometry it returned.
   */
  const openCreateMenu = async (page: import('@playwright/test').Page, fltIds: readonly number[]): Promise<import('@playwright/test').Locator> => {
    const flights = fltIds.length
    const create = page.getByRole('button', { name: `Create Pairing (${flights} flight${flights === 1 ? '' : 's'})`, exact: true })
    await expect(async () => {
      await page.keyboard.press('Escape')
      const geom = await focusFlight(page, fltIds[0])
      expect(geom, `flight #${fltIds[0]} focusable in the flight pane`).toBeTruthy()
      await selectFlights(page, [...fltIds])
      await dashboard.flightCanvas.click({
        position: { x: (geom as FocusResult).x, y: (geom as FocusResult).y }, button: 'right',
      })
      await expect(create).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    return create
  }

  /** Wait until the flight store holds ONLY the filtered fleet (fresh fetch landed, not stale rows). */
  const waitForFleetLoaded = async (page: import('@playwright/test').Page, fleet: string): Promise<FlightRow[]> => {
    await expect.poll(async () => {
      const rows = await readHook<FlightRow[]>(page, 'flights')
      return rows.length > 0 && rows.every((r) => r.fleet === fleet)
    }, { message: `${fleet} flights loaded (store replaced)`, timeout: 30_000 }).toBe(true)
    return readHook<FlightRow[]>(page, 'flights')
  }

  test.beforeEach(async ({ page, request }) => {
    createdPairingIds = []
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    await expect
      .poll(async () => (await counts(page)).pairing, { message: 'pairing pane loaded', timeout: 30_000 })
      .toBeGreaterThanOrEqual(0)
  })

  test.afterEach(async ({ request }) => {
    if (createdPairingIds.length === 0) return
    const token = await ganttApiLogin(request)
    for (const id of createdPairingIds) {
      await request.post(`${ganttApiUrl}/api/pairing/${id}/delete`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {},
      }).catch(() => {})
    }
  })

  test('Live-1720 — EK DXB→LHR→DXB pairing segments record FLY, not the seeded PAX positioning', async ({ page }) => {
    test.setTimeout(120_000)
    await setDateRange(page, '2026-08-10T00:00:00.000Z', '2026-08-12T00:00:00.000Z')
    await applyFlightFilter(page, { fleets: ['A380'] })

    const rows = await waitForFleetLoaded(page, 'A380')
    const out = rows.find((r) => r.fltNum === 'EK001' && r.depArp === 'DXB')
    const back = rows.find((r) => r.fltNum === 'EK002' && r.arvArp === 'DXB'
      && r.start != null && out?.start != null && isoMs(r.start) > isoMs(out.start))
    expect(out, 'EK001 DXB→LHR outbound present on 2026-08-10').toBeTruthy()
    expect(back, 'EK002 LHR→DXB return present after the outbound').toBeTruthy()

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await selectFlights(page, [out!.id, back!.id])

    // Real right-click → real context-menu action (the operation under test).
    const create = await openCreateMenu(page, [out!.id, back!.id])
    await create.click()

    let built: PairingObj | undefined
    await expect.poll(async () => {
    built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === 'A380')
      return built?.id ?? null
    }, { message: 'the built EK A380 pairing appears in the store', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)
    expect((await segsNow(page)).filter((s) => s.pairingId === built!.id).length, 'both legs in the pairing').toBe(2)

    const dialog = await openPairingInfoViaMenu(page, dashboard, built!.id, out!.id)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })
    await expect(dialog.getByTestId('pairing-info-segments').locator('tbody tr')).toHaveCount(2)

    expect(await flightCells(dialog), 'dialog shows the EK001/EK002 legs we built').toEqual(['EK001', 'EK002'])
    expect(await assignmentCells(dialog), 'EK segments are FLY (not the seeded PAX/positioning)')
      .toEqual(['FLY', 'FLY'])

    const shot = await capture(dialog, 'ek-et-flight-assignment-fly-ek')
    // eslint-disable-next-line no-console
    console.log(`[screenshot] ${shot}`)
  })

  test('Live-1721 — ET ADD→LFW→ADD pairing segments record FLY, not the SSIM NULL', async ({ page }) => {
    test.setTimeout(120_000)
    await setDateRange(page, '2026-09-04T00:00:00.000Z', '2026-09-06T00:00:00.000Z')
    await applyFlightFilter(page, { fleets: ['788'] })

    const rows = await waitForFleetLoaded(page, '788')
    const out = rows.find((r) => r.fltNum === 'ET514' && r.depArp === 'ADD')
    const back = rows.find((r) => r.fltNum === 'ET515' && r.arvArp === 'ADD'
      && r.start != null && out?.start != null && isoMs(r.start) > isoMs(out.start))
    expect(out, 'ET514 ADD→LFW outbound present on 2026-09-04').toBeTruthy()
    expect(back, 'ET515 LFW→ADD return present after the outbound').toBeTruthy()

    const before = new Set((await pairingsNow(page)).map((p) => p.id))
    await selectFlights(page, [out!.id, back!.id])

    const create = await openCreateMenu(page, [out!.id, back!.id])
    await create.click()

    let built: PairingObj | undefined
    await expect.poll(async () => {
      built = (await pairingsNow(page)).find((p) => !before.has(p.id) && p.fleet === '788')
      return built?.id ?? null
    }, { message: 'the built ET 788 pairing appears in the store', timeout: 15_000 }).not.toBeNull()
    createdPairingIds.push(built!.id)
    expect((await segsNow(page)).filter((s) => s.pairingId === built!.id).length, 'both legs in the pairing').toBe(2)

    const dialog = await openPairingInfoViaMenu(page, dashboard, built!.id, out!.id)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })
    await expect(dialog.getByTestId('pairing-info-segments').locator('tbody tr')).toHaveCount(2)

    expect(await flightCells(dialog), 'dialog shows the ET514/ET515 legs we built').toEqual(['ET514', 'ET515'])
    expect(await assignmentCells(dialog), 'ET segments are FLY (not NULL/blank)').toEqual(['FLY', 'FLY'])

    const shot = await capture(dialog, 'ek-et-flight-assignment-fly-et')
    // eslint-disable-next-line no-console
    console.log(`[screenshot] ${shot}`)
  })
})
