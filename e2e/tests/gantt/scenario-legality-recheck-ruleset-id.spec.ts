/**
 * Regression — SCENARIO legality compute must read/write `ruleset_id`, not the dropped /
 * renamed `rule_group_code` columns.
 *
 * Twin of live-legality-recheck-ruleset-id.spec.ts (§Gantt-Unify). The rule_group_code →
 * ruleset_id migration renamed every legality column to the workset id (bigint):
 *   - dropped  f8.scenario.rule_group_code              → now ruleset_id (bigint)
 *   - renamed  scenario.legality_status.rule_group_code → ruleset_id (bigint)
 *   - renamed  scenario.rule_violation.rule_group_code  → ruleset_id (bigint — a write-only tag
 *              the read path never queries; it holds the scenario's numeric ruleset_id).
 *
 * scenario-legality.mjs SELECTed f8.scenario.rule_group_code and INSERTed the renamed
 * legality_status / rule_violation columns → any reference to the old name threw
 *     ERROR: column "rule_group_code" does not exist
 * so any scenario recheck (open a scenario / Recheck button) failed. (It also hardcoded a
 * remote DB URL + password; now reads DATABASE_URL from live-server/.env like its live twin.)
 *
 * This spawns scenario-legality.mjs the way live-server does (legality-status.ts →
 * `node scripts/scenario-legality.mjs <scenarioId>`). Before the fix the child exits non-zero
 * (column error) → execFileSync throws. After: exit 0, status flips READY, and its read-back
 * count query returns persisted rows.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const LIVE_SERVER = path.join(REPO, 'live-server')
const SCRIPT = path.join(LIVE_SERVER, 'scripts', 'scenario-legality.mjs')

// A DONE scenario with roster data + ruleset_id 103 (workset 103 = default RULE workset).
const SCENARIO_ID = 538

test.describe('scenario legality compute — ruleset_id keying (regression)', () => {
  test.setTimeout(180_000)

  test('scenario compute reads ruleset_id + flips READY + persists violations (no rule_group_code)', () => {
    // Before the fix this throws ("column rule_group_code does not exist"); after, exit 0.
    const out = execFileSync(process.execPath, [SCRIPT, String(SCENARIO_ID)], {
      cwd: LIVE_SERVER,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env },
    })

    // The script's success log: `persisted for scenario 538: [ { rule_code, n }, … ] — status READY`.
    // READY proves the legality_status INSERT (now ruleset_id) committed; the non-empty count
    // (`rule_code:` present) proves the f8.scenario ruleset_id read + the rule_violation write
    // both succeeded.
    expect(out).toContain(`persisted for scenario ${SCENARIO_ID}`)
    expect(out).toContain('status READY')
    expect(out).toMatch(/rule_code:/)
  })
})
