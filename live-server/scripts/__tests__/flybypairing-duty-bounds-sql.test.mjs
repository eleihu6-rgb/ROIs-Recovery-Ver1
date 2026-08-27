/**
 * Capture 8056 flyByPairing SQL from Live / Scenario / seed loaders
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

function assertPairingDutyBounds(sql, label) {
  assert.match(sql, /duty_act_str_dt_utc/, `${label} must select duty report`)
  assert.match(sql, /brief_start_utc/, `${label} must fall back to brief`)
  assert.match(sql, /duty_act_end_dt_utc/, `${label} must select duty release`)
  assert.match(sql, /debrief_end_utc/, `${label} must fall back to debrief`)
  assert.match(sql, /ps\.duty_seq = rf\.duty_seq/, `${label} must gate pairing_segment on duty_seq`)
  assert.match(sql, /as end_secs/, `${label} must alias pairing end as end_secs`)
  assert.doesNotMatch(
    sql,
    /as end_duty_secs/,
    `${label} must not alias pairing end as end_duty_secs`,
  )
  assert.doesNotMatch(
    sql,
    /extract\(epoch from min\(rf\.sch_str_dt_utc\)\)::bigint(?:::text)? as start_secs/,
    `${label} must not use first-flight STD as pairing start`,
  )
  assert.doesNotMatch(
    sql,
    /extract\(epoch from max\(rf\.sch_end_dt_utc\)\)::bigint(?:::text)? as end_secs/,
    `${label} must not use last-flight STA as pairing end`,
  )
}

test('live flyByPairing pairing rows use report/release', async () => {
  const db = captureDb()
  await liveSource(db, '2026-08-01', '2026-09-01').flyByPairing([], [])
  const sql = db.captured.at(-1)?.text ?? ''
  assertPairingDutyBounds(sql, 'live')
  assert.match(sql, /join pairing_segment ps/)
})

test('scenario flyByPairing pairing rows use report/release with live segment fallback', async () => {
  const db = captureDb()
  await scenarioSource(db, 718, {}).flyByPairing([], [])
  const sql = db.captured.at(-1)?.text ?? ''
  assertPairingDutyBounds(sql, 'scenario')
  assert.match(sql, /f8\.pairing_segment lps/)
})

test('seed flyByPairing pairing rows use report/release', async () => {
  const db = captureDb()
  await buildSeedSource(db, 0, {
    seedCrewIds: ['2496'],
    seedPairingIds: [15264],
    dateFrom: '2026-08-01',
    dateTo: '2026-09-01',
  }).flyByPairing([], [])
  const sql = db.captured.at(-1)?.text ?? ''
  assertPairingDutyBounds(sql, 'seed')
  assert.match(sql, /f8\.pairing_segment ps/)
})
