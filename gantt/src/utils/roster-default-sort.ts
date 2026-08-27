/**
 * Roster pane DEFAULT ordering (applied as the lowest-priority sort, i.e. the
 * resting order before/under any user-selected sort criteria):
 *   1. By rank table order (`rank.display_order`, exposed as RankOption.displayOrder)
 *   2. Same rank → by crewId ascending (smallest id on top)
 *
 * User-selected sort criteria take priority; these keys are the final tiebreaker,
 * so clearing all criteria returns the roster to this default order.
 */

export interface RankOrderRow {
  crewId: string
  /** Panel rank value; may be a composite like "CA | FO" — the first token is primary. */
  rank: string
  /**
   * Stable sort rank — the crew's effective rank at the window start, independent of the
   * viewport's left date. When set it wins over `rank` so horizontal scroll never re-sorts
   * the roster (a crew's rank shown at the visible date can legitimately change; its
   * position must not).
   */
  sortRank?: string
}

/** Build a `rankCode → displayOrder` lookup from the reference rank list. */
export const buildRankOrderMap = (
  ranks: ReadonlyArray<{ rank: string; displayOrder: number }>,
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const r of ranks) map.set(r.rank, r.displayOrder)
  return map
}

/** Primary rank token from a (possibly composite) panel rank string. */
const primaryRank = (rank: string): string => (rank ?? '').split('|')[0]?.trim() ?? ''

/** Compare two crew ids ascending — numeric when both are numeric, else lexicographic. */
export const compareCrewId = (a: string, b: string): number => {
  const na = Number(a)
  const nb = Number(b)
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a.localeCompare(b)
}

/**
 * Default comparator: rank displayOrder ascending, then rank code ascending (so crews
 * with unknown-but-different rank codes form separate contiguous groups), then crewId.
 * Unknown/empty ranks sort last (MAX_SAFE_INTEGER displayOrder tier).
 */
export const compareRosterDefault = (
  a: RankOrderRow,
  b: RankOrderRow,
  rankOrder: ReadonlyMap<string, number>,
): number => {
  const rankA = primaryRank(a.sortRank ?? a.rank)
  const rankB = primaryRank(b.sortRank ?? b.rank)
  const ra = rankOrder.get(rankA) ?? Number.MAX_SAFE_INTEGER
  const rb = rankOrder.get(rankB) ?? Number.MAX_SAFE_INTEGER
  if (ra !== rb) return ra - rb
  // Within the same display-order tier (including the unknown MAX_SAFE_INTEGER tier),
  // sort by rank code so crews with different unknown rank codes stay grouped.
  const codeCmp = rankA.localeCompare(rankB)
  if (codeCmp !== 0) return codeCmp
  return compareCrewId(a.crewId, b.crewId)
}
