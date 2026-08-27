import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rule7508,
  buildCrewBaseTimeline,
  resolveOffsetAtUtc,
} from '../legality-recheck-core.mjs'

test('rule7508 D-line uses YEG offset for August duty when window from is June', async () => {
  const timeline = buildCrewBaseTimeline([
    { crew_id: '755', base: 'YYZ', is_prime_base: 1, eff_dt: '2025-11-01', exp_dt: '2026-06-30' },
    { crew_id: '755', base: 'YEG', is_prime_base: 1, eff_dt: '2026-07-01', exp_dt: '2043-04-04' },
  ])
  let captured = ''
  const source = {
    async crewOffsets() {
      // wrong legacy: window-start YYZ
      return new Map([['755', -240]])
    },
    async resolveCrewOffset(crewId, utcSecs) {
      return resolveOffsetAtUtc(timeline, crewId, utcSecs)
    },
    async resolveCrewTimezone() {
      return 'America/Edmonton'
    },
    async crewBaseTimezone() {
      return new Map([['755', 'America/Toronto']])
    },
    async flyDuties() {
      return []
    },
    async groundWork() {
      return [{
        crew_id: '755',
        pairing_id: 0,
        start_secs: Date.parse('2026-08-17T06:01:00Z') / 1000,
        end_secs: Date.parse('2026-08-18T06:00:00Z') / 1000,
        is_rest: true,
        is_pre_assigned: true,
      }]
    },
  }

  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-10-31',
    instancesOf: (fn) => {
      if (fn === 7508) {
        return [{
          instance: '001',
          header: ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Period', 'Unit', 'Duty Report', 'Duty Release', 'Duty End Buffer', 'Min Limits'],
          rows: [['*', '*', '*', '*', '672', 'RH', 'Y', 'Y', '00:30', '4']],
        }]
      }
      if (fn === 2014) {
        return [{ header: ['Local Night Start', 'Local Night End', 'Min Interval Hours'], rows: [['22:30', '09:30', '09:00']] }]
      }
      return []
    },
    runBin: async (_bin, _args, input) => {
      captured = input
      return []
    },
    log() {},
  }

  await rule7508(source, ctx)
  const dLine = captured.split('\n').find((l) => l.startsWith('D\t755\t'))
  assert.ok(dLine, 'expected D line')
  const cols = dLine.split('\t')
  // D crew pairing start end first last baseOffset startRef endRef isRest isPa
  assert.equal(Number(cols[7]), -360, `expected YEG offset, got line=${dLine}`)
})
