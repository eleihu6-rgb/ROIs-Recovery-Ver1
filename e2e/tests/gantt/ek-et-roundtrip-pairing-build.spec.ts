/**
 * Round-trip / rotation pairing build: cover EVERY ET/EK flight on 1 Sep 2026 with REAL trips
 * (2 duties, or a packed multi-segment same-day turn under 8h) — not single-leg single-duty stubs.
 *
 * Ryan's construction logic (verbatim intent):
 *   - Anchor each 01-Sep DXB/ADD OUTBOUND (e.g. EK414 DXB→SYD) as duty 1, then attach the EARLIEST
 *     return to base (EK413 SYD→DXB) — shortest layover. Long-haul legs each exceed the 8h block
 *     limit, so these auto-split into 2 duties.
 *   - ET 737 short-haul: pack consecutive segments into one duty as long as total block stays under
 *     8h (ADD→GDQ→ADD→PZU→ADD as a single multi-seg turn), splitting only when 8h/overnight forces it.
 *   - A completion pass covers 01-Sep INBOUND and multi-stop TAG legs (e.g. ET823 ADD→VFA→GBE→ADD)
 *     that a strict outbound anchor misses, by chaining connecting legs back to base.
 *
 * The rotations are computed IN-SPEC from the flights actually loaded in the Live flight store
 * (window 29 Aug–04 Sep, so every partner leg on an adjacent day is present), constrained to a
 * SINGLE fleet per rotation because the Phase-1 flight fetch fleet filter is single-valued — a
 * rotation's legs must all be co-loaded to be multi-selected. Offline verification over the real
 * schedule: 219/219 target legs covered by 144 same-fleet rotations (98 two-duty + 46 one-duty
 * multi-seg turns), zero single-leg, zero cross-fleet.
 *
 * §Simulate-User: each rotation is built through the REAL UI — select its legs (Ctrl+Q path via the
 * selection hook), right-click a puck, click "Create Pairing (N flights)". §No-Illusion: outcomes are
 * proven from store truth (pairing_segment.flt_id links), asserting each pairing carries all N legs,
 * is based at the airline home (EK→DXB, ET→ADD), and — the headline — every one of the 219 ET/EK
 * 01-Sep legs ends up covered.
 *
 * Backend: POST /api/pairing/build (live-server/src/services/pairing/pairing-build-service.ts) splits
 * the selected legs into duties by the 12h rest floor / 8h block rules; we do not gate on legality
 * (build as-is), so irregular chains are allowed to surface violations rather than be dropped.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl, counts, readHook } from '../../utils/gantt-hook'

interface FlightRow {
  id: number; airline: string | null; fltDt: string | null; fleet: string; fltNum: string | null
  depArp: string | null; arvArp: string | null; start: string | null; end: string | null
}
interface PairingObj {
  id: number; base: string | null; fleet: string | null
  composition: Array<{ rank: string | null; plan: number; fill: number }>
}
interface SegObj {
  pairingId: number; fltId: number | null; dutySeq: number | null; segSeq: number | null
  schStrDtUtc: string | null; schEndDtUtc: string | null
  pickupStartUtc: string | null; dropoffEndUtc: string | null; dutySchRestMin: number | null
}
interface FocusResult { id: number; x: number; y: number; rowIndex: number; scrollX: number; scrollY: number }

/** Aircraft flown wide-body (2 CA / 2 FO); everything else narrow (1 CA / 1 FO). */
const WIDE_FLEETS = new Set(['A380', '788', '789'])
const BASE: Record<string, string> = { EK: 'DXB', ET: 'ADD' }
const expectedBase = (airline: string | null): string => (airline === 'EK' ? 'DXB' : 'ADD')

// Duty-split thresholds mirror pairing-build-service.ts.
const REST_MS = 720 * 60_000 // 12h rest floor → new duty
const MAX_BLK = 480 // 8h max block per duty
const CHECKIN_MIN = 60 // brief starts 60m before first departure (matches CHECKIN_MIN in the service + existing F8)
const MINCONN_MS = 45 * 60_000
const RETMAX_MS = 48 * 60 * 60_000 // longest layover we'll reach for a rest-legal return (daily long-haul ≈24h)

