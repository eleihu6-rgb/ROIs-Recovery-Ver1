/**
 * Regression — LIVE legality recheck must key on bigint `ruleset_id`, not the dropped
 * `rule_group_code` column.
 *
 * The Model-B drop migration (2026-06-23-result-tables-rule-group-code-to-ruleset-id.sql)
 * renamed f8.rule_violation.rule_group_code → ruleset_id (bigint = workset/法规集合 id) and
 * remapped non-numeric legacy values → 103. The TS read path (roster-violations.ts) and the
 * gantt toolbar were updated, but the spawned live-recheck script (live-legality.mjs) was
 * NOT — it still DELETEd/INSERTed/counted by `rule_group_code` with the string group code
 * 'pbs_solver_ruleset'. Clicking "Recheck now" therefore failed with:
 *     ERROR: column "rule_group_code" does not exist
 *
 * This test spawns live-legality.mjs the EXACT way the server does (cold-start + the
 * "Recheck now" button both run `node scripts/live-legality.mjs --group pbs_solver_ruleset
 * --from .. --to ..`). Before the fix the child exits non-zero (column error) → execFileSync
 * throws. After the fix it exits 0 AND its own read-back count query (which filters
 * `where ruleset_id=$1` with the resolved default workset 103) returns rows — proving the
 * write value matches what the gantt read path queries by.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const LIVE_SERVER = path.join(REPO, 'live-server')
const SCRIPT = path.join(LIVE_SERVER, 'scripts', 'live-legality.mjs')

const runRecheck = (from: string, to: string, rules?: string): string =>
  execFileSync(
    process.execPath,
    [
      SCRIPT,
      '--group', 'pbs_solver_ruleset',
      '--from', from,
      '--to', to,
      ...(rules ? ['--rules', rules] : []),
    ],
    { cwd: LIVE_SERVER, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env } },
  )

test.describe('live legality recheck — ruleset_id keying (regression)', () => {
  // The recheck recomputes the rule engine over a real roster window; give it room.
  test.setTimeout(180_000)

  test('whole-group recheck completes and persists violations under ruleset_id (no rule_group_code)', () => {
    // Whole-group recheck over a two-week live window — the path "Recheck now"/cold-start use.
    // Before the fix this throws ("column rule_group_code does not exist"); after, exit 0.
    const out = runRecheck('2026-06-01', '2026-06-14')

    // The script's success log prints its own read-back count query, which filters by the
    // bigint ruleset_id (default workset 103). A non-empty array (`rule_code:` present) proves
    // rows were both WRITTEN and re-READ by ruleset_id — i.e. write value == read filter.
    expect(out).toContain('persisted in-window')
    expect(out).toMatch(/rule_code:/)
  })

  test('scoped --rules recheck also keys on ruleset_id (scoped DELETE branch)', () => {
    // The scoped branch (--rules) is a separate DELETE statement; exercise it too. 8002 fires
    // broadly on June roster data, so the read-back count is non-empty.
    const out = runRecheck('2026-06-01', '2026-06-14', '8002')
    expect(out).toContain('persisted in-window')
    expect(out).toMatch(/rule_code:/)
  })
})
