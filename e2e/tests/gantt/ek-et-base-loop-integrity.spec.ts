/**
 * Base-loop integrity proof for the rebuilt EK/ET pairings (Ryan: "pairing id 150497 is not a valid
 * pairing, there was no legs connecting it from either base" → "delete the invalid, then rebuild them").
 *
 * A valid crew pairing is a round trip that STARTS and ENDS at the airline's home base
 * (EK→DXB, ET→ADD). #150497 violated that — it never connected from either base — so it, and the
 * other 89 stranded fragments, were deleted and their legs rebuilt into real base→base loops.
 *
 * This spec drives the REAL Live UI (§Simulate-User): it filters the pairing pane to base DXB/ADD
 * (an Apply-Filters fetch sends pageSize=0, so the store loads EVERY matching pairing — the 0-invalid
 * claim is complete, not a paginated sample), then asserts (§No-Illusion) from store truth that:
 *   1. every DXB/ADD pairing's ordered segments start at its home base and end at its home base;
 *   2. zero pairings are stranded (dep≠base or final arv≠base) — the #150497 defect cannot recur;
 *   3. the invalid pairing #150497 is gone.
 * A screenshot of the filtered pane is captured as the visual proof (§PW-Snapshot).
 *
 * Read-only: this spec never builds or deletes. The build/guard logic lives in
 * ek-et-roundtrip-pairing-build.spec.ts (buildRotations now drops any non-base-loop rotation).
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

interface PairingObj { id: number; base: string | null; fleet: string | null }
interface SegObj {
  pairingId: number; fltId: number | null; dutySeq: number | null; segSeq: number | null
  schStrDtUtc: string | null; depArp: string | null; arvArp: string | null; fltNum: string | null
}

// Full rebuild window (the delete+rebuild placed every loop's legs inside 29 Aug–04 Sep).
const WIN_START = '2026-08-29T00:00:00.000Z'
const WIN_END = '2026-09-05T00:00:00.000Z'
const HOME_BASES = ['DXB', 'ADD']
const DELETED_INVALID_ID = 150497

const applyPairingBaseFilter = (page: Page, bases: string[]): Promise<void> =>
  page.evaluate(
    (b) => (window.__ganttTest as unknown as { applyPairingFilter: (f: { bases: string[] }) => Promise<void> }).applyPairingFilter({ bases: b }),
    bases,
  )

test.describe('EK/ET pairing base-loop integrity (post delete+rebuild)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    await setDateRange(page, WIN_START, WIN_END)
  })

  test('Live-1722i — every DXB/ADD pairing is a real base→base loop; invalid #150497 is gone', async ({ page }) => {
    // Filter to the two home bases. Apply Filters fetches pageSize=0 → the store holds ALL DXB/ADD
    // pairings, so "0 invalid" below is a complete claim, not a viewport sample.
    await applyPairingBaseFilter(page, HOME_BASES)
    await expect
      .poll(async () => (await readHook<PairingObj[]>(page, 'pairings')).length, { message: 'DXB/ADD pairings loaded', timeout: 30_000 })
      .toBeGreaterThan(0)

    const pairings = await readHook<PairingObj[]>(page, 'pairings')
    const segs = await readHook<SegObj[]>(page, 'pairingSegments')
    const baseById = new Map(pairings.map((p) => [p.id, p.base]))

    // Only home-based pairings carry the invariant (guard against any non-DXB/ADD leaking in).
    const homeBased = pairings.filter((p) => HOME_BASES.includes(p.base ?? ''))
    expect(homeBased.length, 'DXB/ADD pairings present to validate').toBeGreaterThan(0)

    const byPairing = new Map<number, SegObj[]>()
    for (const s of segs) {
      if (!HOME_BASES.includes(baseById.get(s.pairingId) ?? '')) continue
      byPairing.set(s.pairingId, [...(byPairing.get(s.pairingId) ?? []), s])
    }

    // A pairing with no loaded segments can't be proven a loop — surface it rather than pass silently.
    const noSegs = homeBased.filter((p) => !byPairing.has(p.id)).map((p) => p.id)
    expect(noSegs, `DXB/ADD pairings with no segments loaded: ${noSegs.join(', ')}`).toHaveLength(0)

    const invalid: string[] = []
    for (const [pid, ss] of byPairing) {
      const base = baseById.get(pid)!
      // Duty/seg order is the operational sequence; fall back to scheduled start on ties.
      const ordered = [...ss].sort(
        (a, b) =>
          (a.dutySeq ?? 0) - (b.dutySeq ?? 0) ||
          (a.segSeq ?? 0) - (b.segSeq ?? 0) ||
          (a.schStrDtUtc ?? '').localeCompare(b.schStrDtUtc ?? ''),
      )
      const firstDep = ordered[0].depArp
      const lastArv = ordered[ordered.length - 1].arvArp
      if (firstDep !== base || lastArv !== base) {
        invalid.push(`#${pid} (${base}) ${ordered.map((s) => s.fltNum).filter(Boolean).join('/')}: ${firstDep}→…→${lastArv} (not a ${base}→…→${base} loop)`)
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[integrity] validated ${byPairing.size} DXB/ADD pairings — ${invalid.length} invalid`)
    expect(invalid, `stranded (non-base-loop) pairings still present:\n${invalid.join('\n')}`).toHaveLength(0)

    // The specific invalid pairing Ryan flagged must be gone.
    expect(pairings.find((p) => p.id === DELETED_INVALID_ID), `invalid pairing #${DELETED_INVALID_ID} must be deleted`).toBeUndefined()

    // Visual proof of the clean DXB/ADD set (§PW-Snapshot).
    await dashboard.pairingPane.screenshot({ path: '../docs/assets/screenshots/gantt/ek-et-base-loop-integrity-Ver1.png' })
  })
})
