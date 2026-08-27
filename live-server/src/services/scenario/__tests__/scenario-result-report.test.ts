import { describe, expect, it, vi } from 'vitest'

import { buildUncoveredRows } from '../scenario-result-service.js'

vi.mock('../../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
  },
}))

describe('scenario result report rows', () => {
  it('uses Pairing label and UTC schedule boundaries for uncovered rows', () => {
    const rows = buildUncoveredRows(
      {
        pairing: [{
          id: '12875',
          pairing_label: '858',
          base: 'YVR',
          assignment_group: 'FLY',
          sch_str_dt_utc: '2026-07-03T15:30:00Z',
          sch_end_dt_utc: '2026-07-04T18:45:00Z',
        }],
        pairing_composition: [{
          pairing_id: '12875',
          rank: 'CA',
          plan: '1',
          open: '1',
        }],
        pairing_segment: [{
          pairing_id: '12875',
          duty_act_credited_minutes: '630',
        }],
      },
      new Map([['12875', 'FLY']]),
      new Map(),
      new Map(),
      new Map(),
    )

    expect(rows).toEqual([{
      type: 'Pairing',
      pairing_id: '12875',
      task_id: '12875_CA_0',
      name: '858',
      base: 'YVR',
      rank: 'CA',
      start_base: '2026-07-03T15:30:00Z',
      end_base: '2026-07-04T18:45:00Z',
      credit: 10.5,
    }])
  })
})
