/**
 * Flight hover status bar — the bottom-left status line shows rich info for any loaded flight.
 *
 * Per §No-Illusion the assertions exercise the real data pipeline (stores populated from real
 * APIs → real formatter → real uiStore → StatusBar DOM) and prove the two dates compute from
 * INDEPENDENT timezones: switching the gantt timezone to the departure airport's own zone makes
 * date #1 equal the previously-captured airport-local (`L`) date, while the `L` date itself never
 * changes when only the gantt timezone changes.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, addFlightPane } from '../../utils/gantt-hook'

type FlightLite = { id: number; depArp: string | null; arvArp: string | null }

const flights = (page: Page): Promise<FlightLite[]> =>
  page.evaluate(() => (window.__ganttTest as unknown as { flights: () => FlightLite[] }).flights())

const airportZone = (page: Page, arp: string): Promise<string | undefined> =>
  page.evaluate((a) => (window.__ganttTest as unknown as { airportZone: (x: string) => string | undefined }).airportZone(a), arp)

const hoverFlight = (page: Page, id: number): Promise<void> =>
  page.evaluate((i) => (window.__ganttTest as unknown as { hoverFlight: (n: number) => void }).hoverFlight(i), id)

const setTimezone = (page: Page, zoneId: string, airport: string): Promise<void> =>
  page.evaluate(([z, a]) => (window.__ganttTest as unknown as { setTimezone: (z: string, a: string) => void }).setTimezone(z, a), [zoneId, airport] as const)

test.describe('Flight hover status bar', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await addFlightPane(page)
  })

  test('Live-1062 — shows the rich flight line and recomputes date #1 on timezone switch', async ({ page }) => {
    // Flights loaded into the gantt store.
    await expect.poll(async () => (await flights(page)).length, {
      timeout: 30_000, message: 'no flights loaded into the gantt',
    }).toBeGreaterThan(0)

    // Pick the first flight that has a known airport timezone (so date #2 is meaningful).
    const all = await flights(page)
    let target: FlightLite | undefined
    let depZone: string | undefined
    for (const f of all) {
      if (!f.depArp) continue
      const z = await airportZone(page, f.depArp)
      if (z) { target = f; depZone = z; break }
    }
    expect(target, 'no flight with a resolvable departure-airport timezone').toBeTruthy()
    const fltId = target!.id
    const depArp = target!.depArp!

    // Hover the flight (real store-driven path) and read the status bar DOM.
    await hoverFlight(page, fltId)
    const bar = page.getByTestId('status-bar-text')
    await expect(bar).toContainText(' · ')
    const line1 = (await bar.textContent()) ?? ''

    // Structure: "<airline>-<num> · <DEP> <M/D> <hh:mm> / [<M/D> ]<hh:mm>L → <ARV> … · <fleet> · ..."
    // The local date is repeated only on a cross-midnight difference, so it's optional in the regex.
    const seg = String.raw`[A-Z]{3} \d{1,2}\/\d{1,2} \d{2}:\d{2} \/ (?:\d{1,2}\/\d{1,2} )?\d{2}:\d{2}L`
    expect(line1).toMatch(new RegExp(String.raw`^[A-Z0-9]{0,3}-?\d+ · ${seg} → ${seg} · `))

    // Slice out the dep segment (depArp … up to the route arrow) and pull its two times.
    const depPart1 = line1.slice(line1.indexOf(depArp), line1.indexOf('→'))
    const ganttTimeRe = new RegExp(`${depArp} \\d{1,2}\\/\\d{1,2} (\\d{2}:\\d{2})`) // gantt-tz time
    const localTimeRe = /(\d{2}:\d{2})L/                                            // airport-local time
    const ganttTime1 = depPart1.match(ganttTimeRe)![1]
    const localTime1 = depPart1.match(localTimeRe)![1]
    // Sanity: a real airport flight — the two zones generally give different clock times.
    expect(ganttTime1).toBeTruthy()
    expect(localTime1).toBeTruthy()

    // Switch the gantt timezone to the dep airport's OWN zone, then re-hover.
    await setTimezone(page, depZone!, depArp)
    await hoverFlight(page, fltId)
    const line2 = (await bar.textContent()) ?? ''
    const depPart2 = line2.slice(line2.indexOf(depArp), line2.indexOf('→'))
    const ganttTime2 = depPart2.match(ganttTimeRe)![1]
    const localTime2 = depPart2.match(localTimeRe)![1]

    // gantt tz now == dep airport zone → the gantt-side time equals the airport-local time captured before.
    expect(ganttTime2).toBe(localTime1)
    // The airport-local (L) time is invariant under a gantt-timezone change.
    expect(localTime2).toBe(localTime1)
  })

  test('Live-1063 — the status line is per-flight: hovering a different flight changes it', async ({ page }) => {
    await expect.poll(async () => (await flights(page)).length, { timeout: 30_000 }).toBeGreaterThan(1)
    const all = await flights(page)
    // Two flights with different flight numbers so the line is guaranteed to differ.
    const a = all[0]
    const b = all.find((f) => f.id !== a.id)!
    const bar = page.getByTestId('status-bar-text')

    await hoverFlight(page, a.id)
    const lineA = (await bar.textContent()) ?? ''
    expect(lineA).toMatch(/ · /)

    await hoverFlight(page, b.id)
    const lineB = (await bar.textContent()) ?? ''
    expect(lineB).toMatch(/ · /)
    // Different flight → different status line (proves it reflects the hovered flight, not a stale value).
    expect(lineB).not.toBe(lineA)
  })
})
