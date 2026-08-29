/**
 * Full-coverage pairing build: right-click EVERY ET/EK flight on 1 Sep 2026 in the Live Flight
 * pane and build a single-flight pairing for it, until all 219 legs are covered by a pairing.
 *
 * This is the maximally faithful §Simulate-User form of "build pairings to cover all ET/EK flights
 * on 01 Sep": each of the 219 pucks is scrolled into the flight viewport (focusFlight), right-
 * clicked through the REAL context menu, and built via "Create Pairing (1 flight)". Outcomes are
 * proven from store truth via window.__ganttTest (§No-Illusion), not pixel-reading:
 *   - every ET/EK leg ends up covered by exactly one pairing (pairing_segment.flt_id link);
 *   - each built pairing is based at the airline home base (EK→DXB, ET→ADD);
 *   - composition follows the fleet body: wide (A380/788/789) → CA2/FO2, narrow (738/73W/7M8) →
 *     CA1/FO1.
 *
 * Cost: ~219 sequential UI builds — slow (tens of minutes) and inherently heavier than the per-
 * fleet spot-checks in pairing-build.spec.ts. Kept as an explicit, opt-in coverage sweep.
 *
 * Backend: POST /api/pairing/build (live-server/src/services/pairing/pairing-build-service.ts).
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl, counts, readHook } from '../../utils/gantt-hook'

interface FlightRow {
  id: number; airline: string | null; fltDt: string | null; fleet: string; fltNum: string | null
  depArp: string | null; arvArp: string | null; start: string | null
}
interface PairingObj {
  id: number; base: string | null; fleet: string | null
  composition: Array<{ rank: string | null; plan: number; fill: number }>
}
interface SegObj { pairingId: number; fltId: number | null }
interface FocusResult { id: number; x: number; y: number; rowIndex: number; scrollX: number; scrollY: number }

/** Fleets crewed as wide-body (2 CA / 2 FO); everything else is narrow-body (1 CA / 1 FO). */
const WIDE_FLEETS = new Set(['A380', '788', '789'])
const expectedBase = (airline: string | null): string => (airline === 'EK' ? 'DXB' : 'ADD')

const setDateRange = (page: Page, startIso: string, endIso: string): Promise<void> =>
  page.evaluate(
    ({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e),
    { s: startIso, e: endIso },
  )

const applyFlightFilter = (page: Page, filter: Record<string, string[]>): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

const focusFlight = (page: Page, id: number): Promise<FocusResult | null> =>
  page.evaluate((fid) => (window.__ganttTest as unknown as { focusFlight: (n: number) => FocusResult | null }).focusFlight(fid), id)

const selectFlights = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { selectRosterTasks: (x: number[]) => void }).selectRosterTasks(v), ids)

const pairingsNow = (page: Page): Promise<PairingObj[]> => readHook<PairingObj[]>(page, 'pairings')
const segsNow = (page: Page): Promise<SegObj[]> => readHook<SegObj[]>(page, 'pairingSegments')

