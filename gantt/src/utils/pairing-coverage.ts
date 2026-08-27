// gantt/src/utils/pairing-coverage.ts
/**
 * Canonical pairing crewing-coverage classifier (single source of truth).
 *
 * States (mutually exclusive, exactly one per pairing):
 *  - full    : no composition requirement, OR every slot fill === plan
 *  - open    : has requirement(s) but total fill === 0 (nobody assigned)
 *  - partial : at least one slot is short (fill < plan)        ← shortage wins
 *  - over    : no slot short AND at least one slot over (fill > plan)
 *
 * Precedence is shortage-wins: a pairing over-staffed on one rank but short on
 * another classifies as `partial` — a row that still needs crew never hides
 * under `over`.
 *
 * When `ranks` is non-empty, classification uses only composition slots whose
 * `rank` is in that set (rank-scoped coverage). Empty selected-rank slots → full.
 *
 * MIRROR: live-server/src/services/pairing/coverage.ts keeps an identical
 * copy (separate package, cannot import). Keep both and their test tables in sync.
 */
export type CoverageState = 'open' | 'partial' | 'full' | 'over'

export const ALL_COVERAGE: CoverageState[] = ['open', 'partial', 'full', 'over']

export interface CoverageSlot {
  plan: number
  fill: number
  rank?: string | null
}

/** Slots whose rank is in `ranks`. Empty `ranks` → return all slots unchanged. */
export const slotsForRanks = (comp: CoverageSlot[], ranks: string[]): CoverageSlot[] =>
  ranks.length === 0 ? comp : comp.filter((s) => ranks.includes(s.rank ?? ''))

export const classifyCoverage = (comp: CoverageSlot[], ranks?: string[]): CoverageState => {
  const slots = ranks?.length ? slotsForRanks(comp, ranks) : comp
  if (slots.length === 0) return 'full'
  let totalFill = 0
  let anyShort = false
  let anyOver = false
  for (const s of slots) {
    const plan = s.plan ?? 0
    const fill = s.fill ?? 0
    totalFill += fill
    if (fill < plan) anyShort = true
    if (fill > plan) anyOver = true
  }
  if (totalFill === 0) return 'open'
  if (anyShort) return 'partial'
  if (anyOver) return 'over'
  return 'full'
}

/** "All needs met" predicate for the left-edge border: full or over (no shortage). */
export const isCoverageMet = (comp: CoverageSlot[], ranks?: string[]): boolean => {
  const state = classifyCoverage(comp, ranks)
  return state === 'full' || state === 'over'
}

/** Coverage is "narrowed" when a strict, non-empty subset of all states is selected. */
export const coverageNarrowed = (coverage: CoverageState[]): boolean =>
  coverage.length > 0 && coverage.length < ALL_COVERAGE.length

/** Hard-filter predicate: keep a pairing when coverage is not narrowed, or its
 *  classified coverage is in the selection. Optional `ranks` scopes classification. */
export const coverageMatches = (
  coverage: CoverageState[],
  composition: CoverageSlot[],
  ranks?: string[],
): boolean => !coverageNarrowed(coverage) || coverage.includes(classifyCoverage(composition, ranks))
