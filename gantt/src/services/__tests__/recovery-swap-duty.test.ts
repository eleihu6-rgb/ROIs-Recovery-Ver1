import { describe, expect, it } from 'vitest'
import type { RosterItem } from '@/types'
import {
  buildRecoveryPlans,
  visiblePlanGroups,
  type RecoveryAlertSnapshot,
  type RecoveryCrewSnapshot,
} from '@/services/recovery-candidates'

const item = (
  id: number,
  crewId: string,
  pairingId: number | null,
  start: string,
  end: string,
  overrides: Partial<RosterItem> = {},
): RosterItem => ({
  id,
  crewId,
  pairingId,
  ver: 1,
  base: 'PVG',
  depArp: 'PVG',
  arvArp: 'PEK',
  label: pairingId == null ? 'SBY' : `MU${pairingId}`,
  assignmentGroup: pairingId == null ? 'SBY' : 'FLT',
  assignment: pairingId == null ? 'SBY' : 'FLT',
  role: 'CREW',
  subRole: null,
  source: 'MA',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: start,
  schEndDtUtc: end,
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: pairingId == null ? null : id,
  fltDt: start.slice(0, 10),
  dutySeq: 1,
  segSeq: 1,
  division: 'FD',
  fleetCode: 'A320',
  flightActingRank: 'CA',
  rosterActingRank: 'CA',
  activeRank: 'CA',
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  ybh: 0,
  mbh: 0,
  yal: 0,
  mal: 0,
  ydo: 0,
  mdo: 0,
  mcred: 0,
  ...overrides,
})

const crew = (crewId: string, overrides: Partial<RecoveryCrewSnapshot> = {}): RecoveryCrewSnapshot => ({
  crewId,
  crewName: crewId,
  rank: 'CA',
  base: 'PVG',
  division: 'FD',
  annualFlightMinutes: 0,
  fleetQuals: ['A320'],
  ...overrides,
})

const overlapAlert: RecoveryAlertSnapshot = {
  id: 'v-1001',
  ruleCode: '1001',
  severity: 3,
  crewId: 'A',
  pairingId: 100,
  flightDate: '2026-09-05',
  flightNumber: 'MU100',
  detail: 'assignment overlap',
  fleet: 'A320',
  requiredRank: 'CA',
}

const qualificationAlert: RecoveryAlertSnapshot = { ...overlapAlert, id: 'v-8004', ruleCode: '8004' }

// Crew A: SBY 00:00-12:00 overlapping flying Pairing #100 (06:00-10:00).
// Crew B: flying Pairing #200 reporting at 14:00 — later than the SBY end.
const scenarioItems = (candidateOverrides: Partial<RosterItem> = {}, candidateCrewBase = 'PVG'): RosterItem[] => [
  item(1, 'A', null, '2026-09-05T00:00:00.000Z', '2026-09-05T12:00:00.000Z'),
  item(2, 'A', 100, '2026-09-05T06:00:00.000Z', '2026-09-05T10:00:00.000Z'),
  item(3, 'B', 200, '2026-09-05T14:00:00.000Z', '2026-09-05T18:00:00.000Z', {
    base: candidateCrewBase,
    depArp: candidateCrewBase,
    ...candidateOverrides,
  }),
]

const buildPlans = (alert: RecoveryAlertSnapshot, items = scenarioItems()) => buildRecoveryPlans({
  alert,
  items,
  crews: [crew('A'), crew('B')],
  rankOrder: new Map([['CA', 1], ['FO', 2]]),
  now: new Date('2026-09-05T05:00:00.000Z').getTime(),
})

describe('Assignment Overlap (1001) plan set', () => {
  it('shows standby → swap duty → flight delay, in that order', () => {
    const plans = buildPlans(overlapAlert)
    expect(plans.trigger).toBe('assignment-overlap')
    expect(visiblePlanGroups(plans).map((group) => group.id)).toEqual(['standby', 'swap-duty', 'flight-delay'])
  })

  it('does not surface the roster / cross-base groups for an overlap alert', () => {
    const plans = buildPlans(overlapAlert)
    expect(plans.roster.options).toHaveLength(0)
    expect(plans.crossBase.options).toHaveLength(0)
  })

  it('offers a swap duty candidate that reports after the overlapping ground task', () => {
    const plans = buildPlans(overlapAlert)
    const swap = plans.swapDuty.options[0]
    expect(swap?.mode).toBe('swap-duty')
    expect(swap?.targetCrewId).toBe('B')
    expect(swap?.targetPairingId).toBe(200)
    // Apply is intentionally not wired for the new options yet.
    expect(swap?.localExecutable).toBe(false)
  })

  it('keeps a mismatched candidate in the list with the documented reason', () => {
    const plans = buildPlans(overlapAlert, scenarioItems({}, 'YVR'))
    const swap = plans.swapDuty.options[0]
    expect(swap).toBeDefined()
    expect(swap?.localExecutable).toBe(false)
    expect(swap?.reasons).toContain("The return pairing does not match both crews' base, fleet and rank seat.")
  })

  it('drops a candidate whose Pairing reports before the ground task ends', () => {
    const earlyItems = scenarioItems().map((entry) =>
      entry.crewId === 'B'
        ? { ...entry, schStrDtUtc: '2026-09-05T11:00:00.000Z', schEndDtUtc: '2026-09-05T13:00:00.000Z' }
        : entry)
    const plans = buildPlans(overlapAlert, earlyItems)
    expect(plans.swapDuty.options).toHaveLength(0)
  })

  it('offers a Flight Delay option that keeps Crew A and lists its flights', () => {
    const plans = buildPlans(overlapAlert)
    const delay = plans.flightDelay.options[0]
    expect(delay?.mode).toBe('flight-delay')
    expect(delay?.targetCrewId).toBe('A')
    expect(delay?.localExecutable).toBe(false)
    expect(delay?.changes.length).toBeGreaterThan(0)
    expect(delay?.changes.every((change) => change.changeType === 'keep')).toBe(true)
  })
})

describe('8004 plan set', () => {
  it('keeps the original roster / standby / cross-base groups and hides the new ones', () => {
    const plans = buildPlans(qualificationAlert)
    expect(plans.trigger).toBe('roster-qualification')
    expect(visiblePlanGroups(plans).map((group) => group.id)).toEqual(['roster', 'standby', 'cross-base'])
    expect(plans.swapDuty.options).toHaveLength(0)
    expect(plans.flightDelay.options).toHaveLength(0)
  })
})

describe('Assignment Overlap on a finished Roster', () => {
  // crew 113 / 2026-09-08 reviewed on 2026-09-11: the Pairing has already ended,
  // but the 1001 strategy must still produce options (Flight Delay at minimum).
  it('still generates options for an ended Pairing', () => {
    const plans = buildRecoveryPlans({
      alert: overlapAlert,
      items: scenarioItems(),
      crews: [crew('A'), crew('B')],
      rankOrder: new Map([['CA', 1], ['FO', 2]]),
      now: new Date('2026-09-11T00:00:00.000Z').getTime(),
    })
    expect(plans.trigger).toBe('assignment-overlap')
    expect(plans.flightDelay.options).toHaveLength(1)
    expect(plans.flightDelay.options[0].mode).toBe('flight-delay')
  })
})
