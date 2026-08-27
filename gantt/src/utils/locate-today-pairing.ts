// gantt/src/utils/locate-today-pairing.ts
//
// "Jump to this day's pairing" — pure helper used by the pairing-pane right-click menu
// in both Live and Scenario Gantt (§Gantt-Unify).
//
// Behavior (per product spec, with a defensive forward walk for empty zones):
//   1. Phase 1: find the LATEST-starting pairing whose LOCAL-day equals the right-clicked
//      day. If multiple pairings start on the same local day, prefer the one that starts
//      latest (consistent with the "last pairing of the day" semantics the user wants).
//   2. Phase 2: walk back day-by-day up to 365 days; on each previous day, return the
//      pairing with the latest `schStrDtUtc` on that local day. This matches the
//      spec's "previous day's last pairing, and so on" wording.
//   3. Phase 3 (defensive): if the click landed in an empty zone BEFORE the loaded
//      data, Phase 2 walks back into empty territory and finds nothing. Scan once
//      for the EARLIEST-starting pairing whose local day is STRICTLY after the
//      clicked day — i.e. land on the first day in the loaded set that has any
//      pairing. No cap: the canvas scroll range often extends well before the
//      loaded data, and the user expects "closest valid day" rather than a hidden
//      menu.
//   4. If nothing matches within those bounds, return -1 (the menu click becomes a no-op;
//      the user is told nothing because vertical-only scroll cannot move past the loaded
//      range — see §First-Paint: do not load additional data on this gesture).
//
// "Local" here means the host process's timezone — matching `drawTodayHighlight`
// (`gantt-renderer.ts:91-104`). Cross-tz pairings where a flight sits near the local
// midnight boundary will fall into one bucket or the other consistently with how the
// today column is drawn, so the user sees the same "current day" on screen as the menu
// uses to match.

import { startOfDay } from 'date-fns'
import { parseIsoCached } from '@/components/gantt/gantt-utils'

export interface LocateDayItem {
  pairing: { schStrDtUtc: string | null }
}

/** Walk `items` once and return the index of the pairing with the latest `schStrDtUtc`
 *  whose `startOfDay` equals `dayStartMs`, or -1 if none. */
const findLatestOnDay = (
  items: ReadonlyArray<LocateDayItem>,
  dayStartMs: number,
): number => {
  let bestIdx = -1
  let bestStartMs = -Infinity
  for (let i = 0; i < items.length; i++) {
    const iso = items[i].pairing.schStrDtUtc
    if (!iso) continue
    const d = parseIsoCached(iso)
    if (startOfDay(d).getTime() !== dayStartMs) continue
    const startMs = d.getTime()
    if (startMs > bestStartMs) {
      bestStartMs = startMs
      bestIdx = i
    }
  }
  return bestIdx
}

/** Walk `items` once and return the index of the pairing with the earliest `schStrDtUtc`
 *  whose `startOfDay` equals `dayStartMs`, or -1 if none. */
const findEarliestOnDay = (
  items: ReadonlyArray<LocateDayItem>,
  dayStartMs: number,
): number => {
  let bestIdx = -1
  let bestStartMs = Infinity
  for (let i = 0; i < items.length; i++) {
    const iso = items[i].pairing.schStrDtUtc
    if (!iso) continue
    const d = parseIsoCached(iso)
    if (startOfDay(d).getTime() !== dayStartMs) continue
    const startMs = d.getTime()
    if (startMs < bestStartMs) {
      bestStartMs = startMs
      bestIdx = i
    }
  }
  return bestIdx
}

/** Walk `items` once and return the index of the pairing with the earliest `schStrDtUtc`
 *  whose `startOfDay` is STRICTLY AFTER `dayStartMs`, or -1 if none. Used by Phase 3
 *  to land on the first day with data when the click is in a pre-data empty zone. */
const findEarliestAfterDay = (
  items: ReadonlyArray<LocateDayItem>,
  dayStartMs: number,
): number => {
  let bestIdx = -1
  let bestStartMs = Infinity
  for (let i = 0; i < items.length; i++) {
    const iso = items[i].pairing.schStrDtUtc
    if (!iso) continue
    const d = parseIsoCached(iso)
    if (startOfDay(d).getTime() <= dayStartMs) continue
    const startMs = d.getTime()
    if (startMs < bestStartMs) {
      bestStartMs = startMs
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Find the index in `items` that matches the right-clicked local day per the algorithm above.
 *
 * @param items - Pairing rows currently rendered in the pairing pane (post-filter, post-sort).
 * @param targetDayMs - Local-midnight epoch-ms of the right-clicked day, as produced by
 *   `startOfDay(xToTime(canvasX + scrollX, rangeStart, pxPerHour))`.
 * @returns the index in `items` to scroll to, or -1 when the loaded set contains
 *   no pairings (forward scan finds nothing strictly after the clicked day either).
 */
export const findPairingStartingAtDay = (
  items: ReadonlyArray<LocateDayItem>,
  targetDayMs: number,
): number => {
  if (items.length === 0) return -1

  // Phase 1: latest-starting pairing on the clicked local day.
  const sameDay = findLatestOnDay(items, targetDayMs)
  if (sameDay >= 0) return sameDay

  // Phase 2: walk back day-by-day (cap 365 — covers a year of lookback).
  const ONE_DAY_MS = 86_400_000
  for (let dayOffset = 1; dayOffset <= 365; dayOffset++) {
    const dayStart = targetDayMs - dayOffset * ONE_DAY_MS
    const idx = findLatestOnDay(items, dayStart)
    if (idx >= 0) return idx
  }

  // Phase 3 (defensive forward scan): if the click landed in an empty zone BEFORE
  // the loaded data, Phase 2 walks back into empty territory and finds nothing.
  // Scan once for the EARLIEST-starting pairing whose local day is STRICTLY after
  // the clicked day — i.e. land on the first day in the loaded set that has any
  // pairing. No cap: the canvas scroll range often extends well before the loaded
  // data, and the user expects "closest valid day" rather than a hidden menu.
  const forwardIdx = findEarliestAfterDay(items, targetDayMs)
  if (forwardIdx >= 0) return forwardIdx

  return -1
}