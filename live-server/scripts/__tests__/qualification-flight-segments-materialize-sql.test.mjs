/**
 * Capture 8072 qualificationFlightSegments SQL and assert the four LATERAL-heavy
 * CTEs are materialized so the planner cannot inline them as 1-row nested loops.
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

function assertMaterializedCtes(sql, label) {
  for (const name of ['crew_rows', 'crews', 'planned', 'filled']) {
    assert.match(
      sql,
      new RegExp(`${name}\\s+as\\s+materialized\\b`, 'i'),
      `${label} must materialize ${name}`,
    )
  }
}

test('live qualificationFlightSegments materializes LATERAL CTEs', async () => {
  const db = captureDb()
  await liveSource(db, '2026-08-01', '2026-09-01').qualificationFlightSegments()
  assertMaterializedCtes(db.captured.at(-1)?.text ?? '', 'live')
})

test('scenario qualificationFlightSegments materializes LATERAL CTEs', async () => {
  const db = captureDb()
  await scenarioSource(db, 718, {}).qualificationFlightSegments()
  const sql = db.captured.at(-1)?.text ?? ''
  assertMaterializedCtes(sql, 'scenario')
  assert.match(sql, /filled_rows\s+as\s+materialized\b/i, 'scenario must materialize filled_rows (set-based COF)')
  const filledBlock = sql.match(/filled_rows\s+as\s+materialized\s*\([\s\S]*?\)\s*,\s*filled\s+as\s+materialized/i)?.[0] ?? ''
  assert.ok(filledBlock.length > 0, 'scenario must expose filled_rows → filled CTE block')
  assert.doesNotMatch(filledBlock, /join\s+lateral/i, 'filled_rows must not use per-segment LATERAL')
})

test('scenario qualificationFlightSegments scopes seg to focusPairingIds when provided', async () => {
  const db = captureDb()
  await scenarioSource(db, 743, { focusPairingIds: [135599] }).qualificationFlightSegments({
    focusPairingIds: [135599],
  })
  const last = db.captured.at(-1)
  assert.match(last?.text ?? '', /cardinality\(\$6::bigint\[\]\) = 0 or rf\.pairing_id = any\(\$6::bigint\[\]\)/)
  assert.deepEqual(last?.values?.[5], [135599])
})

test('live qualificationFlightSegments scopes seg to focusPairingIds when provided', async () => {
  const db = captureDb()
  await liveSource(db, '2026-09-01', '2026-10-01').qualificationFlightSegments({
    focusPairingIds: [135599],
  })
  const last = db.captured.at(-1)
  assert.match(last?.text ?? '', /cardinality\(\$7::bigint\[\]\) = 0 or rf\.pairing_id = any\(\$7::bigint\[\]\)/)
  assert.deepEqual(last?.values?.[6], [135599])
})

test('seed qualificationFlightSegments materializes LATERAL CTEs', async () => {
  const db = captureDb()
  await buildSeedSource(db, 0, {
    seedCrewIds: ['2496'],
    seedPairingIds: [15264],
  }).qualificationFlightSegments()
  assertMaterializedCtes(db.captured.at(-1)?.text ?? '', 'seed')
})
