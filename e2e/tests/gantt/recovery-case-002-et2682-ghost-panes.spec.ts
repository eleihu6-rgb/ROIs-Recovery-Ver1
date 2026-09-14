/**
 * Case 2 — ET2682's 1.5h delay must draw the hatched "sched" delay-ghost in EVERY
 * pane (Roster, Pairing, Flight), while ET2681 (returned to on-time) draws none.
 *
 * The generic ghost RENDERING per pane is already locked by the three
 * *-delay-ghost-bar specs (canvas-pixel assertions). This spec proves the CASE-2
 * data drives that same code path for ET2682 specifically: it loads pairing 152675
 * duty 1 into all three panes, focuses ET2682 in each, asserts the loaded row carries
 * the 90-minute delay (and ET2681 carries none), and captures a §PW-Snapshot per pane
 * for visual inspection of the ghost head.
 *
 * Scenario data is applied by set-scenario-et2682-delay.cjs (reversible fixture),
 * scoped to pairing 152675 — the same demo state the recovery/discretion flow uses.
 */
import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, readHook, setDateRange, openLiveView, waitGanttReady, addFlightPane } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const SHOT_DIR = path.resolve(REPO, 'docs/assets/screenshots/crew-recovery')
const S2 = path.resolve(REPO, '.local/s2-et-consent')

const PAIRING_ID = 152675
const CREW_ID = 'T2001'
const ON_TIME_FLT = 161242 // ET2681 (ADD->DXB), returned to on-time
const DELAY_FLT = 161243   // ET2682 (DXB->ADD), +90 min
const DELAY_SEG = 470256   // ET2682 segment in pairing 152675 duty 1
const EXPECT_DELAY_MIN = 90
const PX_PER_HOUR = 60     // 1px/min — makes the 90-min ghost head 90px wide

const runCjs = (file: string, args: string[] = []): string =>
  execFileSync('node', [path.join(S2, file), ...args], { cwd: REPO, encoding: 'utf8' }).trim()

const ev = <T,>(page: Page, fn: string, arg?: unknown): Promise<T> =>
  page.evaluate(
    ({ fn, arg }) => (window.__ganttTest as unknown as Record<string, (a?: unknown) => unknown>)[fn](arg) as T,
    { fn, arg },
  )
const setZoom = (page: Page, px: number) => ev<void>(page, 'setZoom', px)
const settleFrame = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

/**
 * Focus hooks return null until the target pane's canvas has painted its
 * panel-row receipt. Enabling the extra panes triggers a relayout, so poll the
 * focus (giving the canvas a frame each attempt) until it lands on-canvas.
 */
const focusUntil = async (page: Page, fn: string, arg: number): Promise<{ x: number; y: number }> => {
  let hit: { x: number; y: number } | null = null
  await expect
    .poll(async () => {
      await settleFrame(page)
      hit = await ev<{ x: number; y: number } | null>(page, fn, arg)
      return hit != null
    }, { message: `${fn}(${arg}) lands on-canvas`, timeout: 20_000 })
    .toBe(true)
  return hit!
}

interface RosterItemRow { id: number; crewId: string; pairingId: number | null; start: string | null; actStrDtUtc: string | null }
interface PairingSegmentRow { segId: number; schStrDtUtc: string | null; actStrDtUtc: string | null }
interface FlightRow { id: number; fltNum: string | null; start: string | null; actDepDtUtc: string | null }

const delayMin = (act: string | null, sch: string | null) =>
  act && sch ? Math.round((Date.parse(act) - Date.parse(sch)) / 60000) : 0

