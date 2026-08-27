import { describe, expect, it, vi } from 'vitest'
import { buildRosterRows } from '../scenario-result-loader.js'

vi.mock('../../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
  },
}))

const inputSections = {
  crew_base: [{ crew_id: '1001', base: 'YYZ', eff_dt: '2026-06-01' }],
  crew_rank: [{ crew_id: '1001', rank: 'IFD' }],
  pairing: [{
    id: '2001',
    base: 'YYZ',
    assignment_group: 'FLT',
    assignment: 'FLY',
    division: 'CABIN',
  }],
  pairing_segment: [
    {
      pairing_id: '2001',
      flt_id: '3001',
      duty_seq: '1',
      seg_seq: '1',
      flt_dt: '2026-06-04',
      sch_str_dt_utc: '2026-06-04T14:03:00Z',
      sch_end_dt_utc: '2026-06-04T18:04:00Z',
      duty_sch_credited_minutes: '480',
      duty_act_credited_minutes: '485',
    },
    {
      pairing_id: '2001',
      flt_id: '3002',
      duty_seq: '1',
      seg_seq: '2',
      flt_dt: '2026-06-04',
      sch_str_dt_utc: '2026-06-04T19:01:00Z',
      sch_end_dt_utc: '2026-06-04T22:49:00Z',
      duty_sch_credited_minutes: '480',
      duty_act_credited_minutes: '485',
    },
  ],
}

describe('Scenario Award comments transcription', () => {
  it('copies one valid controlled explanation to every segment of the awarded pairing', () => {
    const comments = 'PBS_AWARD_V1|Matched your Tier 3 pairing preferences.'
    const rows = buildRosterRows(inputSections, {
      ASSIGNMENTS: [{
        crew_id: '1001',
        pairing_id: '2001',
        acting_rank: 'IFD',
        source: 'CR',
        comments,
      }],
    }, new Map())

    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.comments === comments)).toBe(true)
  })

  it('stores null for missing, malformed, or ordinary comments', () => {
    for (const comments of [
      '',
      'planner note',
      'PBS_AWARD_V1|Matched your Tier 25 pairing preferences.',
    ]) {
      const rows = buildRosterRows(inputSections, {
        ASSIGNMENTS: [{
          crew_id: '1001',
          pairing_id: '2001',
          acting_rank: 'IFD',
          source: 'CR',
          comments,
        }],
      }, new Map())

      expect(rows.every((row) => row.comments === null)).toBe(true)
    }
  })

  it('rejects duplicate crew and pairing assignments as a structural result error', () => {
    expect(() => buildRosterRows(inputSections, {
      ASSIGNMENTS: [
        { crew_id: '1001', pairing_id: '2001', source: 'CR' },
        { crew_id: '1001', pairing_id: '2001', source: 'CR' },
      ],
    }, new Map())).toThrow(/duplicate ASSIGNMENTS row/)
  })

  it('maps ROSTER.old_id to flying rows and keeps CR duty credit fallback', () => {
    const rows = buildRosterRows(inputSections, {
      ASSIGNMENTS: [{
        crew_id: '1001',
        pairing_id: '2001',
        acting_rank: 'IFD',
        source: 'PA',
      }],
      ROSTER: [{
        crew_id: '1001',
        pairing_id: '2001',
        source: 'PA',
        old_id: '987654',
      }],
    }, new Map())

    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.live_id === 987654)).toBe(true)
    expect(rows.every((row) => row.sch_credited_minutes === 480)).toBe(true)
    expect(rows.every((row) => row.act_credited_minutes === 485)).toBe(true)
  })

  it('maps ROSTER.old_id directly onto ground rows', () => {
    const rows = buildRosterRows(inputSections, {
      ROSTER: [{
        crew_id: '1001',
        pairing_id: '0',
        assignment_group: 'GRD',
        assignment: 'VAC',
        source: 'PA',
        old_id: '12345',
        sch_str_dt_utc: '2026-06-05T00:00:00Z',
        sch_end_dt_utc: '2026-06-06T00:00:00Z',
      }],
    }, new Map([['VAC', 'GRD']]))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      pairing_id: null,
      live_id: 12345,
      assignment_group: 'GRD',
      assignment: 'VAC',
      sch_credited_minutes: null,
      act_credited_minutes: null,
    })
  })
})