test.describe('Full ET/EK coverage — build a pairing for every 1 Sep flight', () => {
  let dashboard: GanttDashboardPage
  const createdPairingIds: number[] = []

  test.beforeEach(async ({ page, request }) => {
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
    // Seed mode: KEEP_PAIRINGS=1 leaves the built pairings in the DB (a real user build persists) so
    // they stay visible in the Live pairing pane. Default (unset) cleans up — CI must not leak data.
    if (process.env.KEEP_PAIRINGS === '1') {
      // eslint-disable-next-line no-console
      console.log(`[coverage] KEEP_PAIRINGS=1 — persisting ${createdPairingIds.length} built pairings (no teardown)`)
      return
    }
    if (createdPairingIds.length === 0) return
    const token = await ganttApiLogin(request)
    for (const id of createdPairingIds) {
      await request.post(`${ganttApiUrl}/api/pairing/${id}/delete`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {},
      }).catch(() => {})
    }
  })

  test('Live-1716 — every ET/EK flight on 1 Sep is covered by a correctly-based, correctly-composed pairing', async ({ page }) => {
    // ~219 sequential UI builds; give it a wide ceiling.
    test.setTimeout(45 * 60_000)

    // ADD is UTC+3, so a flt_dt=01 Sep leg can depart 31 Aug in UTC; span the fetch window a little
    // wider than the target day so every 01 Sep flight is loaded, then key targets on flt_dt (the
    // business date) — schDepDtUtc alone would over/under-count across the timezone boundary.
    await setDateRange(page, '2026-08-31T00:00:00.000Z', '2026-09-02T12:00:00.000Z')

    // Sweep fleet by fleet. Two hard constraints force this shape:
    //   1. The flight fetch fleet filter is SINGLE-VALUED — flight-store.fetchFlights sends only
    //      `fleets[0]` as `fleet=…`, so a combined array only ever queries the first fleet.
    //   2. Horizontal zoom (pxPerHour ≈ 26.67 ⇒ pucks wide enough to right-click precisely) is fixed
    //      by the DATE RANGE; a per-fleet filter over this narrow window keeps every puck clickable
    //      while the full-range empty filter zooms out until clicks miss.
    // Each fleet's fetch REPLACES the flight store wholesale, so "every loaded leg is this fleet" is
    // the clean signal that its refetch has landed — applyFlightFilter itself resolves early because
    // apply-filters.ts runs the flight fetch fire-and-forget (`void (async …)()`), off the critical
    // path. 7M8 is shared ET+F8, so targets are still keyed on airline — only the ET 7M8 legs build.
    const FLEETS = ['A380', '738', '73W', '788', '789', '7M8']
    const allTargetIds = new Set<number>()
    let done = 0

    for (const fleet of FLEETS) {
      await applyFlightFilter(page, { fleets: [fleet] })
      // Wait until the single-fleet refetch has fully replaced the store (every loaded leg is this
      // fleet) — a plain `flightLegs > 0` poll can't tell fresh rows from the previous fleet's stale
      // rows and would read the wrong fleet.
      await expect.poll(async () => {
        const rows = await readHook<FlightRow[]>(page, 'flights')
        return rows.length > 0 && rows.every((r) => r.fleet === fleet)
      }, { message: `${fleet} flights loaded (store replaced)`, timeout: 30_000 }).toBe(true)

      const rows = await readHook<FlightRow[]>(page, 'flights')
      const targets = rows.filter((r) => (r.airline === 'ET' || r.airline === 'EK') && r.fltDt === '2026-09-01')
      targets.forEach((t) => allTargetIds.add(t.id))
      // eslint-disable-next-line no-console
      console.log(`[coverage] ${fleet}: ${targets.length} ET/EK legs on 01 Sep (of ${rows.length} ${fleet} legs loaded) — running total ${allTargetIds.size}`)

      const covered = new Set<number>((await segsNow(page)).map((s) => s.fltId).filter((v): v is number => v != null))
      const wide = WIDE_FLEETS.has(fleet)
      for (const flt of targets) {
        // Skip a leg already covered (robust to a rerun after a crashed sweep); still asserted below.
        if (covered.has(flt.id)) { done++; continue }
        const before = new Set((await pairingsNow(page)).map((p) => p.id))

        // Drive the real menu: select exactly this leg (deterministic "1 flight" label), scroll its
        // puck on-screen, right-click it, build. Retry the whole hit-test — a headed/virtualized
        // canvas repaints a frame late, so re-focus + re-right-click until Create appears.
        await selectFlights(page, [flt.id])
        const create = page.getByRole('button', { name: 'Create Pairing (1 flight)', exact: true })
        await expect(async () => {
          const geom = await focusFlight(page, flt.id)
          expect(geom, `flight #${flt.id} (${flt.fltNum}) focusable in the flight pane`).toBeTruthy()
          await dashboard.flightCanvas.click({ position: { x: (geom as FocusResult).x, y: (geom as FocusResult).y }, button: 'right' })
          await expect(create).toBeVisible({ timeout: 1_000 })
        }).toPass({ timeout: 15_000 })
        await create.click()

        // The single-flight pairing lands in the store covering exactly this leg.
        let built: PairingObj | undefined
        await expect.poll(async () => {
          const seg = (await segsNow(page)).find((s) => s.fltId === flt.id && !before.has(s.pairingId))
          if (!seg) return null
          built = (await pairingsNow(page)).find((p) => p.id === seg.pairingId)
          return built?.id ?? null
        }, { message: `pairing for flight #${flt.id} (${flt.fltNum}) appears`, timeout: 20_000 }).not.toBeNull()
        createdPairingIds.push(built!.id)

        // Base + composition are correct for this airline/fleet.
        expect(built!.base, `#${built!.id} (${flt.fltNum}, ${flt.airline}) based at ${expectedBase(flt.airline)}`).toBe(expectedBase(flt.airline))
        const ca = built!.composition.find((c) => c.rank === 'CA')?.plan
        const fo = built!.composition.find((c) => c.rank === 'FO')?.plan
        expect(ca, `#${built!.id} (${fleet}) CA plan`).toBe(wide ? 2 : 1)
        expect(fo, `#${built!.id} (${fleet}) FO plan`).toBe(wide ? 2 : 1)

        done++
        if (done % 20 === 0) {
          // eslint-disable-next-line no-console
          console.log(`[coverage] built ${done}/219`)
        }
      }
    }

    // Ground truth for this data set: 12 EK (A380) + 23+13+47+27+97 ET = 219 passenger legs on 01 Sep.
    expect(allTargetIds.size, 'all 219 ET/EK legs on 01 Sep enumerated across the six fleets').toBe(219)

    // Final proof: every ET/EK leg on 01 Sep is now covered by a pairing.
    const coveredAfter = new Set<number>((await segsNow(page)).map((s) => s.fltId).filter((v): v is number => v != null))
    const missing = [...allTargetIds].filter((id) => !coveredAfter.has(id))
    expect(missing, `these ET/EK legs are still uncovered: ${missing.join(', ')}`).toHaveLength(0)
    // eslint-disable-next-line no-console
    console.log(`[coverage] DONE — ${allTargetIds.size} ET/EK legs on 01 Sep covered by pairings`)
  })
})
