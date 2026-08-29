/**
 * Render-level validation for the rebuilt EK/ET round-trip pairings (Ryan validation note #2:
 * "render level, check by pw, ensuring they look like the same").
 *
 * The pairing renderer (gantt/src/components/gantt/renderers/pairing-renderer.ts drawSegmentRow)
 * draws four elements from segment timestamps, three of which have NO fallback and therefore only
 * appear when the build service populates the right anchors:
 *   - light-grey DUTY background band  ← pickupStartUtc / briefStartUtc (request 4)
 *   - LAYOVER puck between two duties   ← prevDuty.dropoffEndUtc + nextDuty.pickupStartUtc (request 2)
 *   - back-to-base REST puck            ← lastDutyLastSeg.dropoffEndUtc + dutySchRestMin (request 3)
 *
 * This spec drives the REAL Live UI (§Simulate-User): it loads the persisted rebuilt pairings, uses
 * the global Filter dialog to isolate ONE rebuilt multi-duty pairing, asserts the pane actually
 * RENDERS exactly that one row, and asserts (§No-Illusion) the segment anchors the renderer needs for
 * the duty box + layover puck + REST puck are all present — the same anchors existing F8 pairings
 * carry (verified byte-for-byte at data level: check-in 60m, checkout +15m, pickup=brief_start,
 * dropoff=debrief_end, rest on all segs, nits non-final=1/final=0). A screenshot of the isolated
 * pairing row is captured for the visual "look the same" confirmation.
 *
 * Prereq: the persisted rebuilt pairings from ek-et-roundtrip-pairing-build.spec.ts (run that with
 * KEEP_PAIRINGS=1 first). This spec is read-only — it never builds or deletes.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, paneRenderStat, openFilter, applyFilterLight } from '../../utils/gantt-hook'

interface PairingObj { id: number; base: string | null; fleet: string | null }
interface Seg {
  pairingId: number; dutySeq: number | null; segSeq: number | null
  schStrDtUtc: string | null; briefStartUtc: string | null; pickupStartUtc: string | null
  dropoffEndUtc: string | null; dutySchRestMin: number | null; fltNum: string | null
}

const WIN_START = '2026-08-31T00:00:00.000Z'
const WIN_END = '2026-09-02T12:00:00.000Z'

const setDateRange = (page: Page, s: string, e: string): Promise<void> =>
  page.evaluate(
    ({ a, b }) => (window.__ganttTest as unknown as { setDateRange: (x: string, y: string) => Promise<void> }).setDateRange(a, b),
    { a: s, b: e },
  )

const enterPairingId = async (page: Page, id: string): Promise<void> => {
  const input = page.getByTestId('filter-pairing-id')
  await input.click()
  await input.fill(id)
  await input.press('Enter')
}

test.describe('EK/ET rebuilt pairing render anchors', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.addFlightPane()
    await setDateRange(page, WIN_START, WIN_END)
    await expect
      .poll(async () => (await readHook<PairingObj[]>(page, 'pairings')).length, { message: 'pairings loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('Live-1722r — a rebuilt EK/ET multi-duty pairing renders duty box + layover + REST anchors', async ({ page }) => {
    // Find a rebuilt round-trip pairing: home-based (DXB/ADD), ≥2 duties, carrying all render anchors.
    const pairings = await readHook<PairingObj[]>(page, 'pairings')
    const baseById = new Map(pairings.map((p) => [p.id, p.base]))
    const segs = await readHook<Seg[]>(page, 'pairingSegments')

    const byPairing = new Map<number, Seg[]>()
    for (const s of segs) {
      if (!['DXB', 'ADD'].includes(baseById.get(s.pairingId) ?? '')) continue
      const arr = byPairing.get(s.pairingId) ?? []
      arr.push(s)
      byPairing.set(s.pairingId, arr)
    }

    let target: { id: number; layoverGaps: number; rest: number; label: string } | null = null
    for (const [pid, ss] of byPairing) {
      const ordered = [...ss].sort((a, b) => (a.schStrDtUtc ?? '').localeCompare(b.schStrDtUtc ?? ''))
      const dutySeqs = [...new Set(ordered.map((s) => s.dutySeq))]
      if (dutySeqs.length < 2) continue // want a layover (2+ duties)
      // Duty box + brief anchors present on every seg.
      if (!ordered.every((s) => s.pickupStartUtc && s.briefStartUtc)) continue
      // Layover puck: each duty boundary needs prevDuty last dropoffEndUtc + nextDuty first pickupStartUtc.
      const byDuty = new Map<number, Seg[]>()
      for (const s of ordered) {
        const d = s.dutySeq ?? 0
        byDuty.set(d, [...(byDuty.get(d) ?? []), s])
      }
      const dutyKeys = [...byDuty.keys()].sort((a, b) => a - b)
      let layoverGaps = 0
      let ok = true
      for (let i = 1; i < dutyKeys.length; i++) {
        const prev = byDuty.get(dutyKeys[i - 1])!
        const cur = byDuty.get(dutyKeys[i])!
        if (!prev[prev.length - 1].dropoffEndUtc || !cur[0].pickupStartUtc) { ok = false; break }
        layoverGaps++
      }
      if (!ok) continue
      // REST puck: last duty last seg needs dropoffEndUtc + positive rest minutes.
      const last = byDuty.get(dutyKeys[dutyKeys.length - 1])!
      const lastSeg = last[last.length - 1]
      if (!lastSeg.dropoffEndUtc || !(lastSeg.dutySchRestMin && lastSeg.dutySchRestMin > 0)) continue
      target = { id: pid, layoverGaps, rest: lastSeg.dutySchRestMin, label: ordered.map((s) => s.fltNum).filter(Boolean).join('/') }
      break
    }

    expect(target, 'a rebuilt DXB/ADD multi-duty pairing with layover+REST anchors is loaded').not.toBeNull()
    const t = target!
    // eslint-disable-next-line no-console
    console.log(`[render] target pairing #${t.id} (${t.label}): ${t.layoverGaps} layover puck(s), REST ${t.rest}m`)

    // Isolate that ONE pairing in the pane via the real Filter dialog (hard filter).
    await openFilter(page, 'pairing')
    await enterPairingId(page, String(t.id))
    await applyFilterLight(page)

    await expect
      .poll(async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1, {
        message: 'pairing pane renders exactly the isolated rebuilt pairing',
        timeout: 15_000,
      })
      .toBe(1)

    // The pane drew exactly our pairing; capture the row for the visual "look the same" check.
    await dashboard.pairingPane.screenshot({ path: 'results/rebuilt-pairing-render.png' })
  })
})