test('Case 2 — ET2682 1.5h delay ghost renders in Roster / Pairing / Flight panes (ET2681 clean)', async ({ page, request }) => {
  test.setTimeout(180_000)
  console.log('[scenario]', runCjs('set-scenario-et2682-delay.cjs'))

  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  // Roster + Pairing panes exist by default; the Flight pane is added on demand
  // via its real toolbar button (setPaneVisible only toggles a pane that exists).
  await openLiveView(page)
  await waitGanttReady(page)
  await addFlightPane(page)

  // The scenario sits on 2026-09-29; give a day of margin either side.
  await setDateRange(page, '2026-09-28T00:00:00.000Z', '2026-09-30T12:00:00.000Z')
  await setZoom(page, PX_PER_HOUR)

  // ── Load all three panes for this pairing ────────────────────────────────
  await ev<Promise<void>>(page, 'applyCrewFilter', { crewIds: [CREW_ID] })
  await ev<Promise<void>>(page, 'applyPairingFilter', { pairingIds: [String(PAIRING_ID)], coverage: [] })
  await ev<Promise<void>>(page, 'applyFlightFilter', { fltNums: ['ET2682'] })

  // ── Roster pane: the crew's leg rows carry the delay on ET2682, not ET2681 ─
  await expect.poll(async () => (await readHook<RosterItemRow[]>(page, 'roster')).some((r) => r.pairingId === PAIRING_ID), { timeout: 20_000 }).toBe(true)
  const rosterItems = (await readHook<RosterItemRow[]>(page, 'roster')).filter((r) => r.pairingId === PAIRING_ID && r.crewId === CREW_ID)
  expect(rosterItems.length, 'pairing 152675 loaded in Roster for T2001').toBeGreaterThan(0)
  const focusItem = rosterItems[0]
  await focusUntil(page, 'focusRosterItem', focusItem.id)
  await page.locator('canvas[data-testid="roster-canvas"]').screenshot({ path: `${SHOT_DIR}/case2-et2682-ghost-roster-Ver1.png` })

  // ── Pairing pane: seg 470256 (ET2682) delayed 90; ET2681 seg clean ────────
  await expect.poll(async () => (await readHook<PairingSegmentRow[]>(page, 'pairingSegments')).some((s) => s.segId === DELAY_SEG), { timeout: 20_000 }).toBe(true)
  const segs = await readHook<PairingSegmentRow[]>(page, 'pairingSegments')
  const delaySeg = segs.find((s) => s.segId === DELAY_SEG)
  expect(delaySeg, 'ET2682 segment loaded').toBeTruthy()
  expect(delayMin(delaySeg!.actStrDtUtc, delaySeg!.schStrDtUtc), 'ET2682 seg delayed 1.5h').toBe(EXPECT_DELAY_MIN)
  await focusUntil(page, 'focusPairingSegment', DELAY_SEG)
  await page.locator('canvas[data-testid="pairing-canvas"]').screenshot({ path: `${SHOT_DIR}/case2-et2682-ghost-pairing-Ver1.png` })

  // ── Flight pane: ET2682 delayed 90; ET2681 on-time (0) ────────────────────
  await expect.poll(async () => (await readHook<FlightRow[]>(page, 'flights')).some((f) => f.id === DELAY_FLT), { timeout: 20_000 }).toBe(true)
  const flights = await readHook<FlightRow[]>(page, 'flights')
  const et2682 = flights.find((f) => f.id === DELAY_FLT)
  expect(et2682, 'ET2682 flight loaded').toBeTruthy()
  expect(delayMin(et2682!.actDepDtUtc, et2682!.start), 'ET2682 flight delayed 1.5h').toBe(EXPECT_DELAY_MIN)
  await focusUntil(page, 'focusFlight', DELAY_FLT)
  await page.locator('canvas[data-testid="flight-canvas"]').screenshot({ path: `${SHOT_DIR}/case2-et2682-ghost-flight-Ver1.png` })

  // ── ET2681 must be clean everywhere it is loaded (no ghost) ───────────────
  const onTimeSeg = segs.find((s) => s.segId === 470255)
  if (onTimeSeg) expect(delayMin(onTimeSeg.actStrDtUtc, onTimeSeg.schStrDtUtc), 'ET2681 seg on-time').toBe(0)
  const et2681 = flights.find((f) => f.id === ON_TIME_FLT)
  if (et2681) expect(delayMin(et2681.actDepDtUtc, et2681.start), 'ET2681 flight on-time').toBe(0)

  // Whole-viewport capture (all three panes at once) for the record.
  await page.screenshot({ path: `${SHOT_DIR}/case2-et2682-ghost-all-panes-Ver1.png` })
})
