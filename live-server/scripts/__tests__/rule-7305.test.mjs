import test from 'node:test'
import assert from 'node:assert/strict'
import { rule7305 } from '../legality-recheck-core.mjs'

const HEADER = [
  'Bases', 'Ranks', 'Positions', 'Fleets', 'CREW TEAMS', 'Assignment Groups',
  'Assignments', 'Labels', 'Attributes', 'Consecutive Type', 'Max Consecutive Times', 'Severity',
]

const ROW = [
  'YEG', 'CA', 'CAPT', '320', 'TEAM-A', 'FLY', 'FLT', 'LABEL-A', 'ATTR-A',
  'T', '1', '2',
]

const START = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000)

const sourceWithOneDuty = () => ({
  async crewQualEntries() {
    return [
      { crew_id: 'C1', dim: 'B', value: 'YEG', eff: '2026-01-01', exp: null },
      { crew_id: 'C1', dim: 'R', value: 'CA', eff: '2026-01-01', exp: null },
      { crew_id: 'C1', dim: 'P', value: 'CAPT', eff: '2026-01-01', exp: null },
      { crew_id: 'C1', dim: 'F', value: '320', eff: '2026-01-01', exp: null },
    ]
  },
  async crewOffsets() { return new Map([['C1', -360]]) },
  async crewTeams() { return new Map([['C1', ['TEAM-A']]]) },
  async assignmentGroups() {
    return [{ assignment: 'FLT', assignment_group: 'FLY' }]
  },
  async flyDuties() {
    return [{
      id: 101,
      crew_id: 'C1',
      pairing_id: 101,
      start_secs: START,
      end_secs: START + 3600,
      end_including_rest_secs: START + 7200,
      offset_min: -360,
      assignment: 'FLT',
      assignment_group: 'FLY',
      attributes: 'ATTR-A',
      label: 'LABEL-A',
      is_pre_assigned: false,
      phase_checked: true,
    }]
  },
  async groundWork() { return [] },
})

const contextFor = (instancesOf, runBin, log = () => {}) => ({
  dateFrom: '2026-06-01',
  dateTo: '2026-06-30',
  instancesOf,
  runBin,
  log,
})

const ruleInstances = (header = HEADER, rows = [ROW]) => (fn) =>
  fn === 7305 ? [{ instance: '001', header, rows }] : []

test('rule7305 is a no-op without instances and does not query the source', async () => {
  let sourceCalled = false
  const source = new Proxy({}, {
    get() {
      sourceCalled = true
      throw new Error('source must not be queried')
    },
  })

  const out = await rule7305(source, contextFor(() => [], () => {
    throw new Error('binary must not run')
  }))

  assert.deepEqual(out, [])
  assert.equal(sourceCalled, false)
})

test('rule7305 emits an exact 12-cell R row plus Q P', async () => {
  let captured
  await rule7305(sourceWithOneDuty(), contextFor(
    ruleInstances(),
    (bin, args, input) => {
      captured = { bin, args, input }
      return []
    },
  ))

  assert.equal(captured.bin, 'check-7305')
  assert.deepEqual(captured.args, ['--emit-tsv', '--per-crew-window'])
  const lines = captured.input.split('\n')
  const r = lines.find((line) => line.startsWith('R\t'))
  assert.deepEqual(r.split('\t'), ['R', '0', ...ROW])
  assert.ok(lines.includes('Q\tC1\tP\tCAPT\t20454\t-1'), captured.input)
  assert.ok(lines.includes('T\tC1\tTEAM-A'), captured.input)
  assert.ok(lines.includes('G\tFLT\tFLY'), captured.input)
  assert.ok(lines.some((line) => line.startsWith('D\tC1\t101\t101\t')), captured.input)
})