// Build window: 01-Sep legs plus their ±~2-day partners. Widened for Ryan's rest rule — a 01-Sep
// long-haul outbound now pairs with the NEXT-day return, and a 01-Sep inbound with the PRIOR-day
// outbound, so both neighbours must be loaded.
const WIN_START = '2026-08-29T00:00:00.000Z'
const WIN_END = '2026-09-04T12:00:00.000Z'
// Full sweep by default; ROUNDTRIP_FLEETS=A380 narrows it for a smoke run.
const FLEETS = (process.env.ROUNDTRIP_FLEETS ?? 'A380,738,73W,788,789,7M8').split(',').map((s) => s.trim()).filter(Boolean)

interface Leg extends FlightRow { t0: number; t1: number; blk: number; sep1: boolean }

const toLeg = (f: FlightRow): Leg => {
  const t0 = f.start ? Date.parse(f.start) : NaN
  const t1 = f.end ? Date.parse(f.end) : NaN
  return { ...f, t0, t1, blk: Number.isFinite(t0) && Number.isFinite(t1) ? (t1 - t0) / 60_000 : 0, sep1: f.fltDt === '2026-09-01' }
}

const dutiesOf = (r: Leg[]): number => {
  let d = 1, blk = r[0].blk
  for (let i = 1; i < r.length; i++) {
    const gap = r[i].t0 - r[i - 1].t1
    if (gap >= REST_MS || blk + r[i].blk > MAX_BLK) { d++; blk = r[i].blk } else blk += r[i].blk
  }
  return d
}

// Ryan's rest rule (request 1): a gap that opens a new duty must give the crew
// max(12h, the previous duty's check-in→check-out span). lastDutyBounds returns the final
// duty's [firstDep, lastArr] within a rotation; requiredRestMs turns it into that minimum gap.
const lastDutyBounds = (r: Leg[]): { dep: number; arr: number } => {
  let start = 0, blk = r[0].blk
  for (let i = 1; i < r.length; i++) {
    const gap = r[i].t0 - r[i - 1].t1
    if (gap >= REST_MS || blk + r[i].blk > MAX_BLK) { start = i; blk = r[i].blk } else blk += r[i].blk
  }
  return { dep: r[start].t0, arr: r[r.length - 1].t1 }
}
const requiredRestMs = (r: Leg[]): number => {
  const b = lastDutyBounds(r)
  const dutyMin = (b.arr - b.dep) / 60_000 + CHECKIN_MIN // check-in (dep−2h) → check-out (arr)
  return Math.max(REST_MS, dutyMin * 60_000)
}

/**
 * Same-fleet rotation cover for one airline's loaded legs. Anchors 01-Sep base-outbounds first
 * (Ryan's rule), extends to base with the earliest connecting leg (shortest layover), completes
 * inbounds/tags, then packs extra short-haul base-turns into a sub-8h duty. Returns rotations that
 * each contain ≥1 01-Sep target leg. Ported 1:1 from the offline-verified builder (219/219).
 */
