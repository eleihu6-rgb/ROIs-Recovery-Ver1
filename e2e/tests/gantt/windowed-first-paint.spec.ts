import { test, expect, type Page } from '@playwright/test'
import {
  seedGanttAuth,
  readHook,
  counts,
  selectFirstAvailableOption,
  scrollPaneVertically,
  addFlightPane,
  setDateRange,
} from '../../utils/gantt-hook'

/**
 * SAFEGUARD — single-round batched-load invariants. Run on EVERY change that touches the
 * Live load path (apply-filters, crew/pairing/flight/roster stores, gantt-view-store,
 * use-gantt-viewport). It encodes the contract:
 *
 *   1. Apply fires crew + roster + pairing requests (no legacy /gantt/bootstrap windowing).
 *   2. The roster NEVER shrinks while the batched full set streams in (concurrent append).
 *   3. No roster request uses the legacy fixed 14-day window.
 *   4. Filter combos (crew / pairing / flight, 1..n at once) still render elements.
 *   5. Scrolling (up/down, left/right) never shrinks the loaded roster.
 *
 * Assertions use network capture + store introspection (deterministic), derived from the
 * actually-applied range so they hold on any run date.
 *
 * Requires DB-valid gantt creds, e.g.  GANTT_TEST_USER=Ryan GANTT_TEST_PASS=Our2027
 * Run with --no-deps (auth is seeded directly).
 */

// One retry absorbs load-induced sampling jitter under parallel runs.
test.describe.configure({ retries: 1 })

// ── date helpers ────────────────────────────────────────────────────────────
const shiftYmdMonths = (ymd: string, months: number): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10)
}
const addDaysYmd = (ymd: string, n: number): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const daysToEndOfMonth = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1
}
const dayspan = (s: string, e: string): number => Math.round((Date.parse(e) - Date.parse(s)) / 86_400_000) + 1
const drYmd = async (page: Page): Promise<{ start: string; end: string }> => {
  const dr = await readHook<{ start: string; end: string }>(page, 'dateRange')
  return { start: dr.start.slice(0, 10), end: dr.end.slice(0, 10) }
}

// ── network capture ───────────────────────────────────────────────────────────
interface Capture {
  bootstrap: Array<{ pageSize: number; rosterWindowDays: number }>
  roster: Array<{ start: string; end: string; days: number; crewCount: number }>
  pairing: Array<{ pageSize: number | null }>
}
const newCapture = (): Capture => ({ bootstrap: [], roster: [], pairing: [] })
const attachCapture = (page: Page, cap: Capture): void => {
  page.on('request', (r) => {
    let u: URL
    try { u = new URL(r.url()) } catch { return }
    const p = u.pathname; const q = u.searchParams
    if (p.endsWith('/gantt/bootstrap')) cap.bootstrap.push({ pageSize: Number(q.get('pageSize')), rosterWindowDays: Number(q.get('rosterWindowDays')) })
    else if (p.endsWith('/roster')) { const s = q.get('startDate'); const e = q.get('endDate'); if (s && e) cap.roster.push({ start: s, end: e, days: dayspan(s, e), crewCount: (q.get('crewIds') ?? '').split(',').filter(Boolean).length }) }
    else if (p.endsWith('/pairing')) cap.pairing.push({ pageSize: q.get('pageSize') != null ? Number(q.get('pageSize')) : null })
  })
}
const clearCap = (cap: Capture): void => { cap.bootstrap.length = 0; cap.roster.length = 0; cap.pairing.length = 0 }

// ── flow helpers ──────────────────────────────────────────────────────────────
const openAndApplyDefault = async (page: Page, cap: Capture): Promise<void> => {
  await page.goto('/altair/', { waitUntil: 'commit' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 90_000 })
  await page.getByTestId('module-nav-live').click()
  const empty = page.getByTestId('live-empty-state')
  await empty.waitFor({ state: 'visible', timeout: 10_000 })
  await empty.click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('filter-apply').click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 })
  await expect.poll(() => cap.roster.length || cap.pairing.length, { timeout: 30_000 }).toBeGreaterThan(0)
}

/** Poll the roster object count for `ms`, starting once it's >0; returns the timeline. */
const rosterTimeline = async (page: Page, ms = 7000, step = 150): Promise<number[]> => {
  const samples: number[] = []
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const n = (await counts(page)).roster
    if (n > 0 || samples.length > 0) samples.push(n)
    await page.waitForTimeout(step)
  }
  return samples
}
/**
 * The roster must not SHRINK while the batched set streams in. A date-range CHANGE
 * legitimately resets the roster to the new range's first batch (one downward step to the
 * trough); after that trough the count must only grow. So we assert monotonic
 * non-decreasing from the global minimum onward — this allows the single new-range reset
 * but catches any grow-then-shrink flicker during the load.
 */
