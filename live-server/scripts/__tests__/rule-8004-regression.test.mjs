// Focused regression test for the Live 8004 qualification case.
// Run with: pnpm test:8004-regression
//
// Keep this test independent from the optional Rust binaries. The 8004 Fleet
// check is implemented in the shared legality core and must remain verifiable
// on a clean local development checkout.
import test from 'node:test'
import assert from 'node:assert/strict'
import { rule8004 } from '../legality-recheck-core.mjs'

const epoch = (iso) => Math.floor(new Date(iso).getTime() / 1000)
const FLEET_HEADER = ['Base', 'Rank', 'Fleet', 'Type', 'Enable Check', 'Grace Period', 'Unit', 'Assignments']

const sourceForCrew1012 = (fleetQuals = []) => ({
  db: {},
  async assignmentsRaw() {
    return [{
      crew_id: '1012',
      pairing_id: 135559,
      base: 'PVG',
      start_date: '2026-09-06',
      end_date: '2026-09-10',
      start_secs: epoch('2026-09-06T13:00:00Z'),
      end_secs: epoch('2026-09-10T18:00:00Z'),
    }]
  },
  async baseQuals() {
    return [{
      crew_id: '1012',
      base: 'PVG',
      eff_date: '2020-01-01',
      exp_date: '2199-12-31',
    }]
  },
  async crewBaseTimezone() {
    return new Map([['1012', 'UTC']])
  },
  async fleetSegments() {
    return [{
      crew_id: '1012',
      pairing_id: 135559,
      assignment_group: 'FLY',
      fleet: '7M8',
      start_secs: epoch('2026-09-07T05:40:00Z'),
      end_secs: epoch('2026-09-07T08:40:00Z'),
    }]
  },
  async fleetQuals() {
    return fleetQuals
  },
})

const context = {
  log: () => {},
  instancesOf: (functionCode) => functionCode === 8004
    ? [{
      instance: '002',
      header: FLEET_HEADER,
      rows: [['*', '*', '*', 'FLEET', 'Y', '0', 'CD', 'FLY']],
    }]
    : [],
  runBin: async () => [],
}

test('Crew 1012 executing Pairing 135559 without 7M8 qualification emits 8004', async () => {
  const violations = await rule8004(sourceForCrew1012(), context)

  assert.equal(violations.length, 1)
  assert.deepEqual(
    [violations[0].crew_id, violations[0].pairing_id, violations[0].rule_code],
    ['1012', 135559, '8004'],
  )
  assert.match(violations[0].message, /Crew fleet 7M8 is not a valid qualification/)
})

test('the same case is clear only after an effective 7M8 qualification is present', async () => {
  const violations = await rule8004(sourceForCrew1012([{
    crew_id: '1012',
    value: '7M8',
    eff_date: '2026-01-01',
    exp_date: '2026-12-31',
  }]), context)

  assert.deepEqual(violations, [])
})
