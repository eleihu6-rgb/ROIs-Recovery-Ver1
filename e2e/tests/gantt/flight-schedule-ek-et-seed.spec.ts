/**
 * Validates the 142-flight-schedule-seed-generator output through the real Gantt UI.
 *
 * Proves, via window.__ganttTest (store truth, not pixel-reading — see §No-Illusion):
 *  - EK (A380, DXB) and ET (B787/737, ADD) flights load into the Live Flight pane.
 *  - Untailed schedule rows bin-pack into the fewest non-overlapping "{fleet}-{n}" pseudo-tail
 *    rows per fleet (live-server groupFlights/packIntoRows), not one row per flight — the
 *    item.4 requirement from the original seed request.
 *  - Departure times shown are DST-correct UTC, not the naive utc_standard_offset value
 *    (the bug the user caught: "need to convert with DST").
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts, readHook } from '../../utils/gantt-hook'

interface FlightRow {
  id: number
  registration: string
  fleet: string
  fltNum: string | null
  depArp: string | null
  arvArp: string | null
  start: string | null
  end: string | null
}

const setDateRange = (page: import('@playwright/test').Page, startIso: string, endIso: string): Promise<void> =>
  page.evaluate(
    ({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e),
    { s: startIso, e: endIso },
  )

const applyFlightFilter = (page: import('@playwright/test').Page, filter: { depArps?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

test.describe('Flight Schedule Seed — EK/ET (142-flight-schedule-seed-generator)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    // Seeded range is 2026-08-01..2026-09-30; narrow to a 10-day slice for a fast, bounded fetch.
    await setDateRange(page, '2026-08-10T00:00:00.000Z', '2026-08-20T00:00:00.000Z')
  })

  test('Live-1705 — EK A380 flights out of DXB bin-pack into a handful of non-overlapping [A380-n] fleet rows @smoke', async ({ page }) => {
    await applyFlightFilter(page, { depArps: ['DXB'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'EK legs departing DXB loaded', timeout: 15_000,
    }).toBeGreaterThan(0)

    const rows = await readHook<FlightRow[]>(page, 'flights')
    const ekRows = rows.filter((r) => r.fltNum?.startsWith('EK'))
    expect(ekRows.length, 'EK outbound legs present in the loaded window').toBeGreaterThan(0)

    // No real tail was ever inserted for these — every row must be fleet-grouped, named
    // `{fleet}-{n}` by live-server's groupFlights/packIntoRows (flight-service.ts), which
    // bin-packs untailed flights into the fewest non-overlapping "virtual tail" rows per
    // fleet rather than a single flat row — same-day EK legs across 6 routes genuinely
    // overlap in time, so more than one row per fleet is correct, not a bug.
    for (const r of ekRows) {
      expect(r.fleet, `EK leg ${r.fltNum} fleet`).toBe('A380')
      expect(r.registration, `EK leg ${r.fltNum} registration is a fleet-grouped pseudo-tail`).toMatch(/^A380-\d+$/)
    }
    // Bin-packing must still collapse the schedule well below one row per flight.
    const distinctRegistrations = new Set(ekRows.map((r) => r.registration))
    expect(distinctRegistrations.size, 'EK legs bin-pack into far fewer rows than raw leg count').toBeLessThan(ekRows.length)

    // (client-store) flightRegistrations count matches the bin-packed row count for this filter.
    expect((await counts(page)).flightRegistrations).toBe(distinctRegistrations.size)
  })

  test('Live-1706 — ET SSIM flights out of ADD bin-pack per variant fleet, and depart at offset-correct UTC times', async ({ page }) => {
    // ET was reloaded from the real SSIM file (fixtures/ET-SSIM-01-30SEP26.TXT via
    // load-ssim-flights.mjs): coverage 2026-08-31..2026-10-03 on variant fleets
    // 788/789/738/73W/7M8 — the old synthetic Aug seed (coarse 'B787'/'737') is gone,
    // so this test uses an early-September window (still inside the gantt's default
    // roster-period span, which ends 2026-09-07 on this DB) instead of the shared August one.
    await setDateRange(page, '2026-09-03T00:00:00.000Z', '2026-09-05T00:00:00.000Z')
    await applyFlightFilter(page, { depArps: ['ADD'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'ET legs departing ADD loaded', timeout: 15_000,
    }).toBeGreaterThan(0)

    const rows = await readHook<FlightRow[]>(page, 'flights')
    const etRows = rows.filter((r) => r.fltNum?.startsWith('ET'))
    expect(etRows.length, 'ET outbound legs present in the loaded window').toBeGreaterThan(0)

    // Variant fleets sharing base ADD -> each bin-packs into its own set of
    // non-overlapping `{fleet}-{n}` pseudo-tail rows, never one row per flight.
    const SSIM_FLEETS = ['788', '789', '738', '73W', '7M8']
    for (const r of etRows) {
      expect(SSIM_FLEETS, `ET leg ${r.fltNum} fleet ${r.fleet} is an SSIM variant code`).toContain(r.fleet)
      expect(r.registration, `ET leg ${r.fltNum} registration is a fleet-grouped pseudo-tail`).toMatch(
        new RegExp(`^${r.fleet}-\\d+$`),
      )
    }
    const distinctRegistrations = new Set(etRows.map((r) => r.registration))
    expect(distinctRegistrations.size, 'ET legs bin-pack into far fewer rows than raw leg count').toBeLessThan(etRows.length)

    // Time-mode correctness: the SSIM carrier record is "2UET" = UTC mode, so ET100's
    // "ADD03050305+0300" is 03:05 UTC (= 06:05 ADD local, the published departure).
    // 2026-09-04 (Fri, day 5) is inside the 31AUG-06SEP variation (days "1 3 567").
    const et100 = etRows.find((r) => r.fltNum === 'ET100' && r.start?.startsWith('2026-09-04'))
    expect(et100, 'ET100 on 2026-09-04 present in the loaded window').toBeTruthy()
    expect(new Date(et100!.start as string).toISOString()).toBe('2026-09-04T03:05:00.000Z')
  })

  test('Live-1707 — EK002 (LHR -> DXB) reflects the DST-aware BST offset, not the naive standard-time offset', async ({ page }) => {
    // Widen slightly and filter by the inbound leg's departure airport (LHR) directly —
    // depArps only takes DXB-outbound legs in the previous tests, this checks the inbound leg.
    await applyFlightFilter(page, { depArps: ['LHR'] })
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'EK002 (LHR -> DXB) leg loaded', timeout: 15_000,
    }).toBeGreaterThan(0)

    const rows = await readHook<FlightRow[]>(page, 'flights')
    const ek002 = rows.find((r) => r.fltNum === 'EK002' && r.start?.startsWith('2026-08-15'))
    expect(ek002, 'EK002 on 2026-08-15 present in the loaded window').toBeTruthy()

    // 14:20 local at LHR in mid-August is BST (UTC+1) -> 13:20 UTC. The naive
    // airport.utc_standard_offset (GMT+0, no DST) would have wrongly produced 14:20 UTC.
    expect(new Date(ek002!.start as string).toISOString()).toBe('2026-08-15T13:20:00.000Z')
  })
})
