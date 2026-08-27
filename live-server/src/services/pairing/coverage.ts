/**
 * Pairing crewing-coverage classifier — MIRROR of
 * gantt/src/utils/pairing-coverage.ts. live-server is a separate package and
 * cannot import the gantt copy; keep both (and their test tables) in sync.
 * Precedence: shortage wins (over requires no shortage + at least one surplus).
 * Optional `ranks` scopes classification to those composition slots only.
 */
export type CoverageState = 'open' | 'partial' | 'full' | 'over'

export interface CoverageSlot {
  plan: number
  fill: number
  rank?: string | null
}

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

export const isCoverageMet = (comp: CoverageSlot[], ranks?: string[]): boolean => {
  const state = classifyCoverage(comp, ranks)
  return state === 'full' || state === 'over'
}
