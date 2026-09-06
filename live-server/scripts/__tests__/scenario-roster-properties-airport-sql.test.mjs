/**
 * Regression: scenario rosterProperties must join f8.airport, not scenario.airport.
 * scenario schema has no airport table — wrong join failed SIT scen legality
 * (error: relation "f8_sit_scenario.airport" does not exist) and suppressed 8071.
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

const assignmentProjectionRe =
  /\bcoalesce\(\s*nullif\(\s*rf\.assignment,\s*''\s*\),\s*p\.assignment,\s*''\s*\)\s+as\s+assignment\b/i
const assignmentPredicateRe =
  /cardinality\(\$\d+::text\[\]\)\s*=\s*0\s+or\s+coalesce\(\s*nullif\(\s*rf\.assignment,\s*''\s*\),\s*p\.assignment,\s*''\s*\)\s*=\s*any\(\$\d+::text\[\]\)/i

function assertAssignmentSql(db, expectedValues) {
  const sql = db.captured.at(-1)?.text ?? ''
  const values = db.captured.at(-1)?.values ?? []
  assert.match(sql, assignmentProjectionRe, 'must project assignment independently from qualifier')
  assert.match(sql, assignmentPredicateRe, 'must filter by assignment independently from assignment_group')
  assert.ok(values.some((value) => JSON.stringify(value) === JSON.stringify(expectedValues)), 'must pass assignments as a SQL array param')
}

test('scenario rosterProperties joins f8.airport (not scenario.airport)', async () => {
  const db = captureDb()
  await scenarioSource(db, 718).rosterProperties({ destinations: ['SFO'] })
  const sql = db.captured.at(-1)?.text ?? ''
  assert.match(sql, /\bf8\.airport\b/i, 'must join live airport master')
  assert.doesNotMatch(sql, /\bscenario\.airport\b/i, 'scenario schema has no airport table')
})

test('scenario rosterProperties selects destination_country for 8071 country filters', async () => {
  const db = captureDb()
  await scenarioSource(db, 718).rosterProperties({ countries: ['SFO'] })
  const sql = db.captured.at(-1)?.text ?? ''
  assert.match(
    sql,
    /\bcoalesce\(\s*nullif\(\s*ap\.country,\s*''\s*\),\s*''\s*\)\s+as\s+destination_country\b/i,
    'must project ap.country as destination_country so 8071 country filters can match',
  )
})

test('live rosterProperties projects and filters 8071 assignments independently', async () => {
  const db = captureDb()
  await liveSource(db, '2026-06-01', '2026-07-01').rosterProperties({ assignments: ['FLT'] })
  assertAssignmentSql(db, ['FLT'])
})

test('scenario rosterProperties projects and filters 8071 assignments independently', async () => {
  const db = captureDb()
  await scenarioSource(db, 718).rosterProperties({ assignments: ['FLT'] })
  assertAssignmentSql(db, ['FLT'])
})

test('seed scenario rosterProperties projects and filters 8071 assignments independently', async () => {
  const db = captureDb()
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    seedCrewIds: ['C1'],
    seedPairingIds: [700],
  }
  await buildSeedSource(db, 718, ctx).rosterProperties({ assignments: ['FLT'] })
  assertAssignmentSql(db, ['FLT'])
})
