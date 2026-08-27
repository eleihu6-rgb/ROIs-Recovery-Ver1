export type CompositionCardCoverage = 'full' | 'partial' | 'empty'

/**
 * Per-rank Flight Composition card background class.
 * null → keep default gray (no plan slots).
 */
export const deriveCompositionCardCoverage = (
  actual: number,
  plan: number,
): CompositionCardCoverage | null => {
  if (plan <= 0) return null
  if (actual <= 0) return 'empty'
  if (actual < plan) return 'partial'
  return 'full'
}
