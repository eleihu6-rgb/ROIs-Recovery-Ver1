import { describe, it, expect } from 'vitest'
import { sortByFailFirst, computeStats, instabilityPct, suggestQuarantine } from '../regression-utils'
import type { RegressionTest } from '@/types/regression'

const mk = (over: Partial<RegressionTest>): RegressionTest => ({
  id: 1,
  title: 'x',
  spec_file: 'manual',
  test_name: '',
  category: 'General',
  source: 'User',
  priority: 'Medium',
  description: '',
  last_status: null,
  last_duration_ms: null,
  run_count: 0,
  pass_count: 0,
  fail_count: 0,
  total_duration_ms: 0,
  flakiness_score: 0,
  last_run_at: null,
  recent_results: [],
  instability: 0,
  quarantined: false,
  ...over,
})

describe('sortByFailFirst', () => {
  it('orders by fail_count descending (failure-first, Goal 6)', () => {
    const tests = [
      mk({ id: 1, fail_count: 0 }),
      mk({ id: 2, fail_count: 5 }),
      mk({ id: 3, fail_count: 2 }),
    ]
    expect(sortByFailFirst(tests).map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('breaks fail_count ties by run_count desc, then id asc', () => {
    const tests = [
      mk({ id: 10, fail_count: 3, run_count: 1 }),
      mk({ id: 11, fail_count: 3, run_count: 9 }),
      mk({ id: 9, fail_count: 3, run_count: 9 }),
    ]
    // run_count 9 group first (id 9 before 11), then run_count 1.
    expect(sortByFailFirst(tests).map((t) => t.id)).toEqual([9, 11, 10])
  })

  it('does not mutate the input array', () => {
    const tests = [mk({ id: 1, fail_count: 0 }), mk({ id: 2, fail_count: 9 })]
    const copy = [...tests]
    sortByFailFirst(tests)
    expect(tests).toEqual(copy)
  })
})

describe('computeStats', () => {
  it('counts total, pass, fail, and user-added', () => {
    const tests = [
      mk({ id: 1, last_status: 'pass', source: 'AI' }),
      mk({ id: 2, last_status: 'fail', source: 'User' }),
      mk({ id: 3, last_status: null, source: 'User' }),
    ]
    expect(computeStats(tests)).toEqual({ total: 3, pass: 1, fail: 1, user: 2 })
  })

  it('returns zeros for an empty list', () => {
    expect(computeStats([])).toEqual({ total: 0, pass: 0, fail: 0, user: 0 })
  })
})

const base: RegressionTest = {
  id: 1, title: 't', spec_file: 'a.spec.ts', test_name: 't', category: 'Smoke',
  source: 'User', priority: 'High', description: '', last_status: null,
  last_duration_ms: null, last_run_at: null, run_count: 0, pass_count: 0, fail_count: 0,
  total_duration_ms: 0, flakiness_score: 0, recent_results: [], instability: 0, quarantined: false,
}

describe('instabilityPct', () => {
  it('rounds instability to a whole percent', () => {
    expect(instabilityPct({ ...base, instability: 0.333 })).toBe(33)
    expect(instabilityPct({ ...base, instability: 0 })).toBe(0)
  })
})

describe('suggestQuarantine', () => {
  it('suggests when unstable with ≥5 runs and not quarantined', () => {
    const t = { ...base, instability: 0.4, recent_results: ['pass', 'fail', 'pass', 'fail', 'pass'] as const }
    expect(suggestQuarantine({ ...t, recent_results: [...t.recent_results] })).toBe(true)
  })
  it('does not suggest below threshold, with <5 runs, or when quarantined', () => {
    expect(suggestQuarantine({ ...base, instability: 0.1, recent_results: ['pass', 'fail', 'pass', 'fail', 'pass'] })).toBe(false)
    expect(suggestQuarantine({ ...base, instability: 0.9, recent_results: ['pass', 'fail'] })).toBe(false)
    expect(suggestQuarantine({ ...base, instability: 0.9, recent_results: ['pass', 'fail', 'pass', 'fail', 'pass'], quarantined: true })).toBe(false)
  })
})