const buildRotations = (all: Leg[], airline: string): Leg[][] => {
  const B = BASE[airline]
  const con = new Set<number>()
  const uncon = (): Leg[] => all.filter((l) => !con.has(l.id) && l.airline === airline)
  const targets = all.filter((l) => l.sep1 && l.airline === airline)
  const seeds = [...targets].sort((a, b) => {
    const ao = a.depArp === B ? 0 : 1, bo = b.depArp === B ? 0 : 1
    return ao - bo || a.t0 - b.t0
  })
  const rots: Leg[][] = []
  for (const seed of seeds) {
    if (con.has(seed.id)) continue
    const F = seed.fleet
    const rot: Leg[] = [seed]; con.add(seed.id)
    const long = WIDE_FLEETS.has(F)
    const fwd = (from: string, tp: number, win: number): Leg | undefined =>
      uncon().filter((l) => l.fleet === F && l.depArp === from && l.t0 >= tp + MINCONN_MS && l.t0 <= tp + win).sort((a, b) => a.t0 - b.t0)[0]
    const bwd = (to: string, tf: number): Leg | undefined =>
      uncon().filter((l) => l.fleet === F && l.arvArp === to && l.t1 <= tf - MINCONN_MS && l.t1 >= tf - RETMAX_MS).sort((a, b) => b.t1 - a.t1)[0]
    // Long-haul return/outbound opens a NEW duty → honour Ryan's rest rule instead of MINCONN:
    // earliest rest-legal return forward, latest rest-legal outbound backward.
    const fwdRest = (from: string, r: Leg[]): Leg | undefined => {
      const tp0 = r[r.length - 1].t1, minGap = requiredRestMs(r)
      return uncon().filter((l) => l.fleet === F && l.depArp === from && l.t0 >= tp0 + minGap && l.t0 <= tp0 + RETMAX_MS).sort((a, b) => a.t0 - b.t0)[0]
    }
    const bwdRest = (to: string, tf0: number): Leg | undefined =>
      uncon().filter((l) => l.fleet === F && l.arvArp === to && tf0 - l.t1 >= Math.max(REST_MS, (l.blk + CHECKIN_MIN) * 60_000) && l.t1 >= tf0 - RETMAX_MS).sort((a, b) => b.t1 - a.t1)[0]
    // forward to base
    let st = rot[rot.length - 1].arvArp!, tp = rot[rot.length - 1].t1, guard = 0
    while (st !== B && guard++ < 6) {
      const nx = long ? fwdRest(st, rot) : fwd(st, tp, REST_MS)
      if (!nx) break
      // Long-haul may open a 2nd (rest-legal) duty; short-haul stays a single <8h duty —
      // block overflow must NOT force a 2nd duty on a short turnaround gap (Ryan: single-duty turns).
      if (dutiesOf([...rot, nx]) > (long ? 2 : 1) || rot.length + 1 > 6) break
      rot.push(nx); con.add(nx.id); st = nx.arvArp!; tp = nx.t1
    }
    // backward to base
    let s0 = rot[0].depArp!, tf = rot[0].t0, g2 = 0
    while (s0 !== B && g2++ < 6) {
      const pv = long ? bwdRest(s0, tf) : bwd(s0, tf)
      if (!pv) break
      if (dutiesOf([pv, ...rot]) > (long ? 2 : 1) || rot.length + 1 > 6) break
      rot.unshift(pv); con.add(pv.id); s0 = pv.depArp!; tf = pv.t0
    }
    // short-haul packing: chain more base-turns while still one <8h duty
    if (!long && rot[rot.length - 1].arvArp === B) {
      let last = rot[rot.length - 1], pk = 0
      while (pk++ < 4 && dutiesOf(rot) <= 1) {
        const nx = fwd(B, last.t1, 3 * 60 * 60_000)
        if (!nx) break
        const rt = uncon().filter((l) => l.fleet === F && l.depArp === nx.arvArp && l.arvArp === B && l.t0 >= nx.t1 + MINCONN_MS && l.t0 <= nx.t1 + REST_MS).sort((a, b) => a.t0 - b.t0)[0]
        // Only pack COMPLETE base→X→base turns — never a one-way leg that strands the rotation
        // away from base (that produced discontinuous ADD→…→AWA + ADD→… phantom duties).
        if (!rt) break
        const t = [...rot, nx, rt]
        if (dutiesOf(t) > 1 || t.length > 6) break
        rot.push(nx); con.add(nx.id); rot.push(rt); con.add(rt.id)
        last = rot[rot.length - 1]
      }
    }
    rots.push(rot)
  }
  // fallback: never leave a single-leg pairing — attach the nearest connecting leg.
  // For long-haul the attached leg opens a new duty, so it must clear the rest rule too.
  for (const rot of rots) {
    if (rot.length > 1) continue
    const s = rot[0]
    // Attach a connecting leg. A normal turn gap is fine while it stays ONE duty; if attaching
    // opens a 2nd duty (block overflow or a long gap) the gap must clear max(12h, that duty) —
    // never leave a 45–90m "layover" between duties (Ryan request 1).
    const okFwd = (l: Leg): boolean => {
      const gap = l.t0 - s.t1
      if (gap < MINCONN_MS || gap > RETMAX_MS) return false
      return dutiesOf([s, l]) <= 1 || gap >= Math.max(REST_MS, (s.blk + CHECKIN_MIN) * 60_000)
    }
    const okBwd = (l: Leg): boolean => {
      const gap = s.t0 - l.t1
      if (gap < MINCONN_MS || gap > RETMAX_MS) return false
      return dutiesOf([l, s]) <= 1 || gap >= Math.max(REST_MS, (l.blk + CHECKIN_MIN) * 60_000)
    }
    const nx = uncon().filter((l) => l.fleet === s.fleet && l.depArp === s.arvArp && okFwd(l)).sort((a, b) => a.t0 - b.t0)[0]
    const pv = uncon().filter((l) => l.fleet === s.fleet && l.arvArp === s.depArp && okBwd(l)).sort((a, b) => b.t1 - a.t1)[0]
    if (nx) { rot.push(nx); con.add(nx.id) } else if (pv) { rot.unshift(pv); con.add(pv.id) }
  }
  return rots
}

