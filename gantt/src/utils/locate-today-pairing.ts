// gantt/src/utils/locate-today-pairing.ts
//
// "Scroll to <Aug 04> pairings" — pure helper used by the pairing-pane right-click menu
// in both Live and Scenario Gantt (§Gantt-Unify).
//
// Day bucket semantics (refined after SIT feedback):
//   * The "day" of a pairing is the calendar date of its `actStrDtUtc` (actual
//     start, not scheduled — delayed pairings land on their actual day) AS SEEN
//     in the airline's base timezone. This matches how the Gantt groups
//     pairings into a "roster day" in the toolbar's base-tz view, regardless
//     of the host machine's local timezone or the user's currently-selected
//     display timezone. The base tz is read from `useTimezoneStore` (option
//     with `isBase: true`); if none is configured we fall back to the
//     currently-selected display timezone so behaviour degrades gracefully.
//
//   * Phase 1 returns the EARLIEST-starting pairing on that base-tz day.
//     Earlier rounds returned latest-starting (per the original spec wording
//     "last pairing of the day"); SIT feedback showed users want the FIRST
//     pairing so they can quickly scan down through the day's roster from
//     the top.
//
//   * Phase 2 walks back day-by-day up to 365 days; on each previous
//     base-tz day it returns the EARLIEST-starting pairing of that day.
//
//   * Phase 3 (defensive forward scan) — if the click landed in an empty
//     zone BEFORE the loaded data and the 365-day backwalk found nothing,
//     scan once for the EARLIEST-starting pairing whose base-tz day is
//     STRICTLY after the clicked day. No cap: the canvas scroll range often
//     extends well before the loaded data, and the user expects "closest
//     valid day" rather than a hidden menu.
//
//   * If nothing matches within those bounds, return -1 — the click becomes
//     a no-op; the user is told nothing because vertical-only scroll cannot
//     move past the loaded range (see §First-Paint: do not load additional
//     data on this gesture).
//
// All day-bucket math goes through `calendarDateInTimeZone` +
// `calendarDateToUtcMidnight` (DST-aware, IANA-based) so the host OS's local
// timezone never leaks into the bucket key. Earlier rounds used
// `date-fns startOfDay`, which is host-local — that silently routed users
// whose host tz differed from the base tz to the wrong pairing row.

import {
  calendarDateInTimeZone,
  calendarDateToUtcMidnight,
  parseIsoCached,
} from '@/components/gantt/gantt-utils'

export interface LocateDayItem {
  pairing: { actStrDtUtc: string | null }
}

/** Bucket key (UTC ms) for the calendar day of `utcTime` AS SEEN IN `tz`.
 *  Two UTC instants land in the same bucket iff they share the same YYYY-MM-DD
 *  in `tz`. Stable across DST transitions (midnight never shifts; offset
 *  computed at noon of the candidate date). */
const dayBucketInTz = (utcTime: Date, tz: string): number => {
  const dateStr = calendarDateInTimeZone(utcTime, tz)
  return calendarDateToUtcMidnight(dateStr, tz).getTime()
}

/** Walk `items` once and return the index of the pairing with the earliest
 *  `actStrDtUtc` whose base-tz day equals `dayStartMs`, or -1 if none. */
const findEarliestOnDay = (
  items: ReadonlyArray<LocateDayItem>,
  dayStartMs: number,
  tz: string,
): number => {
  let bestIdx = -1
  let bestStartMs = Infinity
  for (let i = 0; i < items.length; i++) {
    const iso = items[i].pairing.actStrDtUtc
    if (!iso) continue
    const d = parseIsoCached(iso)
    if (dayBucketInTz(d, tz) !== dayStartMs) continue
    const startMs = d.getTime()
    if (startMs < bestStartMs) {
      bestStartMs = startMs
      bestIdx = i
    }
  }
  return bestIdx
}

/** Walk `items` once and return the index of the pairing with the earliest
 *  `actStrDtUtc` whose base-tz day is STRICTLY AFTER `dayStartMs`, or -1 if
 *  none. Used by Phase 3 to land on the first day with data when the click
 *  is in a pre-data empty zone. */
const findEarliestAfterDay = (
  items: ReadonlyArray<LocateDayItem>,
  dayStartMs: number,
  tz: string,
): number => {
  let bestIdx = -1
  let bestStartMs = Infinity
  for (let i = 0; i < items.length; i++) {
    const iso = items[i].pairing.actStrDtUtc
    if (!iso) continue
    const d = parseIsoCached(iso)
    if (dayBucketInTz(d, tz) <= dayStartMs) continue
    const startMs = d.getTime()
    if (startMs < bestStartMs) {
      bestStartMs = startMs
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Find the index in `items` that matches the right-clicked base-tz day.
 *
 * @param items - Pairing rows currently rendered in the pairing pane
 *   (post-filter, post-sort, post-found-float). Each item must expose
 *   `pairing.actStrDtUtc` (actual start, ISO UTC).
 * @param clickedTime - UTC instant of the right-click (e.g. the Date returned
 *   by `xToTime(canvasX + scrollX, rangeStart, pxPerHour)`).
 * @param tz - IANA timezone in which the calendar day is evaluated (the
 *   airline's base timezone; falls back to the display timezone if no base
 *   is configured).
 * @returns the index in `items` to scroll to, or -1 when the loaded set
 *   contains no pairings (forward scan finds nothing strictly after the
 *   clicked day either).
 */
export const findPairingStartingAtDay = (
  items: ReadonlyArray<LocateDayItem>,
  clickedTime: Date,
  tz: string,
): number => {
  if (items.length === 0) return -1

  const targetDayMs = dayBucketInTz(clickedTime, tz)

  // Phase 1: earliest-starting pairing on the clicked base-tz day.
  const sameDay = findEarliestOnDay(items, targetDayMs, tz)
  if (sameDay >= 0) return sameDay

  // Phase 2: walk back day-by-day (cap 365 — covers a year of lookback).
  const ONE_DAY_MS = 86_400_000
  for (let dayOffset = 1; dayOffset <= 365; dayOffset++) {
    const priorDayMs = targetDayMs - dayOffset * ONE_DAY_MS
    const idx = findEarliestOnDay(items, priorDayMs, tz)
    if (idx >= 0) return idx
  }

  // Phase 3 (defensive forward scan): if the click landed in an empty zone
  // BEFORE the loaded data, Phase 2 walks back into empty territory and finds
  // nothing. Scan once for the EARLIEST-starting pairing whose base-tz day is
  // STRICTLY after the clicked day. No cap: the canvas scroll range often
  // extends well before the loaded data, and the user expects "closest valid
  // day" rather than a hidden menu.
  const forwardIdx = findEarliestAfterDay(items, targetDayMs, tz)
  if (forwardIdx >= 0) return forwardIdx

  return -1
}
