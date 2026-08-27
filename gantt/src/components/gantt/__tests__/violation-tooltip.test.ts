import { describe, expect, it } from 'vitest'
import {
  collectViolationTooltipEntriesForTest,
  formatViolationRuleLabel,
} from '../violation-tooltip'
import type { DisplayViolation } from '@/stores/session-violation-store'
import type { RosterItem } from '@/types'
import type { RuleViolation } from '@/types/rule-check'

const rosterItem = (id: number, crewId: string, pairingId: number): RosterItem => ({
  id,
  crewId,
  pairingId,
  ver: 1,
  base: 'YYC',
  label: null,
  assignmentGroup: 'FLY',
  assignment: 'FLY',
  role: null,
  subRole: null,
  source: null,
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-06-20T00:00:00.000Z',
  schEndDtUtc: '2026-06-20T12:00:00.000Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: null,
  fltDt: null,
  dutySeq: null,
  segSeq: null,
  division: null,
  flightActingRank: 'CA',
  rosterActingRank: null,
  activeRank: null,
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  dutyActCreditedMinutes: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
})

const violation = (
  pairingId: number,
  ruleCode: string,
  message: string,
  crewId = '2380',
): DisplayViolation => ({
  source: 'persisted',
  crewId,
  pairingId,
  ruleCode,
  ruleName: ruleCode,
  ruleInstance: '001',
  passed: false,
  severity: ruleCode === '8002' ? 3 : 2,
  actualValue: 1,
  limitValue: 0,
  unit: 'COUNT',
  message,
})

describe('formatViolationRuleLabel', () => {
  it('does not double-append ruleInstance when ruleName is already code/instance', () => {
    expect(formatViolationRuleLabel({
      ruleCode: '7505',
      ruleName: '7505/001',
      ruleInstance: '001',
    })).toBe('7505/001')
  })

  it('formats persisted-style rows as code/instance', () => {
    expect(formatViolationRuleLabel({
      ruleCode: '8002',
      ruleName: '8002',
      ruleInstance: '001',
    })).toBe('8002/001')
  })

  it('falls back to ruleName when ruleInstance is absent', () => {
    expect(formatViolationRuleLabel({
      ruleCode: '8002',
      ruleName: '8002/007',
      ruleInstance: null,
    })).toBe('8002/007')
  })
})

