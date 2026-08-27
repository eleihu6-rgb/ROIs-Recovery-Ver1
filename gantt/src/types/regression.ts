/**
 * Regression-testing module types — mirror the ai-server contract
 * (GET/POST/PUT/DELETE /ai/regression/*). See
 * docs/superpowers/specs/2026-06-02-regression-testing-website-design.md.
 */

export type RunOutcome = 'pass' | 'fail' | 'flaky'

export interface SnapshotArtifact {
  type: 'snapshot'
  id: string
  filename: string
  url: string
  label: string
  step_index: number
  created_at: string
  deleted: boolean
}

export interface RegressionRoundDetail {
  summary?: string
  steps?: Array<Record<string, unknown>>
  artifacts?: Array<SnapshotArtifact | Record<string, unknown>>
}

export interface RegressionRound {
  round: number
  run_id: string
  status: RunOutcome
  run_at: string
  duration_ms: number
  log: string
  has_trace?: boolean
  tester?: string
  details?: RegressionRoundDetail
}

export interface RegressionVersion {
  version: number
  timestamp: string
  trigger: string
  modified_by?: string
  applied_by?: string
  title: string
  category?: string
  priority?: string
  description?: string
  spec_file?: string
  test_name?: string
  code: string
  status?: string
  log?: string
  run_at?: string
  duration_ms?: number
  rounds?: RegressionRound[]
}

export interface DiagnosisResult {
  issue_type: 'code_bug' | 'data_issue' | 'env_issue' | 'test_bug' | 'none' | 'unknown'
  summary: string
  explanation: string
  recommendation: string
}

export interface RegressionTest {
  id: number
  title: string
  spec_file: string
  test_name: string
  category: string
  source: 'AI' | 'User'
  created_by?: string
  priority: 'High' | 'Medium' | 'Low'
  description: string
  last_status: RunOutcome | null
  last_duration_ms: number | null
  run_count: number
  pass_count: number
  fail_count: number
  total_duration_ms: number
  flakiness_score: number
  last_run_at: string | null
  recent_results: RunOutcome[]
  instability: number
  quarantined: boolean
  story?: string
  conditions?: string[]
  entity_intents?: EntityIntent[]
  active_version?: number
  versions?: RegressionVersion[]
}

/**
 * Response from POST /ai/regression/generate-playwright.
 * `code` + `issues` when the story is concrete enough; `questions` when the AI
 * needs clarification; `error` for soft failures.
 */
export interface GenerateResult {
  code?: string
  issues?: string[]
  questions?: string[]
  error?: string
}

/** Run ordering: failing-first surfaces historically-failing cases first (Goal 6). */
export type RunOrder = 'failing-first' | 'as-given'

/** Run scope ladder (Goal 3 / §4.4a): just the selected, related-by-category, or all. */
export type RunScope = 'selected' | 'related' | 'all'

export interface RunStartResult {
  run_id: string
}

export interface RunStatusResult {
  status: 'running' | 'done' | 'error'
  total?: number
  passed: number
  failed: number
  results?: Record<string, { status: RunOutcome; duration_ms?: number; has_trace?: boolean; details?: RegressionRoundDetail }>
  error?: string | null
}

export interface ImportResult {
  imported: number
  skipped: number
}

/** Error shape carried alongside a 422 from apply-generated (quality gate). */
export interface ApplyGateError extends Error {
  issues?: string[]
  status?: number
}

export interface EntityIntent {
  value: string
  entity_type: 'fleet' | 'crew' | 'flight' | 'pairing' | 'date' | 'other'
  intent: 'must_find' | 'empty_state' | 'pending'
  condition_index: number
  context?: string
}
