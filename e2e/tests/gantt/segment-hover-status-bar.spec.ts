/**
 * Pairing & Roster segment hover status bar — the flight portion is enhanced with the SAME
 * renderer as the Flight pane (carrier-flightnum, dep/arv M/D + gantt-tz & airport-local times),
 * while each pane keeps its own prefix (Pairing #/Seg #, or crew/label).
 *
 * Per §No-Illusion: the pairing case asserts the full composed line from a real segment, and the
 * roster case proves enhancement against a task whose flight is actually loaded (intersect roster
 * fltIds with the loaded flight set), not just "no error".
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, addFlightPane } from '../../utils/gantt-hook'

type Seg = { segId: number; pairingId: number; segSeq: number; fltId: number | null; fltNum: string; pairingCreditMin: number }
type RosterTask = { id: number; crewId: string; fltId: number | null; label: string | null; pairingId: number | null; segSeq: number | null; dutyActCreditedMinutes: string | null }

const evalHook = <T>(page: Page, fn: string): Promise<T> => page.evaluate(fn) as Promise<T>

/** Minutes → "H:MM" (matches gantt's formatCreditMinutes). */
const hhmm = (min: number): string => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`

const FLIGHT_INFO = String.raw`[A-Z0-9]{0,3}-?\d+ · [A-Z]{3} \d{1,2}\/\d{1,2} \d{2}:\d{2} \/ (?:\d{1,2}\/\d{1,2} )?\d{2}:\d{2}L → [A-Z]{3} `

test.describe('Pairing & Roster segment hover status bar', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    // Flight pane populates the flight store (roster resolution) + triggers tz/composition loads.
    await addFlightPane(page)
  })

  test('Live-1274 — pairing segment hover: keeps "Pairing #/Seg #" prefix and enhances the flight info', async ({ page }) => {
    // Add the pairing pane and wait for its segments to load.
    await page.getByTestId('add-pane-pairing').click()
    await expect.poll(async () =>
      evalHook<Seg[]>(page, 'window.__ganttTest.pairingSegments()').then((s) => s.length),
      { timeout: 30_000, message: 'pairing pane never loaded segments' },
    ).toBeGreaterThan(0)

    const segs = await evalHook<Seg[]>(page, 'window.__ganttTest.pairingSegments()')
    // Prefer a segment whose pairing carries credit so the "Credit H:MM" portion is asserted.
    const seg = segs.find((s) => s.fltNum && s.pairingCreditMin > 0)
      ?? segs.find((s) => s.fltNum) ?? segs[0]

    await page.evaluate((id) => window.__ganttTest.hoverPairingSegment(id), seg.segId)
    const bar = page.getByTestId('status-bar-text')
    const line = (await bar.textContent()) ?? ''

    // Pairing total credit is shown right after the Pairing # (omitted only when the pairing has
    // no credit), then the Seg # prefix and the enhanced flight format.
    const creditPart = seg.pairingCreditMin > 0 ? String.raw` +· +Credit ${hhmm(seg.pairingCreditMin)}` : ''
    expect(line).toMatch(new RegExp(String.raw`^Pairing #${seg.pairingId}${creditPart} +· +Seg #${seg.segSeq} +· +${FLIGHT_INFO}`))
    if (seg.pairingCreditMin > 0) expect(line).toContain(`Credit ${hhmm(seg.pairingCreditMin)}`)
  })

  test('Live-1226 — roster flight-row hover: enhances the flight info parsed from the label', async ({ page }) => {
    const tasks = await evalHook<RosterTask[]>(page, 'window.__ganttTest.roster()')
    expect(tasks.length).toBeGreaterThan(0)

    // Roster rows encode the flight in `label` ("F82820 YVR-MEX"); fltId is null. Pick such a row,
    // preferring one that carries duty credit so the new "Credit H:MM" portion is asserted.
    const flightRe = /^\S+ [A-Z]{3}-[A-Z]{3}$/
    const isFlight = (t: RosterTask): boolean => !!t.label && flightRe.test(t.label)
    const task = tasks.find((t) => isFlight(t) && Number(t.dutyActCreditedMinutes) > 0)
      ?? tasks.find(isFlight)
    expect(task, 'no roster flight-row (label "FLT DEP-ARV") found').toBeTruthy()

    await page.evaluate((id) => window.__ganttTest.hoverRosterTask(id), task!.id)
    const line = (await page.getByTestId('status-bar-text').textContent()) ?? ''

    // "<crew> · [Pairing #/Seg # · Credit H:MM ·] <enhanced flight info>" — crew prefix, then the
    // roster row's pairing/segment + this segment's credit (when present), then the shared flight
    // format (dual-tz times). NO "No crew" (composition can't be resolved without fltId).
    expect(line.startsWith(`${task!.crewId}  ·  `)).toBe(true)
    expect(line).toMatch(new RegExp(FLIGHT_INFO))
    expect(line).not.toContain('No crew')

    // The pairing/segment identity sits BETWEEN the crew id and the flight info.
    if (task!.pairingId != null) {
      const seg = task!.segSeq != null ? `  Seg #${task!.segSeq}` : ''
      expect(line).toContain(`${task!.crewId}  ·  Pairing #${task!.pairingId}${seg}`)
    }
    // This row's duty credit is shown when the joined pairing segment carries it.
    const creditMin = task!.dutyActCreditedMinutes != null ? Math.round(Number(task!.dutyActCreditedMinutes)) : 0
    if (creditMin > 0) expect(line).toContain(`Credit ${hhmm(creditMin)}`)
  })

  test('Live-1275 — roster non-flight row hover: falls back to "crew · label · sch-time"', async ({ page }) => {
    const tasks = await evalHook<RosterTask[]>(page, 'window.__ganttTest.roster()')
    const flightRe = /^\S+ [A-Z]{3}-[A-Z]{3}$/
    // A pairing-route / ground row whose label does NOT parse as a flight.
    const task = tasks.find((t) => !t.label || !flightRe.test(t.label))
    expect(task, 'no non-flight roster row found').toBeTruthy()

    await page.evaluate((id) => window.__ganttTest.hoverRosterTask(id), task!.id)
    const line = (await page.getByTestId('status-bar-text').textContent()) ?? ''
    expect(line.startsWith(`${task!.crewId}  ·  `)).toBe(true)
    // Original three-part form, not the enhanced flight info.
    expect(line).not.toMatch(new RegExp(FLIGHT_INFO))
  })
})
