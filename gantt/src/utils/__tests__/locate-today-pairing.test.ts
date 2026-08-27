import { describe, it, expect } from 'vitest'
import { startOfDay } from 'date-fns'
import { findPairingStartingAtDay, type LocateDayItem } from '../locate-today-pairing'

// Helpers: build a minimal item array with predictable local-day buckets.
// All timestamps are interpreted as LOCAL time (date-fns startOfDay uses local tz).
// Tests run in the host's local tz, so we keep arithmetic in local-day terms.
const ONE_DAY_MS = 86_400_000
const baseDay = startOfDay(new Date(2026, 7, 1)).getTime() // 2026-08-01 local midnight

const dayMs = (dayOffset: number): number => baseDay + dayOffset * ONE_DAY_MS

const item = (dayOffset: number, hourOffset: number, minute: number = 0): LocateDayItem => {
  const t = dayMs(dayOffset) + hourOffset * 3_600_000 + minute * 60_000
  return { pairing: { schStrDtUtc: new Date(t).toISOString() } }
}

const itemNull = (): LocateDayItem => ({ pairing: { schStrDtUtc: null } })

describe('findPairingStartingAtDay', () => {
  it('returns -1 for empty items', () => {
    expect(findPairingStartingAtDay([], dayMs(10))).toBe(-1)
  })

  it('skips items with null schStrDtUtc', () => {
    const items: LocateDayItem[] = [itemNull(), itemNull()]
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(-1)
  })

  it('Phase 1: finds pairing on the clicked local day', () => {
    const items = [item(0, 8), item(0, 14)]
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(1) // latest-starting on clicked day
  })

  it('Phase 1: returns the LATEST-starting pairing on the clicked day, not the first-by-index', () => {
    // Sorted ascending by start (typical server order). Clicked day has 3 pairings.
    // User spec wording ("the last pairing of the day") means latest-starting.
    const items = [item(0, 6), item(0, 14), item(0, 22)]
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(2)
  })

  it('Phase 2: walks back day-by-day and returns latest-starting pairing of that day', () => {
    // Click on day 5 (no data). Day 4 has pairings at 06:00 and 18:00.
    const items = [item(4, 6), item(4, 18)]
    expect(findPairingStartingAtDay(items, dayMs(5))).toBe(1) // 18:00 on day 4
  })

  it('Phase 2: walks back multiple days', () => {
    // Click on day 5. Days 0..4 have no data. Day -3 (2 days back) has a pairing.
    const items = [item(-3, 10)]
    expect(findPairingStartingAtDay(items, dayMs(5))).toBe(0)
  })

  it('Phase 3: walks forward when click lands BEFORE all loaded data', () => {
    // Click on day 0. Loaded data starts on day 7. Walking back finds nothing;
    // walking forward should land on day 7's earliest-starting pairing.
    const items = [item(7, 9), item(7, 17), item(8, 8)]
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(0) // 09:00 on day 7
  })

  it('Phase 3: walks forward and picks the EARLIEST on each day (not latest)', () => {
    // Click on day 0. Day 7 has pairings at 09:00, 14:00, 22:00 — should land on 09:00.
    const items = [item(7, 9), item(7, 14), item(7, 22)]
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(0)
  })

  it('Phase 3 has no forward cap (click anywhere before data → land on first day)', () => {
    // Click on day 0. Earliest data is day 31 — the previous 30-day cap would have
    // hidden the menu here; we removed the cap because the canvas scroll range
    // often extends well before the loaded data and the user expects "closest
    // valid day" rather than no menu at all.
    const items = [item(31, 8)]
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(0)
  })

  it('Phase 3 handles click on the day BEFORE the first data day (strict >)', () => {
    // Click on day 6. First data is on day 7 at 22:00. We must land on that — but
    // NOT on a pairing that started at day 6 23:59 (startOfDay equal). Strict >.
    const items = [item(7, 22)]
    expect(findPairingStartingAtDay(items, dayMs(6))).toBe(0)
  })

  it('Phase 3 returns -1 only when no data exists at all', () => {
    // Click anywhere; items is empty.
    expect(findPairingStartingAtDay([], dayMs(0))).toBe(-1)
    // Click far before any data; only a few null schStrDtUtc items.
    const items = [itemNull(), itemNull()]
    expect(findPairingStartingAtDay(items, dayMs(-1000))).toBe(-1)
  })

  it('Phase 3: walks back first when both directions have data (Phase 2 wins)', () => {
    // Click on day 5. Day 4 has data (1 day back) AND day 8 has data (3 days forward).
    // Spec says walk backward first — should return day 4's latest.
    const items = [item(4, 12), item(8, 8)]
    expect(findPairingStartingAtDay(items, dayMs(5))).toBe(0) // day 4 at 12:00
  })

  it('Phase 2 cap: returns -1 when data is >365 days back', () => {
    // Click on day 0. Earliest data is day -400.
    const items = [item(-400, 8)]
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(-1)
  })

  it('Phase 1 takes priority over Phase 2 even when index ordering differs', () => {
    // Pairings not in start-time order (frozen/found rows floated to top per pane).
    // The clicked day still has a pairing that matches, so Phase 1 returns it.
    const items = [item(0, 18), item(0, 6)] // later index, earlier start
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(0) // latest-starting = index 0
  })

  it('Phase 1 handles a non-midnight start time on the clicked day', () => {
    // Click at day 5 local midnight. A pairing starts at 14:00 of day 5.
    // startOfDay(paring.start) === startOfDay(clickedTime) — they share the same local day.
    const items = [item(5, 14)]
    expect(findPairingStartingAtDay(items, dayMs(5))).toBe(0)
  })

  it('returns -1 when no data anywhere within the lookback window', () => {
    const items: LocateDayItem[] = []
    expect(findPairingStartingAtDay(items, dayMs(0))).toBe(-1)
  })
})