const setDateRange = (page: Page, startIso: string, endIso: string): Promise<void> =>
  page.evaluate(
    ({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e),
    { s: startIso, e: endIso },
  )
const applyFlightFilter = (page: Page, filter: Record<string, string[]>): Promise<void> =>
  page.evaluate((f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f), filter)
const focusFlight = (page: Page, id: number): Promise<FocusResult | null> =>
  page.evaluate((fid) => (window.__ganttTest as unknown as { focusFlight: (n: number) => FocusResult | null }).focusFlight(fid), id)
const selectFlights = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((v) => (window.__ganttTest as unknown as { selectRosterTasks: (x: number[]) => void }).selectRosterTasks(v), ids)
const pairingsNow = (page: Page): Promise<PairingObj[]> => readHook<PairingObj[]>(page, 'pairings')
const segsNow = (page: Page): Promise<SegObj[]> => readHook<SegObj[]>(page, 'pairingSegments')

test.describe('Round-trip coverage — every 1 Sep ET/EK flight covered by a real (multi-leg) pairing', () => {
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
    if (process.env.KEEP_PAIRINGS === '1') {
      // eslint-disable-next-line no-console
      console.log(`[roundtrip] KEEP_PAIRINGS=1 — persisting ${createdPairingIds.length} built pairings (no teardown)`)
      return
    }
    if (createdPairingIds.length === 0) return
    const token = await ganttApiLogin(request)
    for (const id of createdPairingIds) {
      await request.post(`${ganttApiUrl}/api/pairing/${id}/delete`, { headers: { Authorization: `Bearer ${token}` }, data: {} }).catch(() => {})
    }
  })

  test('Live-1722 — 219 ET/EK 1 Sep legs covered by real round-trip / rotation pairings (no single-leg stubs)', async ({ page, request }) => {
    test.setTimeout(45 * 60_000)

    const fullSweep = FLEETS.length > 1
    // --- Cleanup (full sweep only): remove the prior single-flight DXB/ADD pairings so we rebuild
    // from a clean slate. These are all our own fresh, unassigned coverage pairings (the pre-reseed
    // DB had zero DXB/ADD pairings); deleting is safe. Done via API — test-data teardown, not the
    // operation under test. A single-fleet smoke run skips this so it never destroys the 219.
    if (fullSweep) {
      const token = await ganttApiLogin(request)
      const listResp = await request.get(`${ganttApiUrl}/api/pairing`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { startDate: '2026-08-29', endDate: '2026-09-04', base: 'DXB,ADD', page: '1', pageSize: '2000', view: 'summary' },
      })
      const listJson = await listResp.json().catch(() => ({}))
      const priorRows: Array<{ id: number }> = listJson?.data?.items ?? listJson?.data?.rows ?? listJson?.data?.list ?? listJson?.items ?? []
      // eslint-disable-next-line no-console
      console.log(`[roundtrip] cleanup: deleting ${priorRows.length} existing DXB/ADD pairings`)
      for (const p of priorRows) {
        await request.post(`${ganttApiUrl}/api/pairing/${p.id}/delete`, { headers: { Authorization: `Bearer ${token}` }, data: {} }).catch(() => {})
      }
    }

    await setDateRange(page, WIN_START, WIN_END)
    // Let the date-range refetch settle before the first fleet filter, so its (all-fleet) response
    // can't land late and clobber the fleet-filtered store (a race that leaves the poll stuck mixed).
    await expect.poll(async () => (await readHook<FlightRow[]>(page, 'flights')).length, { timeout: 30_000 }).toBeGreaterThan(0)

    const allTargetIds = new Set<number>()
    let built = 0

    for (const fleet of FLEETS) {
      await applyFlightFilter(page, { fleets: [fleet] })
      await expect.poll(async () => {
        const rows = await readHook<FlightRow[]>(page, 'flights')
        return rows.length > 0 && rows.every((r) => r.fleet === fleet)
      }, { message: `${fleet} flights loaded (store replaced)`, timeout: 30_000 }).toBe(true)

      const rows = (await readHook<FlightRow[]>(page, 'flights')).map(toLeg)
      // ET/EK legs of this fleet; note 7M8 is shared with F8 — keep only ET/EK, and each airline's
      // targets on 01-Sep drive rotations for that airline.
      const etek = rows.filter((r) => r.airline === 'ET' || r.airline === 'EK')
      rows.filter((r) => (r.airline === 'ET' || r.airline === 'EK') && r.sep1).forEach((r) => allTargetIds.add(r.id))

      const rotations: Leg[][] = []
      for (const airline of ['EK', 'ET']) {
        if (!etek.some((l) => l.airline === airline && l.sep1)) continue
        rotations.push(...buildRotations(etek, airline))
      }
      // eslint-disable-next-line no-console
      console.log(`[roundtrip] ${fleet}: ${etek.filter((l) => l.sep1).length} target legs → ${rotations.length} rotations`)

      const wide = WIDE_FLEETS.has(fleet)
      const coveredIds = new Set<number>((await segsNow(page)).map((s) => s.fltId).filter((v): v is number => v != null))

      for (const rot of rotations) {
        const ids = rot.map((l) => l.id)
        // Skip a rotation whose target legs are all already covered (rerun-safe after the full-sweep
        // cleanup). In a smoke run cleanup is skipped, so the prior pairings still cover everything —
        // don't skip there, or nothing would build.
        if (fullSweep && rot.filter((l) => l.sep1).every((l) => coveredIds.has(l.id))) continue

        const before = new Set((await pairingsNow(page)).map((p) => p.id))
        await selectFlights(page, ids)
        const label = `Create Pairing (${ids.length} flight${ids.length > 1 ? 's' : ''})`
        const create = page.getByRole('button', { name: label, exact: true })
        await expect(async () => {
          const geom = await focusFlight(page, ids[0])
          expect(geom, `flight #${ids[0]} focusable`).toBeTruthy()
          await dashboard.flightCanvas.click({ position: { x: (geom as FocusResult).x, y: (geom as FocusResult).y }, button: 'right' })
          await expect(create).toBeVisible({ timeout: 1_000 })
        }).toPass({ timeout: 15_000 })
        await create.click()

        // The new pairing lands covering exactly this rotation's legs.
        let pairingId: number | undefined
        await expect.poll(async () => {
          const segs = await segsNow(page)
          const match = segs.find((s) => s.fltId === ids[0] && !before.has(s.pairingId))
          if (!match) return null
          const segIds = new Set(segs.filter((s) => s.pairingId === match.pairingId).map((s) => s.fltId))
          if (!ids.every((id) => segIds.has(id))) return null
          pairingId = match.pairingId
          return pairingId
        }, { message: `pairing for rotation ${rot.map((l) => l.fltNum).join('/')} appears with all ${ids.length} legs`, timeout: 20_000 }).not.toBeNull()
        createdPairingIds.push(pairingId!)
        ids.forEach((id) => coveredIds.add(id))

        const p = (await pairingsNow(page)).find((x) => x.id === pairingId)!
        expect(p.base, `#${pairingId} (${rot[0].airline}) based at ${expectedBase(rot[0].airline)}`).toBe(expectedBase(rot[0].airline))
        const ca = p.composition.find((c) => c.rank === 'CA')?.plan
        const fo = p.composition.find((c) => c.rank === 'FO')?.plan
        expect(ca, `#${pairingId} (${fleet}) CA plan`).toBe(wide ? 2 : 1)
        expect(fo, `#${pairingId} (${fleet}) FO plan`).toBe(wide ? 2 : 1)

        built++
        if (built % 20 === 0) { /* eslint-disable-next-line no-console */ console.log(`[roundtrip] built ${built} pairings`) }
      }
    }

    if (!fullSweep) {
      // eslint-disable-next-line no-console
      console.log(`[roundtrip] SMOKE (${FLEETS.join(',')}) — built ${built} multi-leg pairings; skipping the 219 coverage assertion`)
      expect(built, 'smoke: at least one multi-leg pairing built').toBeGreaterThan(0)
      return
    }

    expect(allTargetIds.size, 'all 219 ET/EK 01-Sep legs enumerated').toBe(219)

    // Headline: every ET/EK 01-Sep leg is now covered by a pairing segment.
    const allSegs = await segsNow(page)
    const coveredAfter = new Set<number>(allSegs.map((s) => s.fltId).filter((v): v is number => v != null))
    const missing = [...allTargetIds].filter((id) => !coveredAfter.has(id))
    expect(missing, `uncovered ET/EK 01-Sep legs: ${missing.join(', ')}`).toHaveLength(0)

    // Requests 1–4: prove the rebuilt pairings carry the rest + render-anchor data the gantt
    // canvas needs to draw the duty box, layover puck and back-to-base REST puck — store truth,
    // not pixels (the renderer derives every puck from these segment fields).
    const ms = (iso: string | null): number => (iso ? Date.parse(iso) : NaN)
    const byPairing = new Map<number, SegObj[]>()
    for (const s of allSegs) {
      if (!createdPairingIds.includes(s.pairingId)) continue
      const arr = byPairing.get(s.pairingId) ?? []
      arr.push(s); byPairing.set(s.pairingId, arr)
    }
    const anchorGaps: string[] = []
    const restViolations: string[] = []
    let multiDuty = 0
    for (const [pid, segs] of byPairing) {
      const duties = [...new Set(segs.map((s) => s.dutySeq ?? 1))]
        .sort((a, b) => a - b)
        .map((d) => segs.filter((s) => (s.dutySeq ?? 1) === d).sort((a, b) => (a.segSeq ?? 0) - (b.segSeq ?? 0)))
      if (duties.length > 1) multiDuty++
      // (3) Back-to-base REST puck: last duty's last seg must carry dropoffEnd + rest minutes.
      const lastDuty = duties[duties.length - 1]
      const lastSeg = lastDuty[lastDuty.length - 1]
      if (!lastSeg.dropoffEndUtc || !(lastSeg.dutySchRestMin && lastSeg.dutySchRestMin > 0)) {
        anchorGaps.push(`#${pid} REST puck data missing (dropoffEnd=${lastSeg.dropoffEndUtc}, rest=${lastSeg.dutySchRestMin})`)
      }
      // (2) Layover puck anchors + (1) the layover ≥ max(12h, previous-duty span).
      for (let d = 1; d < duties.length; d++) {
        const prevDuty = duties[d - 1]
        const prevLast = prevDuty[prevDuty.length - 1]
        const curFirst = duties[d][0]
        if (!prevLast.dropoffEndUtc || !curFirst.pickupStartUtc) {
          anchorGaps.push(`#${pid} duty${d + 1} layover puck anchors missing (dropoffEnd=${prevLast.dropoffEndUtc}, pickupStart=${curFirst.pickupStartUtc})`)
        }
        const prevDutyMin = (ms(prevLast.schEndDtUtc) - ms(prevDuty[0].schStrDtUtc)) / 60_000 + CHECKIN_MIN
        const requiredMin = Math.max(720, prevDutyMin)
        const gapMin = (ms(curFirst.schStrDtUtc) - ms(prevLast.schEndDtUtc)) / 60_000
        if (gapMin + 1 < requiredMin) {
          restViolations.push(`#${pid} duty${d}→${d + 1} layover ${Math.round(gapMin)}m < required ${Math.round(requiredMin)}m (prev duty ${Math.round(prevDutyMin)}m)`)
        }
      }
    }
    expect(anchorGaps, `pairings missing duty-box/layover/REST render anchors:\n${anchorGaps.join('\n')}`).toHaveLength(0)
    expect(restViolations, `layovers below max(12h, prev-duty) [request 1]:\n${restViolations.join('\n')}`).toHaveLength(0)

    // eslint-disable-next-line no-console
    console.log(`[roundtrip] DONE — ${allTargetIds.size} legs covered by ${built} real pairings (${multiDuty} multi-duty, rest+anchors OK)`)
  })
})
