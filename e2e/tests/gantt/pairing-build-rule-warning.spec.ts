/**
 * Build-rule warning surfacing — Option A (Ryan, 2026-08-31): POST /api/pairing/build stays
 * "build as-is" (it never blocks), but when the welded result violates a pairing build rule the
 * response carries `warnings` and the Gantt Create-Pairing flow toasts each one immediately.
 *
 * Rules surfaced: 8h multi-segment block cap (#150717 class), base loop (#150497 class), station
 * continuity, time overlap. Full data-level audit: live-server/scripts/audit-pairing-build-rules.mjs.
 *
 * §Simulate-User: both scenarios drive the REAL Flight-pane right-click → "Create Pairing
 * (2 flights)" menu; the warning is asserted as the user sees it (a [data-sonner-toast] with the
 * rule text), and the no-warning case asserts its absence after the success toast (§No-Illusion).
 *  - Scenario 1: two free long same-day legs (out + straight back, quick turn, block sum > 8h)
 *    → pairing IS created + "Build rule: … exceeds the 480min multi-segment cap" warning toast.
 *  - Scenario 2: the ET100/ET101 ADD→MQX→ADD quick turnaround (~3h block) → created, NO warning.
 * Built pairings are torn down via API in afterEach so no over-cap pairing is left behind
 * (the shared audit would rightly flag it).
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl, readHook, setDateRange, counts } from '../../utils/gantt-hook'

interface FlightRow {
  id: number; fleet: string; fltNum: string | null; depArp: string | null; arvArp: string | null
  start: string | null; end: string | null
}
interface PairingObj { id: number; base: string | null; fleet: string | null }
interface SegObj { pairingId: number; fltId: number | null }
interface FocusResult { x: number; y: number }

const MAX_DUTY_BLOCK_MIN = 480
const REST_FLOOR_MIN = 720
const WIN_START = '2026-08-29T00:00:00.000Z'
const WIN_END = '2026-09-05T00:00:00.000Z'

const isoMs = (iso: string): number =>
  Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)

const applyFlightFilter = (page: Page, filter: { fltNums?: string[]; fleets?: string[] }): Promise<void> =>
  page.evaluate(
    (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
    filter,
  )

const applyPairingBaseFilter = (page: Page, bases: string[]): Promise<void> =>
  page.evaluate(
    (b) => (window.__ganttTest as unknown as { applyPairingFilter: (f: { bases: string[] }) => Promise<void> }).applyPairingFilter({ bases: b }),
    bases,
  )

const selectFlights = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { selectRosterTasks: (x: number[]) => void }).selectRosterTasks(v), ids)

const focusFlight = (page: Page, fltId: number): Promise<FocusResult | null> =>
  page.evaluate((id) => (window.__ganttTest as unknown as { focusFlight: (n: number) => FocusResult | null }).focusFlight(id), fltId)

/** Build a 2-flight pairing through the REAL right-click menu; returns the new pairing id. */
const buildTwoFlightsViaMenu = async (
  page: Page,
  dashboard: GanttDashboardPage,
  outId: number,
  backId: number,
  createdPairingIds: number[],
): Promise<number> => {
  const before = new Set((await readHook<PairingObj[]>(page, 'pairings')).map((p) => p.id))
  const create = page.getByRole('button', { name: 'Create Pairing (2 flights)', exact: true })
  // Retry the whole select → focus → right-click → menu sequence: right after a filter/mutation
  // the pane refetches and repaints, so a single-shot click can land on a stale layout and miss
  // the puck (menu never shows "(2 flights)") — see [[playwright-single-shot-check-after-mutation-races]].
  await expect(async () => {
    await selectFlights(page, [outId, backId])
    const probe = await focusFlight(page, outId)
    expect(probe, `flight #${outId} focusable in Flight pane`).toBeTruthy()
    await dashboard.flightCanvas.click({ position: { x: probe!.x, y: probe!.y }, button: 'right' })
    await expect(create).toBeVisible({ timeout: 1_500 })
  }).toPass({ timeout: 20_000 })
  await create.click()

  let builtId: number | null = null
  await expect.poll(async () => {
    builtId = (await readHook<PairingObj[]>(page, 'pairings')).find((p) => !before.has(p.id))?.id ?? null
    return builtId
  }, { message: 'new pairing appears in the store', timeout: 15_000 }).not.toBeNull()
  createdPairingIds.push(builtId!)
  return builtId!
}