const assertNoShrink = (samples: number[], label: string): void => {
  expect(samples.length, `${label}: roster appeared`).toBeGreaterThan(0)
  let minIdx = 0
  for (let i = 1; i < samples.length; i++) if (samples[i] < samples[minIdx]) minIdx = i
  for (let i = minIdx + 1; i < samples.length; i++) {
    expect(samples[i], `${label}: roster shrank during load (i=${i}: ${samples[i]} < ${samples[i - 1]}; series=${samples.join(',')})`).toBeGreaterThanOrEqual(samples[i - 1])
  }
}

/** The core invariants for whatever range is currently applied. */
const assertLoaded = async (page: Page, cap: Capture, label: string): Promise<void> => {
  const dr = await drYmd(page)

  // (1) single-round load: roster + pairing requests fired (no /gantt/bootstrap windowing).
  expect(cap.roster.length, `${label}: roster request fired`).toBeGreaterThan(0)
  expect(cap.pairing.some((p) => p.pageSize === null || p.pageSize === 0), `${label}: full pairing request fired`).toBe(true)

  // (3) roster requests cover the full selected dateRange (batches span the whole range,
  //     never a narrower sub-window — the legacy 14-day windowing is gone).
  const rangeDays = dayspan(dr.start, dr.end)
  for (const r of cap.roster) {
    expect(r.days, `${label}: roster request ${r.start}..${r.end} covers the full range (${rangeDays}d)`).toBeGreaterThanOrEqual(rangeDays)
  }

  // panes rendered
  const c = await counts(page)
  expect(c.pairing, `${label}: pairing rows present`).toBeGreaterThan(0)
  expect(c.roster, `${label}: roster rows present`).toBeGreaterThan(0)
}

// ── (1,2,3) date-range matrix ────────────────────────────────────────────────
interface RangeScenario { name: string; setFrom?: (defStart: string) => string; setTo?: (defStart: string, defEnd: string) => string }
const RANGES: RangeScenario[] = [
  { name: 'default ~2 months' },
  { name: 'start forward +1 month', setFrom: (s) => shiftYmdMonths(s, 1) },
  { name: 'start backward -1 month', setFrom: (s) => shiftYmdMonths(s, -1) },
  { name: 'end forward +1 month', setTo: (_s, e) => shiftYmdMonths(e, 1) },
  { name: 'end backward -1 month', setTo: (_s, e) => shiftYmdMonths(e, -1) },
  { name: 'short range (<30 days)', setTo: (s) => addDaysYmd(s, 20) },
  { name: 'long range (>40 days)', setTo: (s) => addDaysYmd(s, 50) },
  { name: '2.5 months', setTo: (s) => addDaysYmd(s, 75) },
  { name: '3 months (cap)', setTo: (s) => addDaysYmd(s, 89) },
]

test.describe('Single-round batched load — date-range matrix (no shrink, no 14-day)', () => {
  for (const sc of RANGES) {
    test(`Live-1255 — ${sc.name}`, async ({ page, request }) => {
      const cap = newCapture()
      await seedGanttAuth(page, request)
      attachCapture(page, cap)
      await openAndApplyDefault(page, cap)
      await rosterTimeline(page, 3000)

      if (sc.setFrom || sc.setTo) {
        clearCap(cap)
        const dr = await drYmd(page)
        const nextFrom = sc.setFrom ? sc.setFrom(dr.start) : dr.start
        const nextTo = sc.setTo ? sc.setTo(dr.start, dr.end) : dr.end
        await setDateRange(page, nextFrom, nextTo)
        await expect.poll(() => cap.roster.length || cap.pairing.length, { timeout: 30_000 }).toBeGreaterThan(0)
      }

      // (2) no shrink while the batched set streams in
      await expect.poll(async () => (await counts(page)).roster, { timeout: 90_000, message: `${sc.name}: roster loaded` }).toBeGreaterThan(0)
      const timeline = await rosterTimeline(page, 7000)
      assertNoShrink(timeline, sc.name)
      // (1,3) load invariants
      await assertLoaded(page, cap, sc.name)
    })
  }
})

// ── sequential date changes always request the full selected range ───────────
test.describe('Single-round batched load — full-range requests across date-change sequences', () => {
  test('Live-1256 — default → May–Jul → Jun–Jul always requests the full selected range', async ({ page, request }) => {
    const cap = newCapture()
    await seedGanttAuth(page, request)
    attachCapture(page, cap) // capture ALL roster requests across the whole sequence (never cleared)
    await openAndApplyDefault(page, cap)
    await rosterTimeline(page, 2500)

    await setDateRange(page, '2026-05-01', '2026-07-31')
    await rosterTimeline(page, 4000)

    await setDateRange(page, '2026-06-01', '2026-07-31')
    await rosterTimeline(page, 4000)

    // After the final range (Jun 1 – Jul 31, 61d), every roster request for that range
    // must cover ≥61d (batches span the full range; a narrower sub-window means windowing).
    const lastRangeDays = dayspan('2026-06-01', '2026-07-31')
    const lateReqs = cap.roster.filter((r) => r.start === '2026-06-01')
    expect(lateReqs.length, 'roster requests fired for the June–July range').toBeGreaterThan(0)
    for (const r of lateReqs) {
      expect(r.days, `roster request ${r.start}..${r.end} (${r.days}d) covers the full June–July range (${lastRangeDays}d)`).toBeGreaterThanOrEqual(lastRangeDays)
    }
  })
})

