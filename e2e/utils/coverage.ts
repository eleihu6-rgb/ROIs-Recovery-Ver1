/**
 * Test-side mirror of the app's pairing coverage classifier
 * (gantt/src/utils/pairing-coverage.ts → classifyCoverage).
 *
 * 4-state, shortage-wins precedence: empty → full; total fill 0 → open;
 * any slot short → partial; no shortage + any surplus → over; else full.
 * Keep in sync with the app classifier and its live-server mirror.
 */
export type Coverage = 'open' | 'partial' | 'full' | 'over'

export const coverageOf = (p: { composition?: { plan?: number; fill?: number }[] }): Coverage => {
  const comp = p.composition ?? []
  if (comp.length === 0) return 'full'
  let totalFill = 0
  let anyShort = false
  let anyOver = false
  for (const c of comp) {
    const plan = c.plan ?? 0
    const fill = c.fill ?? 0
    totalFill += fill
    if (fill < plan) anyShort = true
    if (fill > plan) anyOver = true
  }
  if (totalFill === 0) return 'open'
  if (anyShort) return 'partial'
  if (anyOver) return 'over'
  return 'full'
}