test.describe('Pairing build-rule warning toast (build as-is, surface violations)', () => {
  let dashboard: GanttDashboardPage
  let createdPairingIds: number[] = []

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

  test('Live-1716w — over-cap same-day weld builds successfully AND toasts the block-cap warning', async ({ page }) => {
    test.setTimeout(120_000)
    await setDateRange(page, WIN_START, WIN_END)

    // Load ALL DXB/ADD pairings (Apply-Filters fetches pageSize=0) so the coverage check below
    // sees every welded flight, then pick two FREE legs forming an over-cap same-day out-and-back:
    // dep base → X → straight back, quick turn (< 12h rest), combined block > 8h — the #150717 shape.
    await applyPairingBaseFilter(page, ['DXB', 'ADD'])
    await expect
      .poll(async () => (await readHook<PairingObj[]>(page, 'pairings')).length, { message: 'DXB/ADD pairings loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
    const covered = new Set(
      (await readHook<SegObj[]>(page, 'pairingSegments')).map((s) => s.fltId).filter((x): x is number => x != null),
    )
    const rows = await readHook<FlightRow[]>(page, 'flights')
    let out: FlightRow | undefined
    let back: FlightRow | undefined
    for (const o of rows) {
      if (o.depArp !== 'ADD' && o.depArp !== 'DXB') continue
      if (!o.start || !o.end || covered.has(o.id)) continue
      const b = rows.find((r) =>
        r.id !== o.id && !covered.has(r.id) && r.fleet === o.fleet
        && r.depArp === o.arvArp && r.arvArp === o.depArp
        && r.start != null && r.end != null
        && isoMs(r.start) - isoMs(o.end!) >= 25 * 60_000            // a real turn…
        && isoMs(r.start) - isoMs(o.end!) < REST_FLOOR_MIN * 60_000 // …but NOT a rest → same duty
        && (isoMs(o.end!) - isoMs(o.start!)) + (isoMs(r.end!) - isoMs(r.start!)) > MAX_DUTY_BLOCK_MIN * 60_000,
      )
      if (b) { out = o; back = b; break }
    }
    expect(out, 'a free over-cap same-day out+back candidate pair exists').toBeTruthy()
    expect(back, 'its return leg exists').toBeTruthy()
    // eslint-disable-next-line no-console
    console.log(`[rule-warning] candidate: ${out!.fltNum} ${out!.depArp}-${out!.arvArp} + ${back!.fltNum} ${back!.depArp}-${back!.arvArp}`)

    // Narrow the Flight pane to the two candidate flights so the right-click probe is deterministic.
    await applyFlightFilter(page, { fltNums: [out!.fltNum!, back!.fltNum!].filter((v, i, a) => a.indexOf(v) === i) })
    await expect.poll(async () => (await counts(page)).flightLegs, { message: 'candidate legs loaded', timeout: 20_000 }).toBeGreaterThan(0)

    const builtId = await buildTwoFlightsViaMenu(page, dashboard, out!.id, back!.id, createdPairingIds)

    // The pairing IS created (build as-is)…
    await expect(page.locator('[data-sonner-toast]').getByText(/^Pairing .+ created/).first()).toBeVisible({ timeout: 10_000 })
    // …AND the rule violation is surfaced to the user, naming the actual cap.
    const warningToast = page
      .locator('[data-sonner-toast]')
      .getByText(new RegExp(`Build rule: .*exceeds the ${MAX_DUTY_BLOCK_MIN}min multi-segment cap`))
    await expect(warningToast).toBeVisible({ timeout: 10_000 })

    // Store truth backs the toast: the built pairing really is the over-cap weld it warns about.
    expect(builtId, 'built pairing id captured for cleanup').toBeGreaterThan(0)

    // §PW-Snapshot: the warning toast as the user sees it.
    await page.screenshot({ path: '../docs/assets/screenshots/gantt/pairing-build-rule-warning-Ver1.png' })
  })

  test('Live-1717w — a rule-clean quick turnaround builds with NO warning toast', async ({ page }) => {
    test.setTimeout(120_000)
    await setDateRange(page, WIN_START, WIN_END)

    // Data-driven like Live-1716w (a hardcoded pair rots as soon as some pairing covers it):
    // pick a FREE same-day out-and-back whose combined block stays INSIDE the 8h cap — a clean
    // base turnaround that satisfies every build rule.
    await applyPairingBaseFilter(page, ['DXB', 'ADD'])
    await expect
      .poll(async () => (await readHook<PairingObj[]>(page, 'pairings')).length, { message: 'DXB/ADD pairings loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
    const covered = new Set(
      (await readHook<SegObj[]>(page, 'pairingSegments')).map((s) => s.fltId).filter((x): x is number => x != null),
    )
    const rows = await readHook<FlightRow[]>(page, 'flights')
    let out: FlightRow | undefined
    let back: FlightRow | undefined
    for (const o of rows) {
      if (o.depArp !== 'ADD' && o.depArp !== 'DXB') continue
      if (!o.start || !o.end || covered.has(o.id)) continue
      const b = rows.find((r) =>
        r.id !== o.id && !covered.has(r.id) && r.fleet === o.fleet
        && r.depArp === o.arvArp && r.arvArp === o.depArp
        && r.start != null && r.end != null
        && isoMs(r.start) - isoMs(o.end!) >= 25 * 60_000
        && isoMs(r.start) - isoMs(o.end!) < REST_FLOOR_MIN * 60_000  // same duty (quick turn)
        && (isoMs(o.end!) - isoMs(o.start!)) + (isoMs(r.end!) - isoMs(r.start!)) <= MAX_DUTY_BLOCK_MIN * 60_000,
      )
      if (b) { out = o; back = b; break }
    }
    expect(out, 'a free rule-clean same-day turnaround candidate exists').toBeTruthy()
    expect(back, 'its return leg exists').toBeTruthy()
    // eslint-disable-next-line no-console
    console.log(`[rule-warning] clean candidate: ${out!.fltNum} ${out!.depArp}-${out!.arvArp} + ${back!.fltNum} ${back!.depArp}-${back!.arvArp}`)

    await applyFlightFilter(page, { fltNums: [out!.fltNum!, back!.fltNum!].filter((v, i, a) => a.indexOf(v) === i) })
    await expect.poll(async () => (await counts(page)).flightLegs, { message: 'candidate legs loaded', timeout: 20_000 }).toBeGreaterThan(0)

    await buildTwoFlightsViaMenu(page, dashboard, out!.id, back!.id, createdPairingIds)

    // Success toast, and NO build-rule warning anywhere.
    await expect(page.locator('[data-sonner-toast]').getByText(/^Pairing .+ created/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-sonner-toast]').getByText(/Build rule:/)).toHaveCount(0)
  })
})
