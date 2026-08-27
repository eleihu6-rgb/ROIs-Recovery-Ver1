import { describe, expect, it } from 'vitest'

import { groupRuleConfirmViolations } from '../rule-confirm-groups'
import type { RuleViolation } from '../../../stores/rule-check-store'

const violation = (overrides: Partial<RuleViolation>): RuleViolation => ({
  ruleCode: '8030',
  ruleName: '8030/001',
  message: 'Row 1: Pilot aged 58 on flight 605 (2026-09-07) carrying 2 crew aged 50+ (limit 1).',
  severity: 1,
  canOverride: true,
  isNew: true,
  crewId: '2314',
  targetId: '15629',
  targetType: 'pairing',
  windowStartDt: '2026-08-10T12:00:00.000Z',
  flightId: 77370,
  ...overrides,
})

describe('groupRuleConfirmViolations', () => {
  it('groups matching 8030 findings by flightId across pairings (message shows flt_num + local date)', () => {
    const groups = groupRuleConfirmViolations([
      violation({ crewId: '2314', targetId: '15629', flightId: 77370 }),
      violation({
        crewId: '264',
        targetId: '15630',
        flightId: 77370,
        message: 'Row 1: Pilot aged 51 on flight 605 (2026-09-07) carrying 2 crew aged 50+ (limit 1).',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      ruleCode: '8030',
      ruleName: '8030/001',
      message: 'Row 1: Flight 605 (2026-09-07) carrying 2 crew aged 50+ (limit 1).',
      members: [
        { crewId: '2314', age: 58 },
        { crewId: '264', age: 51 },
      ],
    })
  })

  it('does not merge different flightIds that share the same flt_num label', () => {
    const groups = groupRuleConfirmViolations([
      violation({
        crewId: '2314',
        flightId: 100,
        windowStartDt: '2026-08-10T08:00:00.000Z',
        message: 'Row 1: Pilot aged 58 on flight 605 carrying 2 crew aged 50+ (limit 1).',
      }),
      violation({
        crewId: '264',
        flightId: 200,
        windowStartDt: '2026-08-10T08:00:00.000Z',
        message: 'Row 1: Pilot aged 51 on flight 605 carrying 2 crew aged 50+ (limit 1).',
      }),
    ])

    // Same start → keep smaller flightId only (first-flight filter).
    expect(groups).toHaveLength(1)
    expect(groups[0].members).toEqual([{ crewId: '2314', age: 58 }])
  })

  it('keeps only the earliest-windowStartDt flight when multiple flights violate', () => {
    const groups = groupRuleConfirmViolations([
      violation({
        crewId: '2314',
        targetId: '100',
        flightId: 90001,
        windowStartDt: '2026-08-12T10:00:00.000Z',
        message: 'Row 1: Pilot aged 58 on flight 901 (2026-08-12) carrying 2 crew aged 50+ (limit 1).',
      }),
      violation({
        crewId: '264',
        targetId: '101',
        flightId: 90001,
        windowStartDt: '2026-08-12T10:00:00.000Z',
        message: 'Row 1: Pilot aged 51 on flight 901 (2026-08-12) carrying 2 crew aged 50+ (limit 1).',
      }),
      violation({
        crewId: '300',
        targetId: '200',
        flightId: 80001,
        windowStartDt: '2026-08-10T08:00:00.000Z',
        message: 'Row 1: Pilot aged 55 on flight 801 (2026-08-10) carrying 2 crew aged 50+ (limit 1).',
      }),
      violation({
        crewId: '301',
        targetId: '201',
        flightId: 80001,
        windowStartDt: '2026-08-10T08:00:00.000Z',
        message: 'Row 1: Pilot aged 52 on flight 801 (2026-08-10) carrying 2 crew aged 50+ (limit 1).',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      message: 'Row 1: Flight 801 (2026-08-10) carrying 2 crew aged 50+ (limit 1).',
      members: [
        { crewId: '300', age: 55 },
        { crewId: '301', age: 52 },
      ],
    })
  })

  it('preserves existing message-level deduplication for other rules', () => {
    const groups = groupRuleConfirmViolations([
      violation({
        ruleCode: '7504',
        ruleName: '7504/001',
        message: 'Min rest soft advisory.',
        flightId: null,
      }),
      violation({
        ruleCode: '7504',
        ruleName: '7504/001',
        message: 'Min rest soft advisory.',
        crewId: '264',
        flightId: null,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      ruleCode: '7504',
      message: 'Min rest soft advisory.',
      members: [],
    })
  })
})
