/**
 * Capture 1001 assignmentOverlapRosters SQL from Live / Scenario / seed loaders
 * and assert pairing rows use duty report/release, not first/last flight sch.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { liveSource } from '../live-legality.mjs'
import { scenarioSource } from '../scenario-legality.mjs'
import { buildSeedSource } from '../scenario-legality-source.mjs'

function captureDb() {
  const captured = []
  return {
    captured,
    query: async (queryConfig, values) => {
      const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text
      captured.push({ text, values })
      return { rows: [] }
    },
  }
}

function assertDutyBounds(sql, label) {
  assert.match(sql, /duty_act_str_dt_utc/, `${label} must select duty report`)
  assert.match(sql, /brief_start_utc/, `${label} must fall back to brief`)
  assert.match(sql, /duty_act_end_dt_utc/, `${label} must select duty release`)
  assert.match(sql, /debrief_end_utc/, `${label} must fall back to debrief`)
  assert.doesNotMatch(
    sql,
    /extract\(epoch from min\(rf\.sch_str_dt_utc\)\)::bigint as start_secs/,
    `${label} must not use first-flight STD as pairing start`,
  )
  assert.doesNotMatch(
    sql,
    /extract\(epoch from max\(rf\.sch_end_dt_utc\)\)::bigint as end_duty_secs/,
    `${label} must not use last-flight STA as pairing duty end`,
  )
}

/**
 * A Callout Standby row is the paper trail of a standby consumed by Recovery —
 * the crew is flying after the callout, so rule 1001 must not count that row as
 * a competing assignment (crew-roster-recovery-requirements §7.2 allows exactly
 * this one overlap). Regression guard for the "standby callout option is blocked
 * by 1001 ASBY↔FLY" bug.
 */
function assertCalloutStandbyExcluded(sql, label) {
  assert.match(
    sql,
    /coalesce\(rf\.exception_code, ''\) <> 'CALLOUT_STANDBY'/,
    `${label} must exclude callout-standby rows from the 1001 overlap timeline`,
  )
}

test('live assignmentOverlapRosters pairing rows use report/release', async () => {
  const db = captureDb()
  await liveSource(db, '2026-08-01', '2026-09-01').assignmentOverlapRosters()
  const sql = db.captured.at(-1)?.text ?? ''
  assertDutyBounds(sql, 'live')
  assert.match(sql, /join pairing_segment ps/)
  assertCalloutStandbyExcluded(sql, 'live')
})

test('scenario assignmentOverlapRosters pairing rows use report/release with live segment fallback', async () => {
  const db = captureDb()
  await scenarioSource(db, 718, {}).assignmentOverlapRosters()
  const sql = db.captured.at(-1)?.text ?? ''
  assertDutyBounds(sql, 'scenario')
  assert.match(sql, /f8\.pairing_segment lps/)
  assertCalloutStandbyExcluded(sql, 'scenario')
})

test('seed assignmentOverlapRosters pairing rows use report/release', async () => {
  const db = captureDb()
  await buildSeedSource(db, 0, { seedCrewIds: ['2496'], seedPairingIds: [15264] }).assignmentOverlapRosters()
  const sql = db.captured.at(-1)?.text ?? ''
  assertDutyBounds(sql, 'seed')
  assert.match(sql, /f8\.pairing_segment ps/)
  assertCalloutStandbyExcluded(sql, 'seed')
})
