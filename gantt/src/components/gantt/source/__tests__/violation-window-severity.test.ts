import { describe, expect, it } from 'vitest'
import {
  buildLiveViolationMapForTest,
  buildLiveCrewViolationSeverityMapForTest,
} from '../live-gantt-source'
import {
  buildScenarioViolationMapForTest,
  buildScenarioCrewViolationSeverityMapForTest,
} from '../scenario-gantt-source'
import type { RosterItem } from '@/types'
import type { DisplayViolation } from '@/stores/session-violation-store'
import type { RuleViolation } from '@/types/rule-check'

const item = (id: number, crewId: string, pairingId: number): RosterItem => ({
  id,
  crewId,
  pairingId,
  assignmentGroup: 'FLY',
  assignment: 'FLY',
  schStrDtUtc: '2026-06-20T00:00:00.000Z',
  schEndDtUtc: '2026-06-20T12:00:00.000Z',
  fltId: null,
  dutySeq: null,
  segSeq: null,
  flightActingRank: null,
  rosterActingRank: null,
  division: null,
  base: null,
  position: null,
  dutyActCreditedMinutes: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
} as RosterItem)

describe('effective-window violation severity maps', () => {
  it('lights crew severity without creating a fake task badge when anchor pairing is not visible', () => {
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [item(1, '2380', 62001)]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[62001, [item(1, '2380', 62001)]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71301, [{
        source: 'persisted',
        crewId: '2380',
        pairingId: 71301,
        ruleCode: '8002',
        ruleInstance: '001',
        ruleName: '8002',
        passed: false,
        severity: 3,
        actualValue: 3660,
        limitValue: 3600,
        unit: 'MINUTE',
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
        windowStartDt: '2026-06-16T00:00:00.000Z',
        windowEndDt: '2026-07-13T00:00:00.000Z',
      }]],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.size).toBe(0)
    expect(crewMap.get('2380')).toBe(3)
  })

  it('still creates a task badge when the anchor pairing is visible', () => {
    const visible = item(7, '2380', 71301)
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71301, [visible]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71301, [{
        source: 'persisted',
        crewId: '2380',
        pairingId: 71301,
        ruleCode: '8002',
        ruleInstance: '001',
        ruleName: '8002',
        passed: false,
        severity: 3,
        actualValue: 3660,
        limitValue: 3600,
        unit: 'MINUTE',
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window.',
      }]],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.get(7)).toBe(3)
    expect(crewMap.get('2380')).toBe(3)
  })

  it('lights Scenario crew severity without creating a fake task badge when anchor pairing is not visible', () => {
    const itemsByCrew = new Map<string, RosterItem[]>([['C0001', [item(1, 'C0001', 62001)]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[62001, [item(1, 'C0001', 62001)]]])
    const violations = new Map<string, RuleViolation[]>([
      ['pairing:71301', [{
        crewId: 'C0001',
        anchorPairingId: 71301,
        targetType: 'pairing',
        targetId: 71301,
        source: 'pairing',
        ruleCode: '8002',
        ruleName: '8002/001',
        severity: 3,
        canOverride: false,
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
        windowStartDt: '2026-06-16T00:00:00.000Z',
        windowEndDt: '2026-07-13T00:00:00.000Z',
      }]],
    ])

    const taskMap = buildScenarioViolationMapForTest(violations, itemsByCrew, itemsByPairingId)
    const crewMap = buildScenarioCrewViolationSeverityMapForTest(violations)

    expect(taskMap.size).toBe(0)
    expect(crewMap.get('C0001')).toBe(3)
  })

  it('7505 lights crew bell but does not create a puck badge when anchor pairing is visible', () => {
    const visible = item(7, '2380', 71301)
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71301, [visible]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71301, [{
        source: 'persisted',
        crewId: '2380',
        pairingId: 71301,
        ruleCode: '7505',
        ruleInstance: '001',
        ruleName: '7505',
        passed: false,
        severity: 1,
        actualValue: 2,
        limitValue: 4,
        unit: 'DAY',
        message: 'The number of days off(2) must be at least 4 in 1 RP (2026-06-01, 2026-06-30).',
      }]],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.get(7) ?? 0).toBe(0)
    expect(crewMap.get('2380')).toBe(1)
  })

  it('7508 lights crew bell but does not create a puck badge when anchor pairing is visible', () => {
    const visible = item(8, '2380', 71302)
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71302, [visible]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71302, [{
        source: 'persisted',
        crewId: '2380',
        pairingId: 71302,
        ruleCode: '7508',
        ruleInstance: '001',
        ruleName: '7508',
        passed: false,
        severity: 1,
        actualValue: 10,
        limitValue: 12,
        unit: 'RH',
        message: 'Rest between duties is below the minimum.',
      }]],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.get(8) ?? 0).toBe(0)
    expect(crewMap.get('2380')).toBe(1)
  })

  it('7501 Sep window does not paint ! on Aug nearest-FLY anchor pairing (crew 923 shape)', () => {
    const aug = {
      ...item(1006548, '923', 16693),
      schStrDtUtc: '2026-08-27T13:00:00.000Z',
      schEndDtUtc: '2026-08-27T16:55:00.000Z',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['923', [aug]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[16693, [aug]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [16693, [{
        source: 'persisted',
        crewId: '923',
        pairingId: 16693,
        ruleCode: '7501',
        ruleInstance: '001',
        ruleName: '7501',
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

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.get(1006548) ?? 0).toBe(0)
    expect(crewMap.get('923')).toBe(1)
  })

  it('7501 paints ! on all in-window FLY pairings for the crew (2438 shape)', () => {
    const a1 = {
      ...item(11, '2438', 15676),
      schStrDtUtc: '2026-08-11T15:15:00.000Z',
      schEndDtUtc: '2026-08-11T19:00:00.000Z',
    }
    const b1 = {
      ...item(13, '2438', 15806),
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['2438', [a1, b1]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [15676, [a1]],
      [15806, [b1]],
    ])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [15806, [{
        source: 'persisted',
        crewId: '2438',
        pairingId: 15806,
        ruleCode: '7501',
        ruleInstance: '001',
        ruleName: '7501',
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

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    expect(taskMap.get(11)).toBe(1)
    expect(taskMap.get(13)).toBe(1)
  })

  it('7501 Scenario map paints all in-window FLY pairings for the crew', () => {
    const a1 = {
      ...item(11, '2438', 15676),
      schStrDtUtc: '2026-08-11T15:15:00.000Z',
      schEndDtUtc: '2026-08-11T19:00:00.000Z',
    }
    const b1 = {
      ...item(13, '2438', 15806),
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['2438', [a1, b1]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [15676, [a1]],
      [15806, [b1]],
    ])
    const violations = new Map<string, RuleViolation[]>([
      ['pairing:15806', [{
        crewId: '2438',
        anchorPairingId: 15806,
        targetType: 'pairing',
        targetId: 15806,
        source: 'roster',
        ruleCode: '7501',
        ruleName: '7501/001',
        severity: 1,
        canOverride: false,
        message: 'Single day free from duty (0) must be at least 1 in 168 RH.',
        windowStartDt: '2026-08-09T06:31:00.000Z',
        windowEndDt: '2026-08-16T06:31:00.000Z',
      }]],
    ])

    const taskMap = buildScenarioViolationMapForTest(violations, itemsByCrew, itemsByPairingId)
    expect(taskMap.get(11)).toBe(1)
    expect(taskMap.get(13)).toBe(1)
  })

  it('7501 preserves an overlapping non-FLY anchor while expanding to FLY siblings', () => {
    const flySibling = {
      ...item(11, '2438', 15676),
      schStrDtUtc: '2026-08-11T15:15:00.000Z',
      schEndDtUtc: '2026-08-11T19:00:00.000Z',
    }
    const simAnchor = {
      ...item(13, '2438', 15806),
      assignmentGroup: 'SIM',
      assignment: 'SIM',
      schStrDtUtc: '2026-08-13T15:15:00.000Z',
      schEndDtUtc: '2026-08-13T19:00:00.000Z',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['2438', [flySibling, simAnchor]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [15676, [flySibling]],
      [15806, [simAnchor]],
    ])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [15806, [{
        source: 'persisted',
        crewId: '2438',
        pairingId: 15806,
        ruleCode: '7501',
        ruleInstance: '001',
        ruleName: '7501',
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
    const scenarioViolations = new Map<string, RuleViolation[]>([
      ['pairing:15806', [{
        crewId: '2438',
        anchorPairingId: 15806,
        targetType: 'pairing',
        targetId: 15806,
        source: 'roster',
        ruleCode: '7501',
        ruleName: '7501/001',
        severity: 1,
        canOverride: false,
        message: 'Single day free from duty (0) must be at least 1 in 168 RH.',
        windowStartDt: '2026-08-09T06:31:00.000Z',
        windowEndDt: '2026-08-16T06:31:00.000Z',
      }]],
    ])

    const liveMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const scenarioMap = buildScenarioViolationMapForTest(scenarioViolations, itemsByCrew, itemsByPairingId)

    expect(liveMap.get(11)).toBe(1)
    expect(liveMap.get(13)).toBe(1)
    expect(scenarioMap.get(11)).toBe(1)
    expect(scenarioMap.get(13)).toBe(1)
  })

  it('7505 does not suppress co-located puck rules on the same Live pairing', () => {
    const visible = item(7, '2380', 71301)
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71301, [visible]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71301, [
        {
          source: 'persisted',
          crewId: '2380',
          pairingId: 71301,
          ruleCode: '7505',
          ruleInstance: '001',
          ruleName: '7505',
          passed: false,
          severity: 1,
          actualValue: 2,
          limitValue: 4,
          unit: 'DAY',
          message: 'The number of days off(2) must be at least 4 in 1 RP.',
        },
        {
          source: 'persisted',
          crewId: '2380',
          pairingId: 71301,
          ruleCode: '8002',
          ruleInstance: '001',
          ruleName: '8002',
          passed: false,
          severity: 3,
          actualValue: 3660,
          limitValue: 3600,
          unit: 'MINUTE',
          message: 'Cumulative block exceeds limit.',
        },
      ]],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.get(7)).toBe(3)
    expect(crewMap.get('2380')).toBe(3)
  })

  it('Scenario 7505 lights crew severity without a puck badge; co-located 8002 still paints', () => {
    const visible = item(1, 'C0001', 71301)
    const itemsByCrew = new Map<string, RosterItem[]>([['C0001', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71301, [visible]]])
    const only7505 = new Map<string, RuleViolation[]>([
      ['pairing:71301', [{
        crewId: 'C0001',
        targetType: 'pairing',
        targetId: 71301,
        ruleCode: '7505',
        ruleName: '7505/001',
        severity: 1,
        canOverride: false,
        message: 'The number of days off(2) must be at least 4 in 1 RP.',
      }]],
    ])
    const both = new Map<string, RuleViolation[]>([
      ['pairing:71301', [
        {
          crewId: 'C0001',
          targetType: 'pairing',
          targetId: 71301,
          ruleCode: '7505',
          ruleName: '7505/001',
          severity: 1,
          canOverride: false,
          message: 'The number of days off(2) must be at least 4 in 1 RP.',
        },
        {
          crewId: 'C0001',
          targetType: 'pairing',
          targetId: 71301,
          ruleCode: '8002',
          ruleName: '8002/001',
          severity: 3,
          canOverride: false,
          message: 'Cumulative block exceeds limit.',
        },
      ]],
    ])

    expect(buildScenarioViolationMapForTest(only7505, itemsByCrew, itemsByPairingId).size).toBe(0)
    expect(buildScenarioCrewViolationSeverityMapForTest(only7505).get('C0001')).toBe(1)
    expect(buildScenarioViolationMapForTest(both, itemsByCrew, itemsByPairingId).get(1)).toBe(3)
  })

  it('Scenario 7508 lights crew severity without a puck badge; co-located 8002 still paints', () => {
    const visible = item(1, 'C0001', 71301)
    const itemsByCrew = new Map<string, RosterItem[]>([['C0001', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71301, [visible]]])
    const only7508 = new Map<string, RuleViolation[]>([
      ['pairing:71301', [{
        crewId: 'C0001',
        targetType: 'pairing',
        targetId: 71301,
        ruleCode: '7508',
        ruleName: '7508/001',
        severity: 1,
        canOverride: false,
        message: 'Rest between duties is below the minimum.',
      }]],
    ])
    const with8002 = new Map<string, RuleViolation[]>([
      ['pairing:71301', [
        {
          crewId: 'C0001',
          targetType: 'pairing',
          targetId: 71301,
          ruleCode: '7508',
          ruleName: '7508/001',
          severity: 1,
          canOverride: false,
          message: 'Rest between duties is below the minimum.',
        },
        {
          crewId: 'C0001',
          targetType: 'pairing',
          targetId: 71301,
          ruleCode: '8002',
          ruleName: '8002/001',
          severity: 3,
          canOverride: false,
          message: 'Cumulative block exceeds limit.',
        },
      ]],
    ])

    expect(buildScenarioViolationMapForTest(only7508, itemsByCrew, itemsByPairingId).size).toBe(0)
    expect(buildScenarioCrewViolationSeverityMapForTest(only7508).get('C0001')).toBe(1)
    expect(buildScenarioViolationMapForTest(with8002, itemsByCrew, itemsByPairingId).get(1)).toBe(3)
    expect(buildScenarioCrewViolationSeverityMapForTest(with8002).get('C0001')).toBe(3)
  })

  it('crew-target 7305 paints only in-window pucks (Live + Scenario; 13645 shape)', () => {
    const inWindow = {
      ...item(101, '13645', 138722),
      schStrDtUtc: '2026-09-03T07:00:00.000Z',
      schEndDtUtc: '2026-09-03T19:00:00.000Z',
      assignmentGroup: 'RES',
      assignment: 'CRAM',
    }
    const outOfWindow = {
      ...item(202, '13645', 138759),
      schStrDtUtc: '2026-09-21T14:00:00.000Z',
      schEndDtUtc: '2026-09-22T02:00:00.000Z',
      assignmentGroup: 'RES',
      assignment: 'CRPM',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['13645', [inWindow, outOfWindow]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [138722, [inWindow]],
      [138759, [outOfWindow]],
    ])
    const win = {
      windowStartDt: '2026-08-31T07:00:00.000Z',
      windowEndDt: '2026-09-05T19:00:00.000Z',
    }

    const liveRuleViolations = new Map<string, RuleViolation[]>([
      ['crew:13645', [{
        crewId: '13645',
        targetType: 'crew',
        targetId: '13645',
        ruleCode: '7305',
        ruleName: '7305/001',
        severity: 2,
        canOverride: true,
        message: 'The number of consecutive roster days (6) [2026-08-31, 2026-09-05] exceeds the threshold (5).',
        ...win,
      }]],
    ])
    const liveTaskMap = buildLiveViolationMapForTest(
      liveRuleViolations,
      new Map(),
      itemsByPairingId,
      itemsByCrew,
    )
    expect(liveTaskMap.get(101)).toBe(2)
    expect(liveTaskMap.get(202) ?? 0).toBe(0)

    const scenarioViolations = new Map<string, RuleViolation[]>([
      ['crew:13645', [{
        crewId: '13645',
        targetType: 'crew',
        targetId: '13645',
        ruleCode: '7305',
        ruleName: '7305/001',
        severity: 2,
        canOverride: true,
        message: 'The number of consecutive roster days (6) [2026-08-31, 2026-09-05] exceeds the threshold (5).',
        ...win,
      }]],
    ])
    const scenarioTaskMap = buildScenarioViolationMapForTest(
      scenarioViolations,
      itemsByCrew,
      itemsByPairingId,
    )
    const scenarioCrewMap = buildScenarioCrewViolationSeverityMapForTest(scenarioViolations)
    expect(scenarioTaskMap.get(101)).toBe(2)
    expect(scenarioTaskMap.get(202) ?? 0).toBe(0)
    expect(scenarioCrewMap.get('13645')).toBe(2)
  })

  it('pairing-anchored 7305 paints all in-window duties (13626 shape), not only the first pairing', () => {
    const d5 = {
      ...item(5, '13626', 138726),
      schStrDtUtc: '2026-09-05T07:00:00.000Z',
      schEndDtUtc: '2026-09-05T19:00:00.000Z',
      assignmentGroup: 'RES',
      assignment: 'CRAM',
    }
    const d6 = {
      ...item(6, '13626', 138729),
      schStrDtUtc: '2026-09-06T14:00:00.000Z',
      schEndDtUtc: '2026-09-07T02:00:00.000Z',
      assignmentGroup: 'RES',
      assignment: 'CRPM',
    }
    const d10 = {
      ...item(10, '13626', 138736),
      schStrDtUtc: '2026-09-10T07:00:00.000Z',
      schEndDtUtc: '2026-09-10T19:00:00.000Z',
      assignmentGroup: 'RES',
      assignment: 'CRAM',
    }
    const after = {
      ...item(99, '13626', 138740),
      schStrDtUtc: '2026-09-12T07:00:00.000Z',
      schEndDtUtc: '2026-09-12T19:00:00.000Z',
      assignmentGroup: 'RES',
      assignment: 'CRAM',
    }
    const itemsByCrew = new Map<string, RosterItem[]>([['13626', [d5, d6, d10, after]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [138726, [d5]],
      [138729, [d6]],
      [138736, [d10]],
      [138740, [after]],
    ])
    const win = {
      windowStartDt: '2026-09-05T07:00:00.000Z',
      windowEndDt: '2026-09-10T19:00:00.000Z',
    }
    const scenarioViolations = new Map<string, RuleViolation[]>([
      ['pairing:138726', [{
        crewId: '13626',
        targetType: 'pairing',
        targetId: 138726,
        anchorPairingId: 138726,
        ruleCode: '7305',
        ruleName: '7305/001',
        severity: 2,
        canOverride: true,
        message: 'The number of consecutive roster days (6) [2026-09-05, 2026-09-10] exceeds the threshold (5).',
        ...win,
      }]],
    ])
    const scenarioTaskMap = buildScenarioViolationMapForTest(
      scenarioViolations,
      itemsByCrew,
      itemsByPairingId,
    )
    expect(scenarioTaskMap.get(5)).toBe(2)
    expect(scenarioTaskMap.get(6)).toBe(2)
    expect(scenarioTaskMap.get(10)).toBe(2)
    expect(scenarioTaskMap.get(99) ?? 0).toBe(0)

    const displayViolations = new Map<number, DisplayViolation[]>([
      [138726, [{
        source: 'persisted',
        crewId: '13626',
        pairingId: 138726,
        ruleCode: '7305',
        ruleInstance: '001',
        ruleName: '7305',
        passed: false,
        severity: 2,
        actualValue: 6,
        limitValue: 5,
        unit: 'DAY',
        message: 'The number of consecutive roster days (6) [2026-09-05, 2026-09-10] exceeds the threshold (5).',
        windowStartDt: win.windowStartDt,
        windowEndDt: win.windowEndDt,
      }]],
    ])
    const liveTaskMap = buildLiveViolationMapForTest(
      new Map(),
      displayViolations,
      itemsByPairingId,
      itemsByCrew,
    )
    expect(liveTaskMap.get(5)).toBe(2)
    expect(liveTaskMap.get(6)).toBe(2)
    expect(liveTaskMap.get(10)).toBe(2)
    expect(liveTaskMap.get(99) ?? 0).toBe(0)
  })

  it('Scenario pairing violation does not light another crew sharing the same pairing (no false gutter bell)', () => {
    // Owner 2080 has 1001 on pairing 15234; crew 390 also flies that pairing but has 0 own violations.
    const ownerTask = item(10, '2080', 15234)
    const otherTask = item(20, '390', 15234)
    const itemsByCrew = new Map<string, RosterItem[]>([
      ['2080', [ownerTask]],
      ['390', [otherTask]],
    ])
    const itemsByPairingId = new Map<number, RosterItem[]>([
      [15234, [ownerTask, otherTask]],
    ])
    const violations = new Map<string, RuleViolation[]>([
      ['pairing:15234', [{
        crewId: '2080',
        targetType: 'pairing',
        targetId: 15234,
        ruleCode: '1001',
        ruleName: '1001/001',
        severity: 3,
        canOverride: false,
        message: 'Assignment overlap is not allowed between DO and FLY.',
      }]],
    ])

    const taskMap = buildScenarioViolationMapForTest(violations, itemsByCrew, itemsByPairingId)
    const crewMap = buildScenarioCrewViolationSeverityMapForTest(violations)

    expect(taskMap.get(10)).toBe(3)
    expect(taskMap.get(20) ?? 0).toBe(0)
    expect(crewMap.get('2080')).toBe(3)
    expect(crewMap.get('390')).toBeUndefined()
  })

  it('out-of-window March 1001 does not light Scenario crew bell for an August official period', async () => {
    const { calendarDateFromYmd, filterViolationsToDisplayWindow } = await import('@/utils/violation-display-window')
    const raw = [{
      crew_id: '1462',
      pairing_id: 0,
      duty_seq: null,
      rule_code: '1001',
      rule_instance: '001',
      severity: 3,
      actual_value: null,
      limit_value: null,
      unit: null,
      message: 'overlap',
      start_dt: '2026-03-07T07:59:00.000Z',
      end_dt: '2026-03-07T07:59:59.000Z',
      window_start_dt: null,
      window_end_dt: null,
    }]
    const inWindow = filterViolationsToDisplayWindow(
      raw,
      calendarDateFromYmd('2026-08-01'),
      calendarDateFromYmd('2026-08-31'),
    )
    expect(inWindow).toHaveLength(0)

    // Mimic store keying after filter: empty raw → no crew severity.
    const keyed = new Map<string, RuleViolation[]>()
    expect(buildScenarioCrewViolationSeverityMapForTest(keyed).get('1462')).toBeUndefined()
  })
})
