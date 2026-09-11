// gantt/src/utils/base-timezone.ts
//
// Resolve the airline's base timezone from the timezone store. Used by
// operations that must align to the airline's operational day rather than
// the user's currently-selected display timezone (e.g. the Scroll-to-day
// pairing menu, which buckets pairings by their base-tz civil date so
// pairings delayed across an airport's local-midnight still group with
// their actual operational day).
//
// If multiple bases are configured (rare — F8 typically has one), this
// returns the first. The result is used as a fallback when no base is
// configured: we fall back to the user's selected display timezone rather
// than throwing, so a misconfigured store degrades to "least surprising"
// behaviour rather than a blank screen.

import type { TzOption } from '@/stores/timezone-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { reanchorDateRange } from '@/utils/date-range-anchor'

/** Pick the first option marked as a base airport. */
export const findBaseTimezone = (
  options: ReadonlyArray<TzOption>,
): TzOption | undefined => options.find((o) => o.isBase)

/**
 * Resolve the IANA zone id to use as the operational-day base.
 * Order of preference:
 *   1. The first option with `isBase: true` (airline base).
 *   2. The currently-selected display timezone (the user's last choice).
 *   3. 'UTC' (the store default).
 *
 * Returns null only when `options` is empty AND `selectedZoneId` is empty.
 */
export const resolveBaseTimezone = (
  options: ReadonlyArray<TzOption>,
  selectedZoneId: string,
): string | null => {
  const base = findBaseTimezone(options)
  if (base) return base.zoneId
  if (selectedZoneId) return selectedZoneId
  return null
}

/**
 * Auto-sync the display timezone from the crew filter's base selection.
 *
 * Rule (per spec): "进入 Gantt，如用户选择 Base 过滤数据，自动按照选择列表中
 * 第一个 Base 时区显示数据，否则默认 UTC。"
 *
 *   - If `bases` is non-empty, look up the FIRST base in the loaded
 *     timezone options and switch the display to its IANA zone (keeping
 *     the date range anchored to the same calendar days).
 *   - If `bases` is empty, default the display to UTC.
 *
 * No-op when the resolved timezone already matches the current display.
 * The base→timezone map is keyed on the option's `airport` (which is the
 * 3-letter IATA code that the crew filter stores in `crew.bases[]`).
 */
export const syncDisplayTimezoneForBases = (bases: ReadonlyArray<string>): void => {
  const tzStore = useTimezoneStore.getState()
  const options = tzStore.timezoneOptions

  if (bases.length === 0) {
    if (tzStore.timezone !== 'UTC' || tzStore.timezoneAirport !== 'UTC') {
      reanchorDateRange(tzStore.timezone, 'UTC')
      tzStore.setTimezone('UTC', 'UTC')
    }
    return
  }

  const first = bases[0]
  const match = options.find((o) => o.airport === first)
  if (!match) return
  if (tzStore.timezone === match.zoneId && tzStore.timezoneAirport === match.airport) return
  reanchorDateRange(tzStore.timezone, match.zoneId)
  tzStore.setTimezone(match.zoneId, match.airport)
}