// ── filter combinations ──────────────────────────────────────────────────
test.describe('Single-round batched load — filter combinations render elements', () => {
  const applyAndExpectElements = async (page: Page, label: string): Promise<void> => {
    await page.getByTestId('filter-apply').click()
    await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 })
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)
    await expect.poll(async () => (await counts(page)).roster, { timeout: 30_000 }).toBeGreaterThan(0)
  }

  test('Live-1258 — crew filter only', async ({ page, request }) => {
    const cap = newCapture(); await seedGanttAuth(page, request); attachCapture(page, cap)
    await openAndApplyDefault(page, cap); await rosterTimeline(page, 3000)
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-tab-crew').click()
    await selectFirstAvailableOption(page, 'filter-crew-base', 'crew')
    await applyAndExpectElements(page, 'crew filter')
    assertNoShrink(await rosterTimeline(page, 5000), 'crew filter')
  })

  test('Live-1259 — crew + pairing filters together', async ({ page, request }) => {
    const cap = newCapture(); await seedGanttAuth(page, request); attachCapture(page, cap)
    await openAndApplyDefault(page, cap); await rosterTimeline(page, 3000)
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-tab-crew').click()
    await selectFirstAvailableOption(page, 'filter-crew-fleet', 'crew')
    await page.getByTestId('filter-tab-pairing').click()
    await selectFirstAvailableOption(page, 'filter-pairing-fleet', 'pairing')
    await applyAndExpectElements(page, 'crew+pairing filters')
  })

  test('Live-1260 — crew + pairing + flight filters together', async ({ page, request }) => {
    const cap = newCapture(); await seedGanttAuth(page, request); attachCapture(page, cap)
    await openAndApplyDefault(page, cap); await rosterTimeline(page, 3000)
    await addFlightPane(page) // flight pane must be open for its filter to load
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-tab-crew').click()
    await selectFirstAvailableOption(page, 'filter-crew-base', 'crew')
    await page.getByTestId('filter-tab-pairing').click()
    await selectFirstAvailableOption(page, 'filter-pairing-fleet', 'pairing')
    await page.getByTestId('filter-tab-flight').click()
    await selectFirstAvailableOption(page, 'filter-flight-fleet', 'flight')
    await page.getByTestId('filter-apply').click()
    await page.getByTestId('filter-dialog').waitFor({ state: 'hidden', timeout: 10_000 })
    await expect.poll(async () => (await counts(page)).roster, { timeout: 30_000 }).toBeGreaterThan(0)
    await expect.poll(async () => (await counts(page)).pairing, { timeout: 30_000 }).toBeGreaterThan(0)
  })
})

// ── scrolling never shrinks ───────────────────────────────────────────────
test.describe('Single-round batched load — scrolling never shrinks the roster', () => {
  test('Live-1261 — vertical + horizontal scroll keeps roster stable', async ({ page, request }) => {
    const cap = newCapture(); await seedGanttAuth(page, request); attachCapture(page, cap)
    await openAndApplyDefault(page, cap)
    // Wait for the batched load to actually produce rows before sampling the baseline.
    await expect.poll(async () => (await counts(page)).roster, { timeout: 90_000, message: 'roster loaded before scroll' }).toBeGreaterThan(0)
    await rosterTimeline(page, 3000)
    const baseline = (await counts(page)).roster
    expect(baseline, 'roster loaded before scroll').toBeGreaterThan(0)

    const stillAtLeastBaseline = async (where: string): Promise<void> => {
      const n = (await counts(page)).roster
      expect(n, `roster must not shrink after ${where} (${n} < ${baseline})`).toBeGreaterThanOrEqual(baseline)
    }

    await scrollPaneVertically(page, 'roster', 1200); await page.waitForTimeout(400); await stillAtLeastBaseline('scroll down')
    await scrollPaneVertically(page, 'roster', -1200); await page.waitForTimeout(400); await stillAtLeastBaseline('scroll up')
    const setScrollX = (x: number) => page.evaluate((v) => (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(v), x)
    await setScrollX(3000); await page.waitForTimeout(500); await stillAtLeastBaseline('scroll right')
    await setScrollX(0); await page.waitForTimeout(500); await stillAtLeastBaseline('scroll left')
  })
})
