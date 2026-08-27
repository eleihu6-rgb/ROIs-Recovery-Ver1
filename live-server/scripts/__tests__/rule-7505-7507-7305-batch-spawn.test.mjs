import test from 'node:test'
import assert from 'node:assert/strict'
import { rule7505, rule7507, rule7305 } from '../legality-recheck-core.mjs'

const epoch = (iso) => Math.floor(new Date(iso).getTime() / 1000)

const HDR7505 = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'DO Assignment Group', 'Min DO',
  'Period', 'Unit', 'RP Days Range', 'Utilize Post Duty Rest',
  'Count Blank Day', 'Count Layover', 'Leave Assignments', 'Leave Days Range',
]
const HDR7507 = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'DO Assignment Group', 'Min DO',
  'Period', 'Unit', 'RP Days Range', 'Utilize Post Duty Rest',
  'Count Blank Day', 'Count Layover', 'Leave Assignments', 'Leave Days Range',
  'NUM FLY DAY', 'FLY ASSIGNMENTS', 'NUM RESERVES', 'RES ASSIGNMENTS', 'Count Layover',
]
const CTX_DATES = { dateFrom: '2026-06-01', dateTo: '2026-06-30' }
const row = (id, pairingId, s, e) => ({
  crew_id: id, pairing_id: pairingId, code: 'FLY',
  s: epoch(s), e: epoch(e), end_rest_secs: epoch(e),
})
const ctxOf = (instancesOf) => ({
  ...CTX_DATES,
  instancesOf,
  log: () => {},
})

test('rule7505 batches crews sharing an offset into one spawn', async () => {
  const spawns = []
  const source = {
    async crewOffsets() { return new Map([['C1', -360], ['C2', -360]]) },
    async assignmentsAll() {
      return [
        row('C1', 101, '2026-06-05T06:00:00Z', '2026-06-05T18:00:00Z'),
        row('C2', 201, '2026-06-10T06:00:00Z', '2026-06-10T18:00:00Z'),
      ]
    },
  }
  const ctx = ctxOf((fn) => fn === 7505
    ? [{ instance: '001', header: HDR7505, rows: [['*', '*', '*', '*', 'DO', '13', '1', 'RP', '31-31', 'N', 'N', 'N', '*', '0-0']] }]
    : [])
  ctx.runBin = (bin, args, tsv) => { spawns.push({ bin, args, tsv }); return [] }
  await rule7505(source, ctx)
  assert.equal(spawns.length, 1)
  assert.equal(spawns[0].bin, 'check-7505')
  const aLines = spawns[0].tsv.split('\n').filter((l) => l.startsWith('A\t'))
  assert.equal(aLines.length, 2)
  assert.ok(aLines.some((l) => l.startsWith('A\tC1\t')))
  assert.ok(aLines.some((l) => l.startsWith('A\tC2\t')))
})

test('rule7505 keeps different base offsets in separate spawns', async () => {
  const spawns = []
  const source = {
    async crewOffsets() { return new Map([['C1', -360], ['C2', -240]]) },
    async assignmentsAll() {
      return [
        row('C1', 101, '2026-06-05T06:00:00Z', '2026-06-05T18:00:00Z'),
        row('C2', 201, '2026-06-10T06:00:00Z', '2026-06-10T18:00:00Z'),
      ]
    },
  }
  const ctx = ctxOf((fn) => fn === 7505
    ? [{ instance: '001', header: HDR7505, rows: [['*', '*', '*', '*', 'DO', '13', '1', 'RP', '31-31', 'N', 'N', 'N', '*', '0-0']] }]
    : [])
  ctx.runBin = (bin, args, tsv) => { spawns.push({ bin, args, tsv }); return [] }
  await rule7505(source, ctx)
  assert.equal(spawns.length, 2)
  const offsets = spawns.map((s) => s.args[s.args.indexOf('--offset') + 1])
  assert.deepEqual(offsets.sort(), ['-360', '-240'].sort())
})

test('rule7505 excludes crews with no activity overlapping the month RP window', async () => {
  const spawns = []
  const source = {
    async crewOffsets() { return new Map([['C1', -360], ['C2', -360]]) },
    async assignmentsAll() {
      return [
        row('C1', 101, '2026-06-05T06:00:00Z', '2026-06-05T18:00:00Z'),
        row('C2', 201, '2026-07-10T06:00:00Z', '2026-07-10T18:00:00Z'),
      ]
    },
  }
  const ctx = ctxOf((fn) => fn === 7505
    ? [{ instance: '001', header: HDR7505, rows: [['*', '*', '*', '*', 'DO', '13', '1', 'RP', '31-31', 'N', 'N', 'N', '*', '0-0']] }]
    : [])
  ctx.runBin = (bin, args, tsv) => { spawns.push({ bin, args, tsv }); return [] }
  await rule7505(source, ctx)
  assert.equal(spawns.length, 1)
  const aLines = spawns[0].tsv.split('\n').filter((l) => l.startsWith('A\t'))
  assert.equal(aLines.length, 1)
  assert.ok(aLines[0].startsWith('A\tC1\t'))
})

