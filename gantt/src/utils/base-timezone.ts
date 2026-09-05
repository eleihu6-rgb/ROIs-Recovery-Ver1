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