describe('ViolationTooltip aggregation', () => {
  it('includes crew-owned display violations whose anchor pairing is outside the visible roster items', () => {
    const entries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: null,
      hoveredCrewId: '2380',
      violations: new Map(),
      displayViolations: new Map([
        [62001, [violation(62001, '7501', 'Only 0 single-day-free-from-duty in the 168 RH window')]],
        [13429, [violation(13429, '8002', 'Cumulative block exceeds 60h in the 28-day window')]],
      ]),
      items: [rosterItem(1, '2380', 62001)],
    })

    expect(entries.map((entry) => entry.ruleCode)).toEqual(['8002', '7501'])
  })

  it('includes scenario crew-owned violations from the scenario violation store', () => {
    const scenarioViolations = new Map<string, RuleViolation[]>([
      ['pairing:12293', [{
        ruleCode: '8002',
        ruleName: '8002/007',
        severity: 3,
        canOverride: false,
        message: 'Cumulative block 7.5h exceeds 2h in the 1-day window',
        targetType: 'pairing',
        targetId: 12293,
        crewId: '13428',
      }]],
      ['pairing:11688', [{
        ruleCode: '8056',
        ruleName: '8056/004',
        severity: 2,
        canOverride: true,
        message: 'Rest between duties is below the required minimum',
        targetType: 'pairing',
        targetId: 11688,
        crewId: '13428',
      }]],
    ])

    const entries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: null,
      hoveredCrewId: '13428',
      violations: new Map(),
      displayViolations: new Map(),
      scenarioViolations,
      items: [],
    })

    expect(entries.map((entry) => entry.ruleCode)).toEqual(['8002', '8056'])
  })

  it('includes scenario roster/pairing/crew puck violations for the hovered task crew', () => {
    const scenarioViolations = new Map<string, RuleViolation[]>([
      ['roster:9001', [{
        ruleCode: '7501',
        ruleName: '7501/001',
        severity: 2,
        canOverride: false,
        message: 'Roster duty violates the single-day-free-from-duty requirement',
        targetType: 'roster',
        targetId: 9001,
        crewId: '13428',
      }]],
      ['pairing:12293', [{
        ruleCode: '8002',
        ruleName: '8002/007',
        severity: 3,
        canOverride: false,
        message: 'Cumulative block 7.5h exceeds 2h in the 1-day window',
        targetType: 'pairing',
        targetId: 12293,
        crewId: '13428',
      }]],
      ['crew:13428', [{
        ruleCode: '8056',
        ruleName: '8056/004',
        severity: 2,
        canOverride: true,
        message: 'Rest between duties is below the required minimum',
        targetType: 'crew',
        targetId: 13428,
        crewId: '13428',
      }]],
      ['pairing:77777', [{
        ruleCode: '9999',
        ruleName: '9999/001',
        severity: 3,
        canOverride: false,
        message: 'Different crew violation must not appear',
        targetType: 'pairing',
        targetId: 77777,
        crewId: '99999',
      }]],
    ])

    const entries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: 9001,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations: new Map(),
      scenarioViolations,
      items: [rosterItem(9001, '13428', 12293)],
    })

    // Crew-target with no paint window still surfaces on the puck (legacy); other crews stay out.
    expect(entries.map((entry) => entry.ruleCode)).toEqual(['8002', '7501', '8056'])
  })

  it('omits crew-bell-only 7505 from puck hover but keeps it on crew-header hover', () => {
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71301, [
        violation(71301, '7505', 'The number of days off(2) must be at least 4 in 1 RP.'),
        violation(71301, '8002', 'Cumulative block exceeds limit.'),
      ]],
    ])
    const items = [rosterItem(7, '2380', 71301)]

    const puckEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: 7,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations,
      items,
    })
    expect(puckEntries.map((e) => e.ruleCode)).toEqual(['8002'])

    const crewEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: null,
      hoveredCrewId: '2380',
      violations: new Map(),
      displayViolations,
      items,
    })
    expect(crewEntries.map((e) => e.ruleCode)).toEqual(['8002', '7505'])
  })

  it('omits crew-bell-only 7508 from puck hover but keeps it on crew-header hover', () => {
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71302, [
        violation(71302, '7508', 'Rest between duties is below the minimum.'),
        violation(71302, '8002', 'Cumulative block exceeds limit.'),
      ]],
    ])
    const items = [rosterItem(8, '2380', 71302)]

    const puckEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: 8,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations,
      items,
    })
    expect(puckEntries.map((e) => e.ruleCode)).toEqual(['8002'])

    const crewEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: null,
      hoveredCrewId: '2380',
      violations: new Map(),
      displayViolations,
      items,
    })
    expect(crewEntries.map((e) => e.ruleCode)).toEqual(['8002', '7508'])
  })

  it('shows 7501 on non-anchor FLY puck hover when task overlaps the window (2438 shape)', () => {
    const a1 = {
      ...rosterItem(11, '2438', 15676),
      schStrDtUtc: '2026-08-11T15:15:00.000Z',
      schEndDtUtc: '2026-08-11T19:00:00.000Z',
      assignmentGroup: 'FLY',
    }
    const b1 = {
      ...rosterItem(13, '2438', 15806),
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
      assignmentGroup: 'FLY',
    }
    const displayViolations = new Map<number, DisplayViolation[]>([
      [15806, [{
        source: 'persisted',
        crewId: '2438',
        pairingId: 15806,
        ruleCode: '7501',
        ruleName: '7501',
        ruleInstance: '001',
        passed: false,
        severity: 1,
        actualValue: 0,
        limitValue: 1,
        unit: 'RH',
        message: 'Single day free from duty (0) must be at least 1 in 168 RH.',
        startDt: '2026-08-09T06:31:00.000Z',
        endDt: '2026-08-16T06:31:00.000Z',
      }]],
    ])

    const puckEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: 11,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations,
      items: [a1, b1],
    })
    expect(puckEntries.map((e) => e.ruleCode)).toEqual(['7501'])
  })

  it('shows 7501 on an overlapping non-FLY anchor puck', () => {
    const simAnchor = {
      ...rosterItem(13, '2438', 15806),
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
      assignmentGroup: 'SIM',
      assignment: 'SIM',
    }
    const displayViolations = new Map<number, DisplayViolation[]>([
      [15806, [{
        source: 'persisted',
        crewId: '2438',
        pairingId: 15806,
        ruleCode: '7501',
        ruleName: '7501',
        ruleInstance: '001',
        passed: false,
        severity: 1,
        actualValue: 0,
        limitValue: 1,
        unit: 'RH',
        message: 'Single day free from duty (0) must be at least 1 in 168 RH.',
        startDt: '2026-08-09T06:31:00.000Z',
        endDt: '2026-08-16T06:31:00.000Z',
      }]],
    ])

    const puckEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: simAnchor.id,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations,
      items: [simAnchor],
    })

    expect(puckEntries.map((entry) => entry.ruleCode)).toEqual(['7501'])
  })

  it('omits 7501 from Aug puck hover when violation window is Sep (crew 923 shape)', () => {
    const augItem = {
      ...rosterItem(1006548, '923', 16693),
      schStrDtUtc: '2026-08-27T13:00:00.000Z',
      schEndDtUtc: '2026-08-27T16:55:00.000Z',
    }
    const displayViolations = new Map<number, DisplayViolation[]>([
      [16693, [{
        source: 'persisted',
        crewId: '923',
        pairingId: 16693,
        ruleCode: '7501',
        ruleName: '7501',
        ruleInstance: '001',
        passed: false,
        severity: 1,
        actualValue: 0,
        limitValue: 1,
        unit: 'RH',
        message: 'Single day free from duty (0) must be at least 1 in 168 RH (2026-09-19 00:31 .. 2026-09-26 00:31).',
        startDt: '2026-09-19T06:31:00.000Z',
        endDt: '2026-09-26T06:31:00.000Z',
      }]],
    ])

    const puckEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: 1006548,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations,
      items: [augItem],
    })
    expect(puckEntries.map((e) => e.ruleCode)).toEqual([])

    const crewEntries = collectViolationTooltipEntriesForTest({
      hoveredTaskId: null,
      hoveredCrewId: '923',
      violations: new Map(),
      displayViolations,
      items: [augItem],
    })
    expect(crewEntries.map((e) => e.ruleCode)).toEqual(['7501'])
  })

  it('crew-target 7305 puck tooltip respects paint window; crew-header still lists it', () => {
    const inWindow = {
      ...rosterItem(101, '13645', 138722),
      schStrDtUtc: '2026-09-03T07:00:00.000Z',
      schEndDtUtc: '2026-09-03T19:00:00.000Z',
    }
    const outOfWindow = {
      ...rosterItem(202, '13645', 138759),
      schStrDtUtc: '2026-09-21T14:00:00.000Z',
      schEndDtUtc: '2026-09-22T02:00:00.000Z',
    }
    const crew7305: RuleViolation = {
      crewId: '13645',
      targetType: 'crew',
      targetId: '13645',
      ruleCode: '7305',
      ruleName: '7305/001',
      severity: 2,
      canOverride: true,
      message: 'The number of consecutive roster days (6) [2026-08-31, 2026-09-05] exceeds the threshold (5).',
      windowStartDt: '2026-08-31T07:00:00.000Z',
      windowEndDt: '2026-09-05T19:00:00.000Z',
    }
    const violations = new Map<string, RuleViolation[]>([['crew:13645', [crew7305]]])
    const scenarioViolations = new Map<string, RuleViolation[]>([['crew:13645', [crew7305]]])
    const items = [inWindow, outOfWindow]

    expect(collectViolationTooltipEntriesForTest({
      hoveredTaskId: 101,
      hoveredCrewId: null,
      violations,
      displayViolations: new Map(),
      items,
    }).map((e) => e.ruleCode)).toEqual(['7305'])

    expect(collectViolationTooltipEntriesForTest({
      hoveredTaskId: 202,
      hoveredCrewId: null,
      violations,
      displayViolations: new Map(),
      items,
    }).map((e) => e.ruleCode)).toEqual([])

    expect(collectViolationTooltipEntriesForTest({
      hoveredTaskId: 202,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations: new Map(),
      scenarioViolations,
      items,
    }).map((e) => e.ruleCode)).toEqual([])

    expect(collectViolationTooltipEntriesForTest({
      hoveredTaskId: 101,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations: new Map(),
      scenarioViolations,
      items,
    }).map((e) => e.ruleCode)).toEqual(['7305'])

    expect(collectViolationTooltipEntriesForTest({
      hoveredTaskId: null,
      hoveredCrewId: '13645',
      violations,
      displayViolations: new Map(),
      items,
    }).map((e) => e.ruleCode)).toEqual(['7305'])
  })

  it('pairing-anchored 7305 tooltip appears on non-anchor in-window puck (13626 shape)', () => {
    const anchor = {
      ...rosterItem(5, '13626', 138726),
      schStrDtUtc: '2026-09-05T07:00:00.000Z',
      schEndDtUtc: '2026-09-05T19:00:00.000Z',
    }
    const later = {
      ...rosterItem(6, '13626', 138729),
      schStrDtUtc: '2026-09-06T14:00:00.000Z',
      schEndDtUtc: '2026-09-07T02:00:00.000Z',
    }
    const after = {
      ...rosterItem(99, '13626', 138740),
      schStrDtUtc: '2026-09-12T07:00:00.000Z',
      schEndDtUtc: '2026-09-12T19:00:00.000Z',
    }
    const v7305: RuleViolation = {
      crewId: '13626',
      targetType: 'pairing',
      targetId: 138726,
      anchorPairingId: 138726,
      ruleCode: '7305',
      ruleName: '7305/001',
      severity: 2,
      canOverride: true,
      message: 'The number of consecutive roster days (6) [2026-09-05, 2026-09-10] exceeds the threshold (5).',
      windowStartDt: '2026-09-05T07:00:00.000Z',
      windowEndDt: '2026-09-10T19:00:00.000Z',
    }
    const scenarioViolations = new Map<string, RuleViolation[]>([['pairing:138726', [v7305]]])
    const items = [anchor, later, after]

    expect(collectViolationTooltipEntriesForTest({
      hoveredTaskId: 6,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations: new Map(),
      scenarioViolations,
      items,
    }).map((e) => e.ruleCode)).toEqual(['7305'])

    expect(collectViolationTooltipEntriesForTest({
      hoveredTaskId: 99,
      hoveredCrewId: null,
      violations: new Map(),
      displayViolations: new Map(),
      scenarioViolations,
      items,
    }).map((e) => e.ruleCode)).toEqual([])
  })
})