test('rule7505 reorders batched output to legacy per-crew order', async () => {
  const source = {
    async crewOffsets() { return new Map([['C1', -360], ['C2', -360]]) },
    async assignmentsAll() {
      return [
        row('C1', 101, '2026-06-05T06:00:00Z', '2026-06-05T18:00:00Z'),
        row('C2', 201, '2026-06-10T06:00:00Z', '2026-06-10T18:00:00Z'),
      ]
    },
  }
const ctx = ctxOf((fn) => fn === 7505
    ? [{ instance: '001', header: HDR7505, rows: [['*', '*', '*', '*', 'DO', '13', '1', 'RP', '31-31', 'N', 'N', 'N', '*', '0-0']] }]
    : [])
  ctx.runBin = () => [
    ['C2', '1780329600', '1782921600', '2', '10', '1', 'RP'],
    ['C1', '1780329600', '1782921600', '2', '10', '1', 'RP'],
  ]
  const out = await rule7505(source, ctx)
  assert.equal(out.length, 2)
  assert.equal(out[0].crew_id, 'C1')
  assert.equal(out[1].crew_id, 'C2')
})

test('rule7507 batches crews sharing an offset into one spawn', async () => {
  const spawns = []
  const source = {
    async crewOffsets() { return new Map([['C1', -360], ['C2', -360]]) },
    async assignmentsAll() {
      return [
        row('C1', 101, '2026-06-05T06:00:00Z', '2026-06-05T18:00:00Z'),
        row('C2', 201, '2026-06-10T06:00:00Z', '2026-06-10T18:00:00Z'),
      ]
    },
  }
  const ctx = ctxOf((fn) => fn === 7507
    ? [{ instance: '001', header: HDR7507, rows: [['*', '*', '*', '*', 'DO', '0', '1', 'RP', '0-31', 'Y', 'Y', 'N', '0-31', '*', '0-31', '*', '*', '0-31']] }]
    : [])
  ctx.runBin = (bin, args, tsv) => { spawns.push({ bin, args, tsv }); return [] }
  await rule7507(source, ctx)
  assert.equal(spawns.length, 1)
  const aLines = spawns[0].tsv.split('\n').filter((l) => l.startsWith('A\t'))
  assert.equal(aLines.length, 2)
})

test('rule7305 evaluates all crews in one spawn with --per-crew-window', async () => {
  let captured
  const source = {
    async crewOffsets() { return new Map([['C1', -360], ['C2', -360]]) },
    async crewQualEntries() { return [] },
    async crewTeams() { return new Map() },
    async assignmentGroups() { return [] },
    async rosterDuties() {
      return [
        { crew_id: 'C1', id: 101, pairing_id: 101, start_secs: epoch('2026-06-05T06:00:00Z'), end_secs: epoch('2026-06-05T18:00:00Z'), end_including_rest_secs: epoch('2026-06-05T20:00:00Z'), offset_min: -360, assignment: 'FLT', assignment_group: 'FLY', attributes: '', label: '', is_pre_assigned: false, phase_checked: true },
        { crew_id: 'C2', id: 201, pairing_id: 201, start_secs: epoch('2026-06-10T06:00:00Z'), end_secs: epoch('2026-06-10T18:00:00Z'), end_including_rest_secs: epoch('2026-06-10T20:00:00Z'), offset_min: -360, assignment: 'FLT', assignment_group: 'FLY', attributes: '', label: '', is_pre_assigned: false, phase_checked: true },
      ]
    },
  }
  const ctx = ctxOf((fn) => fn === 7305 ? [{
    instance: '001',
    header: ['Bases', 'Ranks', 'Positions', 'Fleets', 'CREW TEAMS', 'Assignment Groups', 'Assignments', 'Labels', 'Attributes', 'Consecutive Type', 'Max Consecutive Times', 'Severity'],
    rows: [['*', '*', '*', '*', '*', '*', '*', '*', '*', 'T', '1', '2']],
  }] : [])
  ctx.runBin = (bin, args, tsv) => {
    captured = { bin, args, tsv }
    return []
  }
  await rule7305(source, ctx)
  assert.equal(captured.bin, 'check-7305')
  assert.deepEqual(captured.args, ['--emit-tsv', '--per-crew-window'])
  const dLines = captured.tsv.split('\n').filter((l) => l.startsWith('D\t'))
  assert.equal(dLines.length, 2)
})