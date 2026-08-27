import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildAccRefUpdates } from '../acc-ref-tz.mjs'

const read = (name) => fs.readFileSync(path.resolve(import.meta.dirname, '..', name), 'utf8')

test('live recheck persists 7500 before dependent legality computation', () => {
  const source = read('live-legality.mjs')
  const preflight = source.lastIndexOf('await persistLiveAccRef')
  const compute = source.indexOf('computeViolations(liveSource')
  assert.ok(preflight >= 0)
  assert.ok(compute >= 0)
  assert.ok(preflight < compute, '7500 persistence must precede computeViolations')
})

test('scenario recheck runs 7500 preflight before dependent legality computation', () => {
  const source = read('scenario-legality.mjs')
  const preflight = source.indexOf('await recalculateScenarioAccRefTz')
  const compute = source.indexOf('computeViolations(source')
  assert.ok(preflight >= 0, 'scenario preflight helper must be called')
  assert.ok(compute >= 0)
  assert.ok(preflight < compute, '7500 preflight must precede computeViolations')
})

test('shared 7500 preflight preserves different refs for crews sharing one pairing', () => {
  const rows = [
    { crew_id: 'C1', pairing_id: 700, duty_seq: 1, start_utc: '2026-01-01T00:00:00Z', end_utc: '2026-01-01T04:00:00Z' },
    { crew_id: 'C2', pairing_id: 700, duty_seq: 1, start_utc: '2026-01-01T00:00:00Z', end_utc: '2026-01-01T04:00:00Z' },
  ]
  const updates = buildAccRefUpdates(rows, { stayPerMin: 1440, adjustMin: 60 }, (input) => new Map(
    input.map((crew) => [`${crew.crewId}|700|1`, crew.crewId === 'C1' ? -240 : 60]),
  ))
  assert.deepEqual(updates.map((row) => [
    row.crew_id,
    row.pairing_id,
    row.duty_seq,
    row.duty_ref_tz,
    row.duty_end_ref_tz,
  ]), [
    ['C1', 700, 1, -240, -240],
    ['C2', 700, 1, 60, 60],
  ])
})
