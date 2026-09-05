import { describe, it, expect } from 'vitest'
import { findPairingStartingAtDay, type LocateDayItem } from '../locate-today-pairing'

// All tests use UTC for the algorithm's tz parameter — the algorithm is
// pure with respect to tz, and UTC avoids any host-local ambiguity in the
// test scaffolding itself (date-fns startOfDay uses the host OS tz, which
// has caused cross-host flakes in earlier rounds).

const TZ = 'UTC'
// Reference: 2026-08-04T00:00:00Z = local midnight at the start of "the clicked day".
const baseDayUtcMs = Date.UTC(2026, 7, 4)
const dayMs = (dayOffset: number): Date => new Date(baseDayUtcMs + dayOffset * 86_400_000)

const item = (dayOffset: number, hourOffset: number, minute: number = 0): LocateDayItem => {
  const ms = baseDayUtcMs + dayOffset * 86_400_000 + hourOffset * 3_600_000 + minute * 60_000
  return { pairing: { actStrDtUtc: new Date(ms).toISOString() } }
}

const itemNull = (): LocateDayItem => ({ pairing: { actStrDtUtc: null } } )

describe('findPairingStartingAtDay', () => {
  it('returns -1 for empty items', () => {
    expect(findPairingStartingAtDay([], dayMs(10), TZ)).toBe(-1)
  })

  it('skips items with null actStrDtUtc', () => {
    const items: LocateDayItem[] = [itemNull(), itemNull()]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(-1)
  })

  it('Phase 1: finds the FIRST pairing on the clicked UTC day', () => {
    const items = [item(0, 8), item(0, 14)]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(0) // earliest-starting on clicked day
  })

  it('Phase 1: returns the EARLIEST-starting pairing on the clicked day, not the first-by-index', () => {
    // Sorted ascending by start (typical server order). Clicked day has 3 pairings;
    // user wants the FIRST one (chronologically earliest), not the latest.
    const items = [item(0, 6), item(0, 14), item(0, 22)]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(0)
  })

  it('Phase 2: walks back day-by-day and returns earliest-starting pairing of that day', () => {
    // Click on day 5 (no data). Day 4 has pairings at 06:00 and 18:00 — first is 06:00.
    const items = [item(4, 6), item(4, 18)]
    expect(findPairingStartingAtDay(items, dayMs(5), TZ)).toBe(0) // 06:00 on day 4
  })

  it('Phase 2: walks back multiple days', () => {
    // Click on day 5. Days 0..4 have no data. Day -3 (3 days back) has a pairing.
    const items = [item(-3, 10)]
    expect(findPairingStartingAtDay(items, dayMs(5), TZ)).toBe(0)
  })

  it('Phase 3: walks forward when click lands BEFORE all loaded data', () => {
    // Click on day 0. Loaded data starts on day 7. Walking back finds nothing;
    // walking forward should land on day 7's earliest-starting pairing.
    const items = [item(7, 9), item(7, 17), item(8, 8)]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(0) // 09:00 on day 7
  })

  it('Phase 3: walks forward and picks the EARLIEST on each day (not latest)', () => {
    // Click on day 0. Day 7 has pairings at 09:00, 14:00, 22:00 — should land on 09:00.
    const items = [item(7, 9), item(7, 14), item(7, 22)]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(0)
  })

  it('Phase 3 has no forward cap (click anywhere before data → land on first day)', () => {
    // Click on day 0. Earliest data is day 31 — the previous 30-day cap would have
    // hidden the menu here; we removed the cap because the canvas scroll range
    // often extends well before the loaded data and the user expects "closest
    // valid day" rather than no menu at all.
    const items = [item(31, 8)]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(0)
  })

  it('Phase 3 handles click on the day BEFORE the first data day (strict >)', () => {
    // Click on day 6. First data is on day 7 at 22:00. We must land on that — but
    // NOT on a pairing that started at day 6 23:59 (same day bucket). Strict >.
    const items = [item(7, 22)]
    expect(findPairingStartingAtDay(items, dayMs(6), TZ)).toBe(0)
  })

  it('Phase 3 returns -1 only when no data exists at all', () => {
    expect(findPairingStartingAtDay([], dayMs(0), TZ)).toBe(-1)
    const items = [itemNull(), itemNull()]
    expect(findPairingStartingAtDay(items, dayMs(-1000), TZ)).toBe(-1)
  })

  it('Phase 3: walks back first when both directions have data (Phase 2 wins)', () => {
    // Click on day 5. Day 4 has data (1 day back) AND day 8 has data (3 days forward).
    // Spec says walk backward first — should return day 4's earliest.
    const items = [item(4, 12), item(8, 8)]
    expect(findPairingStartingAtDay(items, dayMs(5), TZ)).toBe(0) // day 4 at 12:00
  })

  it('Phase 2 cap: returns -1 when data is >365 days back', () => {
    const items = [item(-400, 8)]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(-1)
  })

  it('Phase 1 takes priority over Phase 2 even when index ordering differs', () => {
    // Pairings not in start-time order (frozen/found rows floated to top per pane).
    // The clicked day still has a pairing that matches, so Phase 1 returns it.
    // EARLIEST semantics: the 06:00 pairing is earlier than the 18:00 pair, so
    // we land on index 1 (the 06:00 one).
    const items = [item(0, 18), item(0, 6)]
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(1) // earliest-starting = index 1
  })

  it('Phase 1 handles a non-midnight start time on the clicked day', () => {
    // Click at day 5 local midnight (UTC). A pairing starts at 14:00 of day 5.
    // They share the same UTC day bucket.
    const items = [item(5, 14)]
    expect(findPairingStartingAtDay(items, dayMs(5), TZ)).toBe(0)
  })

  it('returns -1 when no data anywhere within the lookback window', () => {
    const items: LocateDayItem[] = []
    expect(findPairingStartingAtDay(items, dayMs(0), TZ)).toBe(-1)
  })

  it('uses actStrDtUtc (not schStrDtUtc) for the day bucket — delayed pairing lands on actual day', () => {
    // The item exposes actStrDtUtc only (matches the PairingItem.pairing.actStrDtUtc
    // field — schStrDtUtc is intentionally not consulted). A pairing scheduled
    // for day 0 but actually started on day 1 must land on day 1.
    const delayed = [item(1, 8)]
    // Click on day 1 → should find the delayed pairing on day 1.
    expect(findPairingStartingAtDay(delayed, dayMs(1), TZ)).toBe(0)
    // Click on day 0 → Phase 1 returns -1 (no pairings on day 0); Phase 2 walks
    // back from day 0 (nothing there either); Phase 3 forward-scan to day 1
    // finds it.
    expect(findPairingStartingAtDay(delayed, dayMs(0), TZ)).toBe(0)
  })

  it('evaluates the day bucket in the supplied tz (Asia/Shanghai: UTC midnight = local 08:00)', () => {
    // At Asia/Shanghai (UTC+8), UTC 2026-08-04 17:00 is local 2026-08-05 01:00.
    // Local civil date is 2026-08-05. A pairing at UTC 2026-08-05 01:00 also
    // has local date 2026-08-05. They share the Shanghai-day bucket.
    //
    // Verify with two items on consecutive Shanghai days, plus a click time
    // that lands inside the Shanghai "second" day even though the UTC date
    // hasn't rolled over:
    const clickMs = Date.UTC(2026, 7, 4, 17, 0) // Aug 4 17:00 UTC = Aug 5 01:00 Shanghai
    const items = [
      { pairing: { actStrDtUtc: new Date(Date.UTC(2026, 7, 4, 10, 0)).toISOString() } }, // Aug 4 18:00 Shanghai
      { pairing: { actStrDtUtc: new Date(Date.UTC(2026, 7, 5, 1, 0)).toISOString() } },  // Aug 5 09:00 Shanghai
    ]
    // Click lands on Shanghai Aug 5 → returns the Aug 5 item (index 1).
    expect(findPairingStartingAtDay(items, new Date(clickMs), 'Asia/Shanghai')).toBe(1)
  })
})
