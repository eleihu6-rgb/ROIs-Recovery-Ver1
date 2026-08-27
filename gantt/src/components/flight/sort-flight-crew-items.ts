import type { FlightCrewItem } from '@/types'
import { COMPOSITION_CARD_RANK_ORDER } from './sort-composition-card-ranks'

const RANK_ORDER = new Map<string, number>(
  COMPOSITION_CARD_RANK_ORDER.map((r, i) => [r, i]),
)

/** Seniority tiebreak: lower seniorityNum = more senior; unknown (null) last. */
const compareSeniority = (a: string | null, b: string | null): number => {
  const an = a !== null ? Number(a) : Number.POSITIVE_INFINITY
  const bn = b !== null ? Number(b) : Number.POSITIVE_INFINITY
  if (!Number.isFinite(an)) return Number.isFinite(bn) ? 1 : 0
  if (!Number.isFinite(bn)) return -1
  if (an !== bn) return an - bn
  return a!.localeCompare(b!)
}

/**
 * Sort Crew Assignment rows: acting rank in CA → FO → IFD → FA order (unknown
 * ranks last), then by seniority (seniorityNum ascending) within the same rank.
 */
export const sortFlightCrewItems = (items: FlightCrewItem[]): FlightCrewItem[] =>
  [...items].sort((a, b) => {
    const rankA = RANK_ORDER.get(a.actingRank)
    const rankB = RANK_ORDER.get(b.actingRank)
    if (rankA === undefined && rankB === undefined) return compareSeniority(a.seniorityNum, b.seniorityNum)
    if (rankA === undefined) return 1
    if (rankB === undefined) return -1
    if (rankA !== rankB) return rankA - rankB
    return compareSeniority(a.seniorityNum, b.seniorityNum)
  })
