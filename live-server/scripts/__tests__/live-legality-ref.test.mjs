import test from 'node:test'
import assert from 'node:assert/strict'

import { buildLiveAccRefUpdates } from '../live-legality.mjs'

test('live 7500 Ref updates keep crew-specific history and repeat the duty value on every segment', () => {
  const rows = [
    { crew_id: 'C2', pairing_id: 7001, duty_seq: 1, start_utc: '1970-01-01T00:01:40Z', end_utc: '1970-01-01T00:03:20Z', dep_tz_min: 60, arr_tz_min: 60 },
    { crew_id: 'C1', pairing_id: 7002, duty_seq: 1, start_utc: '1970-01-01T00:05:00Z', end_utc: '1970-01-01T00:06:40Z', dep_tz_min: -300, arr_tz_min: -300 },
    { crew_id: 'C1', pairing_id: 7001, duty_seq: 1, start_utc: '1970-01-01T00:01:40Z', end_utc: '1970-01-01T00:03:20Z', dep_tz_min: 0, arr_tz_min: 0 },
    { crew_id: 'C1', pairing_id: 7001, duty_seq: 1, start_utc: '1970-01-01T00:01:40Z', end_utc: '1970-01-01T00:03:20Z', dep_tz_min: 0, arr_tz_min: 0 },
  ]

  const result = buildLiveAccRefUpdates(rows, { stayPerMin: 1440, adjustMin: 60 }, (inputs) => {
    assert.deepEqual(inputs.map((input) => input.crewId), ['C1', 'C2'])
    assert.deepEqual(inputs[0].duties.map((duty) => duty.pairingId), [7001, 7002])
    assert.deepEqual(inputs[1].duties.map((duty) => duty.pairingId), [7001])
    return new Map([
      ['C1|7001|1', { duty_ref_tz: -240, duty_end_ref_tz: -210 }],
      ['C1|7002|1', { duty_ref_tz: -180, duty_end_ref_tz: -180 }],
      ['C2|7001|1', { duty_ref_tz: 60, duty_end_ref_tz: 60 }],
    ])
  })

  assert.deepEqual(result, [
    { crew_id: 'C2', pairing_id: 7001, duty_seq: 1, duty_ref_tz: 60, duty_end_ref_tz: 60 },
    { crew_id: 'C1', pairing_id: 7002, duty_seq: 1, duty_ref_tz: -180, duty_end_ref_tz: -180 },
    { crew_id: 'C1', pairing_id: 7001, duty_seq: 1, duty_ref_tz: -240, duty_end_ref_tz: -210 },
    { crew_id: 'C1', pairing_id: 7001, duty_seq: 1, duty_ref_tz: -240, duty_end_ref_tz: -210 },
  ])
})