// Duties without a computed duty_ref_tz (reserve/ground rows never get one) must still be
// counted in the crew's base calendar — falling back to UTC made a YYZ reserve block ending
// 02:00Z look like it occupied the next local day.
test('rule7305 falls back to the crew base offset when a duty carries no offset', async () => {
  const source = sourceWithOneDuty()
  source.flyDuties = async () => [{
    id: 101,
    crew_id: 'C1',
    pairing_id: 101,
    start_secs: START,
    end_secs: START + 3600,
    end_including_rest_secs: START + 7200,
    offset_min: null,
    assignment: 'FLT',
    assignment_group: 'FLY',
    attributes: 'ATTR-A',
    label: 'LABEL-A',
    is_pre_assigned: false,
    phase_checked: true,
  }]

  let captured
  await rule7305(source, contextFor(ruleInstances(), (bin, args, input) => {
    captured = input
    return []
  }))

  const d = captured.split('\n').find((line) => line.startsWith('D\t'))
  assert.equal(d.split('\t')[7], '-360', captured)
})

test('rule7305 maps binary V output to the persisted violation shape', async () => {
  const body = 'The number of consecutive rosters (2) [1969-12-31, 1969-12-31] exceeds the threshold (1).'
  const message = `Row 1: ${body}`
  const out = await rule7305(sourceWithOneDuty(), contextFor(
    ruleInstances(),
    () => [['V', 'C1', '0', '101', String(START), String(START + 7200), '2', '1', '2', body]],
  ))

  assert.deepEqual(out, [{
    crew_id: 'C1',
    pairing_id: 101,
    duty_seq: null,
    rule_code: '7305',
    rule_instance: '001',
    scope_key: 'r0:fecebd28',
    start_dt: new Date(START * 1000).toISOString(),
    end_dt: new Date((START + 7200) * 1000).toISOString(),
    severity: 2,
    actual_value: 2,
    limit_value: 1,
    unit: 'TIME',
    message,
  }])
})

test('rule7305 uses compact row-indexed scope keys so long rows do not collide', async () => {
  const longPrefixA = ['BASE-LONG', 'RANK-LONG', 'POSITION-LONG', 'FLEET-LONG', 'TEAM-LONG', 'GROUP-LONG', 'ASSIGN-LONG', 'LABEL-LONG', 'ATTR-A']
  const longPrefixB = ['BASE-LONG', 'RANK-LONG', 'POSITION-LONG', 'FLEET-LONG', 'TEAM-LONG', 'GROUP-LONG', 'ASSIGN-LONG', 'LABEL-LONG', 'ATTR-B']
  const rows = [
    [...longPrefixA, 'T', '1', '2'],
    [...longPrefixB, 'T', '1', '2'],
  ]
  const out = await rule7305(sourceWithOneDuty(), contextFor(
    ruleInstances(HEADER, rows),
    () => [
      ['V', 'C1', '0', '101', String(START), String(START + 7200), '2', '1', '2', 'a'],
      ['V', 'C1', '1', '101', String(START), String(START + 7200), '2', '1', '2', 'b'],
    ],
  ))

  assert.match(out[0].scope_key, /^r0:[0-9a-f]{8}$/)
  assert.match(out[1].scope_key, /^r1:[0-9a-f]{8}$/)
  assert.notEqual(out[0].scope_key, out[1].scope_key)
  assert.ok(out.every((row) => row.scope_key.length <= 40))
})

test('rule7305 rejects obsolete 15-cell rows instead of reading shifted values', async () => {
  let captured = false
  const logs = []
  const legacyHeader = [
    'Bases', 'Ranks', 'Positions', 'Fleets', 'CREW TEAMS', 'Assignment Groups',
    'Assignments', 'Labels', 'Attributes', 'Unused 1', 'Unused 2',
    'Consecutive Type', 'Unused 3', 'Max Consecutive Times', 'Severity',
  ]
  const legacyRow = [
    'YEG', 'CA', 'CAPT', '320', 'TEAM-A', 'FLY', 'FLT', 'LABEL-A', 'ATTR-A',
    '*', '*', 'T', '*', '1', '2',
  ]

  const out = await rule7305(sourceWithOneDuty(), contextFor(
    ruleInstances(legacyHeader, [legacyRow]),
    () => {
      captured = true
      return []
    },
    (message) => logs.push(message),
  ))

  assert.deepEqual(out, [])
  assert.equal(captured, false)
  assert.ok(logs.some((message) => message.includes('expected 12 positional columns')), logs.join('\n'))
})
