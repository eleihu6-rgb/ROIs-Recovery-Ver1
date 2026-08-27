import type { RegressionTest } from '@/types/regression'

/**
 * Failure-first ordering (Goal 6): historically-failing tests carry the most
 * signal, so sort by fail_count desc. Ties break by run_count desc (more-run =
 * better evidence) then id asc for stable output. Pure + side-effect free so it
 * is unit-testable.
 */
export const sortByFailFirst = (tests: readonly RegressionTest[]): RegressionTest[] =>
  [...tests].sort((a, b) => {
    if (b.fail_count !== a.fail_count) return b.fail_count - a.fail_count
    if (b.run_count !== a.run_count) return b.run_count - a.run_count
    return a.id - b.id
  })

export interface RegressionStats {
  total: number
  pass: number
  fail: number
  user: number
}

/** Dashboard counts derived from last_status + source. Pure. */
export const computeStats = (tests: readonly RegressionTest[]): RegressionStats => ({
  total: tests.length,
  pass: tests.filter((t) => t.last_status === 'pass').length,
  fail: tests.filter((t) => t.last_status === 'fail').length,
  user: tests.filter((t) => t.source === 'User').length,
})

/** Mirror of ai-server flakiness.py thresholds (spec §4). */
const QUARANTINE_THRESHOLD = 0.3
const MIN_RUNS_FOR_SUGGESTION = 5

export const instabilityPct = (t: RegressionTest): number => Math.round(t.instability * 100)

export const suggestQuarantine = (t: RegressionTest): boolean =>
  !t.quarantined &&
  t.recent_results.length >= MIN_RUNS_FOR_SUGGESTION &&
  t.instability >= QUARANTINE_THRESHOLD
