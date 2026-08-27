import type { RosterPeriodOption } from '@/services/roster-period-api'

/**
 * Keep a multi-RP selection within `maxSpan` consecutive roster periods.
 *
 * - Span (max-min+1) ≤ maxSpan → unchanged, sorted ascending (gaps allowed).
 * - Span > maxSpan on an ADD → remove every selected RP outside the closest
 *   maxSpan-sized window containing the newly-clicked RP. This removes the whole
 *   out-of-range tail in one change instead of requiring repeated clicks.
 *   A pure removal never rebuilds (span only shrinks).
 */
export function applyMaxSpan(
  nextIds: readonly string[],
  prevIds: readonly string[],
  items: readonly RosterPeriodOption[],
  maxSpan: number,
): string[] {
  const order = new Map(items.map((rp, i) => [String(rp.id), i]))

  const sorted = [...nextIds]
    .map((id) => ({ id, idx: order.get(id) }))
    .filter((x): x is { id: string; idx: number } => x.idx !== undefined)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.id)
  if (sorted.length === 0) return sorted

  const minIdx = order.get(sorted[0]) ?? 0
  const maxIdx = order.get(sorted[sorted.length - 1]) ?? 0
  if (maxIdx - minIdx + 1 <= maxSpan) return sorted

  // Only an ADD can push the span past the limit; a removal only shrinks it.
  const added = nextIds.find((id) => !prevIds.includes(id))
  if (added === undefined) return sorted
  const anchor = order.get(added)
  if (anchor === undefined) return sorted

  // Keep the newly-clicked RP and the closest maxSpan-sized side of the
  // selection. An older add drops every newer RP outside its window; a newer
  // add does the symmetric operation. Ties preserve the historical behavior
  // of keeping the older side.
  if (Math.abs(anchor - minIdx) <= Math.abs(maxIdx - anchor)) {
    const upperBound = anchor + maxSpan - 1
    return sorted.filter((id) => (order.get(id) ?? 0) <= upperBound)
  }
  const lowerBound = anchor - maxSpan + 1
  return sorted.filter((id) => (order.get(id) ?? 0) >= lowerBound)
}
