/**
 * Duty-rest + duty-block integrity proof for the rebuilt EK/ET pairings.
 *
 * Case 1 — #150707 (Ryan: "rest after duty 1 didn't meet our defined mini rest"): the old build
 * logic let the 8h block cap split a continuous trip into two duties and stamped a fictitious 12h
 * rest over a 60-minute turn. Fix: duty boundaries are purely rest-driven — a new duty opens ONLY
 * after a real ground gap >= REST_FLOOR_MIN (720 min / 12h).
 *
 * Case 2 — #150717 (Ryan: "more than 1 seg, total flight time > 8 hours, also not respect our
 * rule"): a multi-segment duty must not exceed MAX_DUTY_BLOCK_MIN (480 min / 8h) of total block
 * (single-segment long-haul duties are exempt — augmented-crew ops). The old leg-chooser welded
 * long out-and-back rotations (ADD-JFK, ADD-LGW, ET823 ADD-VFA-GBE-ADD, …) into one same-day duty.
 * Fix: those rotations are restructured as REAL layover pairings — outbound duty on day N, a
 * genuine >= 12h rest at the outstation, return duty on day N+1. 53 violating pairings were
 * deleted and 63 rule-clean layover pairings built in their place.
 *
 * This spec drives the REAL Live UI (§Simulate-User): it filters the pairing pane to base DXB/ADD
 * (Apply Filters fetches pageSize=0, so the store loads EVERY matching pairing — the claims are
 * complete, not a paginated sample), then asserts (§No-Illusion) from store truth that:
 *   1. REST INVARIANT — at every duty boundary, the real ground gap (prev duty last arrival →
 *      next duty first departure) is >= REST_FLOOR_MIN. No fabricated rest can survive this.
 *   2. BLOCK INVARIANT — no duty with more than one segment carries total block > MAX_DUTY_BLOCK_MIN.
 *      This assertion FAILS on the pre-fix data (#150717's 680-min 3-leg duty) — the regression guard.
 *   3. Layover-shape regression for #150717's route: every ET823 pairing spans >= 2 duties (the
 *      day-N outbound / day-N+1 return split), with each multi-seg duty <= 480 block.
 * A screenshot of the filtered pane is captured as the visual proof (§PW-Snapshot).
 *
 * Read-only: this spec never builds or deletes. The duty planner (planDuties, rest-driven) lives in
 * live-server/src/services/pairing/pairing-build-service.ts with a Vitest unit regression; the
 * full data-level rule audit is live-server/scripts/audit-pairing-build-rules.mjs (rules A–F).
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, setDateRange } from '../../utils/gantt-hook'

interface PairingObj { id: number; base: string | null; fleet: string | null }
interface SegObj {
  pairingId: number; dutySeq: number | null; segSeq: number | null
  schStrDtUtc: string | null; schEndDtUtc: string | null
  depArp: string | null; arvArp: string | null; fltNum: string | null
  dutySchRestMin: number | null
}

// Full rebuild window (the delete+rebuild placed every loop's legs inside 29 Aug–04 Sep).
const WIN_START = '2026-08-29T00:00:00.000Z'
const WIN_END = '2026-09-05T00:00:00.000Z'
const HOME_BASES = ['DXB', 'ADD']
// Post-duty rest floor / minimum rest = 12h. A duty boundary may only sit over a gap >= this.
const REST_FLOOR_MIN = 720
// Max total block for a duty holding MORE THAN ONE segment = 8h (single-seg long-haul exempt).
const MAX_DUTY_BLOCK_MIN = 480

const minutesBetween = (a: string, b: string): number => (new Date(b).getTime() - new Date(a).getTime()) / 60000

const applyPairingBaseFilter = (page: Page, bases: string[]): Promise<void> =>
  page.evaluate(
    (b) => (window.__ganttTest as unknown as { applyPairingFilter: (f: { bases: string[] }) => Promise<void> }).applyPairingFilter({ bases: b }),
    bases,
  )

const ordered = (ss: SegObj[]): SegObj[] =>
  [...ss].sort(
    (a, b) =>
      (a.dutySeq ?? 0) - (b.dutySeq ?? 0) ||
      (a.segSeq ?? 0) - (b.segSeq ?? 0) ||
      (a.schStrDtUtc ?? '').localeCompare(b.schStrDtUtc ?? ''),
  )

test.describe('EK/ET pairing duty-rest + duty-block integrity (post logic-fix + rebuild)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    await setDateRange(page, WIN_START, WIN_END)
  })

  test('Live-1707d — no fabricated rest at any duty boundary; no multi-seg duty over the 8h block cap; ET823 is a layover pairing', async ({ page }) => {
    await applyPairingBaseFilter(page, HOME_BASES)
    await expect
      .poll(async () => (await readHook<PairingObj[]>(page, 'pairings')).length, { message: 'DXB/ADD pairings loaded', timeout: 30_000 })
      .toBeGreaterThan(0)

    const pairings = await readHook<PairingObj[]>(page, 'pairings')
    const segs = await readHook<SegObj[]>(page, 'pairingSegments')
    const baseById = new Map(pairings.map((p) => [p.id, p.base]))

    // Group segments per DXB/ADD pairing.
    const byPairing = new Map<number, SegObj[]>()
    for (const s of segs) {
      if (!HOME_BASES.includes(baseById.get(s.pairingId) ?? '')) continue
      byPairing.set(s.pairingId, [...(byPairing.get(s.pairingId) ?? []), s])
    }
    expect(byPairing.size, 'DXB/ADD pairings present to validate').toBeGreaterThan(0)

    // REST INVARIANT (#150707): at every duty-seq change, the real ground gap must be >= the floor.
    // BLOCK INVARIANT (#150717): a duty with >1 segment must not exceed 480 min of total block
    // (block = scheduled arv - dep per segment, summed per duty).
    const restViolations: string[] = []
    const blockViolations: string[] = []
    for (const [pid, ss] of byPairing) {
      const os = ordered(ss)
      const dutyBlk = new Map<number, { blk: number; legs: number }>()
      for (const s of os) {
        if (s.schStrDtUtc && s.schEndDtUtc) {
          const d = dutyBlk.get(s.dutySeq ?? 0) ?? { blk: 0, legs: 0 }
          d.blk += minutesBetween(s.schStrDtUtc, s.schEndDtUtc)
          d.legs += 1
          dutyBlk.set(s.dutySeq ?? 0, d)
        }
      }
      for (const [dutySeq, d] of dutyBlk) {
        if (d.legs > 1 && d.blk > MAX_DUTY_BLOCK_MIN) {
          blockViolations.push(`#${pid} duty ${dutySeq}: ${d.legs} legs, block ${Math.round(d.blk)}m > ${MAX_DUTY_BLOCK_MIN}m`)
        }
      }
      for (let i = 1; i < os.length; i++) {
        const prev = os[i - 1]
        const cur = os[i]
        if ((prev.dutySeq ?? 0) === (cur.dutySeq ?? 0)) continue // same duty (quick turn) — no rest expected
        if (!prev.schEndDtUtc || !cur.schStrDtUtc) continue
        const gap = minutesBetween(prev.schEndDtUtc, cur.schStrDtUtc)
        if (gap < REST_FLOOR_MIN) {
          restViolations.push(
            `#${pid} duty ${prev.dutySeq}->${cur.dutySeq} boundary ${prev.fltNum} ${prev.arvArp}->${cur.depArp} ${cur.fltNum}: ` +
              `gap ${Math.round(gap)}m < ${REST_FLOOR_MIN}m (stamped rest ${prev.dutySchRestMin ?? '—'}m)`,
          )
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[duty-integrity] validated ${byPairing.size} DXB/ADD pairings — ${restViolations.length} fabricated-rest boundaries, ${blockViolations.length} over-cap multi-seg duties`,
    )
    expect(restViolations, `duty boundaries over a sub-minimum-rest gap still present:\n${restViolations.join('\n')}`).toHaveLength(0)
    expect(blockViolations, `multi-seg duties over the 8h block cap still present:\n${blockViolations.join('\n')}`).toHaveLength(0)

    // Layover-shape regression for #150717: ET823 ADD-VFA-GBE-ADD (680-min block) cannot be one
    // duty — every ET823 pairing must span >= 2 duties with a real rest between (outbound day N,
    // return day N+1). This fails on the pre-fix single-duty data.
    const et823 = [...byPairing.entries()].filter(([, ss]) => ss.some((s) => s.fltNum === 'ET823'))
    expect(et823.length, 'ET823 layover pairings present').toBeGreaterThan(0)
    for (const [pid, ss] of et823) {
      const duties = new Set(ss.map((s) => s.dutySeq))
      const route = ordered(ss).map((s) => `${s.depArp}-${s.arvArp}`).join(' ')
      expect(duties.size, `#${pid} ET823 ${route} must be split across >= 2 duties by a real layover`).toBeGreaterThanOrEqual(2)
    }

    // Visual proof of the clean DXB/ADD set (§PW-Snapshot, Ver2 = post-restructure round).
    await dashboard.pairingPane.screenshot({ path: '../docs/assets/screenshots/gantt/ek-et-duty-rest-integrity-Ver2.png' })
  })
})
