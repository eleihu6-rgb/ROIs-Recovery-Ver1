import { describe, expect, it } from 'vitest'
import type { RosterItem } from '@/types'
import { buildRecoveryPlans, recoveryRuleFailures, type RecoveryAlertSnapshot, type RecoveryCrewSnapshot } from '@/services/recovery-candidates'

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

const alert: RecoveryAlertSnapshot = {
  id: 'v-8004',
  ruleCode: '8004',
  severity: 3,
  crewId: 'A',
  pairingId: 100,
  flightDate: '2026-09-05',
  flightNumber: 'MU100',
  detail: 'aircraft qualification mismatch',
  fleet: 'A320',
  requiredRank: 'CA',
}

const range = {
  sourceStart: '2026-09-05T10:00:00.000Z',
  sourceEnd: '2026-09-05T12:00:00.000Z',
  targetStart: '2026-09-05T14:00:00.000Z',
  targetEnd: '2026-09-05T16:00:00.000Z',
}
const testNow = Date.parse('2026-09-05T09:00:00.000Z')

describe('buildRecoveryPlans', () => {
  it('generates cross-base Callout SBY with two DHD half-rings from loaded flights', () => {
    const sourceRange = {
      sourceStart: '2026-09-05T12:00:00.000Z',
      sourceEnd: '2026-09-05T14:00:00.000Z',
    }
    const plans = buildRecoveryPlans({
      alert: { ...alert, flightDate: '2026-09-05' },
      items: [
        item(1, 'A', 100, sourceRange.sourceStart, sourceRange.sourceEnd, { base: 'PVG', fleetCode: 'A320' }),
        item(2, 'B', null, '2026-09-05T10:00:00.000Z', '2026-09-05T22:00:00.000Z', { base: 'BJS' }),
      ],
      crews: [crew('A', { base: 'PVG' }), crew('B', { base: 'BJS' })],
      rankOrder: new Map([['CA', 1]]),
      now: Date.parse('2026-09-05T06:00:00.000Z'),
      flights: [
        { id: 501, fltNum: 'D501', depArp: 'BJS', arvArp: 'PVG', schDepDtUtc: '2026-09-05T08:00:00.000Z', schArvDtUtc: '2026-09-05T10:00:00.000Z', fleet: 'A320', airline: 'MU', blockMinutes: 120 },
        { id: 502, fltNum: 'D502', depArp: 'PVG', arvArp: 'BJS', schDepDtUtc: '2026-09-05T15:00:00.000Z', schArvDtUtc: '2026-09-05T17:00:00.000Z', fleet: 'A320', airline: 'MU', blockMinutes: 120 },
      ],
    })

    const option = plans.crossBase.options.find((candidate) => candidate.mode === 'cross-base-standby')
    expect(option).toMatchObject({ targetCrewId: 'B', localExecutable: true })
    expect(option?.positioning).toMatchObject({ supportBase: 'BJS', recoveryBase: 'PVG', dhdFlightCost: 1920 })
    expect(option?.afterItems.filter((entry) => entry.assignmentGroup === 'DHD')).toHaveLength(2)
    expect(option?.afterItems.find((entry) => entry.id === 2)).toMatchObject({ isCalloutStandby: true })
  })

  it('generates a cross-base full-Roster swap and excludes DHD-window conflicts', () => {
    const plans = buildRecoveryPlans({
      alert,
      items: [
        item(1, 'A', 100, '2026-09-05T12:00:00.000Z', '2026-09-05T14:00:00.000Z', { base: 'PVG', fleetCode: 'A320' }),
        item(2, 'B', 200, '2026-09-05T06:00:00.000Z', '2026-09-05T07:00:00.000Z', { base: 'BJS', fleetCode: 'A320' }),
        item(3, 'C', 201, '2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z', { base: 'BJS', fleetCode: 'A320' }),
        item(4, 'C', 202, '2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z', { base: 'BJS', fleetCode: 'A320' }),
      ],
      crews: [crew('A', { base: 'PVG' }), crew('B', { base: 'BJS' }), crew('C', { base: 'BJS' })],
      rankOrder: new Map([['CA', 1]]),
      now: Date.parse('2026-09-05T06:00:00.000Z'),
      flights: [
        { id: 601, fltNum: 'D601', depArp: 'BJS', arvArp: 'PVG', schDepDtUtc: '2026-09-05T08:00:00.000Z', schArvDtUtc: '2026-09-05T10:00:00.000Z', fleet: 'A320', airline: 'MU', blockMinutes: 120 },
        { id: 602, fltNum: 'D602', depArp: 'PVG', arvArp: 'BJS', schDepDtUtc: '2026-09-05T15:00:00.000Z', schArvDtUtc: '2026-09-05T17:00:00.000Z', fleet: 'A320', airline: 'MU', blockMinutes: 120 },
      ],
    })

    expect(plans.crossBase.options.some((candidate) => candidate.mode === 'cross-base-swap' && candidate.targetPairingId === 200)).toBe(true)
    expect(plans.crossBase.options.some((candidate) => candidate.targetCrewId === 'C' && candidate.targetPairingId === 201)).toBe(false)
  })

  it('uses the source Crew Acting Rank and modifies the source Pairing when that Rank has plan 1', () => {
    const plans = buildRecoveryPlans({
      alert: { ...alert, requiredRank: 'FO' },
      items: [
        item(1001, 'A', 100, '2026-09-05T08:00:00.000Z', '2026-09-05T09:00:00.000Z', { base: 'PVG', depArp: 'PVG', arvArp: 'BJS', assignmentGroup: 'DHD', assignment: 'DHD', segAssignment: 'DHD', dutySeq: 1, rosterActingRank: 'FO', flightActingRank: 'FO' }),
        item(1002, 'A', 100, '2026-09-05T10:00:00.000Z', '2026-09-05T12:00:00.000Z', { base: 'PVG', depArp: 'BJS', arvArp: 'CAN', fleetCode: 'A320', dutySeq: 2, rosterActingRank: 'FO', flightActingRank: 'FO' }),
        item(1003, 'A', 100, '2026-09-05T13:00:00.000Z', '2026-09-05T14:00:00.000Z', { base: 'PVG', depArp: 'CAN', arvArp: 'PVG', assignmentGroup: 'DHD', assignment: 'DHD', segAssignment: 'DHD', dutySeq: 3, rosterActingRank: 'FO', flightActingRank: 'FO' }),
      ],
      crews: [crew('A', { rank: 'FO', base: 'PVG' }), crew('B', { rank: 'FO', base: 'BJS' })],
      rankOrder: new Map([['CA', 1], ['FO', 2]]),
      pairingCompositions: [{ pairingId: 100, actingRank: 'FO', plan: 1 }],
      now: testNow,
    })

    const option = plans.crossBase.options.find((candidate) => candidate.mode === 'cross-base-destination')
    expect(option?.destinationSplit).toMatchObject({
      actingRank: 'FO',
      adjustedPairingBase: 'BJS',
      createsPairing: false,
      createdPairingId: 100,
      middleFlightIds: [1002],
      removedDhdFlightIds: [1001, 1003],
    })
    expect(option?.afterItems).toHaveLength(1)
    expect(option?.afterItems[0]).toMatchObject({ crewId: 'B', pairingId: 100, base: 'BJS', rosterActingRank: 'FO' })
  })

  it('creates a single-position Pairing with the source Crew Acting Rank when its plan exceeds 1', () => {
    const plans = buildRecoveryPlans({
      alert: { ...alert, requiredRank: 'FO' },
      items: [
        item(1001, 'A', 100, '2026-09-05T08:00:00.000Z', '2026-09-05T09:00:00.000Z', { base: 'PVG', depArp: 'PVG', arvArp: 'BJS', assignmentGroup: 'DHD', assignment: 'DHD', segAssignment: 'DHD', dutySeq: 1, rosterActingRank: 'FO', flightActingRank: 'FO' }),
        item(1002, 'A', 100, '2026-09-05T10:00:00.000Z', '2026-09-05T12:00:00.000Z', { base: 'PVG', depArp: 'BJS', arvArp: 'CAN', fleetCode: 'A320', dutySeq: 2, rosterActingRank: 'FO', flightActingRank: 'FO' }),
        item(1003, 'A', 100, '2026-09-05T13:00:00.000Z', '2026-09-05T14:00:00.000Z', { base: 'PVG', depArp: 'CAN', arvArp: 'PVG', assignmentGroup: 'DHD', assignment: 'DHD', segAssignment: 'DHD', dutySeq: 3, rosterActingRank: 'FO', flightActingRank: 'FO' }),
      ],
      crews: [crew('A', { rank: 'FO', base: 'PVG' }), crew('B', { rank: 'FO', base: 'BJS' })],
      rankOrder: new Map([['CA', 1], ['FO', 2]]),
      pairingCompositions: [{ pairingId: 100, actingRank: 'FO', plan: 2 }],
      now: testNow,
    })

    const option = plans.crossBase.options.find((candidate) => candidate.mode === 'cross-base-destination')
    expect(option?.destinationSplit).toMatchObject({ actingRank: 'FO', createsPairing: true })
    expect(option?.destinationSplit?.createdPairingId).toBeLessThan(0)
    expect(option?.afterItems[0]).toMatchObject({ crewId: 'B', rosterActingRank: 'FO' })
    expect(option?.afterItems[0]?.pairingId).toBe(option?.destinationSplit?.createdPairingId)
  })

  it('keeps direct transfer available when the target has no loaded Roster', () => {
    const plans = buildRecoveryPlans({
      alert,
      items: [item(1, 'A', 100, range.sourceStart, range.sourceEnd)],
      crews: [crew('A'), crew('B')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    const option = plans.roster.options.find((candidate) => candidate.mode === 'transfer' && candidate.targetCrewId === 'B')
    expect(option).toMatchObject({ localExecutable: true, targetPairingId: null })
    expect(option?.beforeItems.find((entry) => entry.id === 1)).toMatchObject({ crewId: 'A', isRecoveryAffected: true })
    expect(option?.afterItems.find((entry) => entry.id === 1)).toMatchObject({ crewId: 'B', isRecoveryAffected: true })
  })

  it('filters lower-rank Crew while allowing a same-rank complete-Roster swap', () => {
    const plans = buildRecoveryPlans({
      alert,
      items: [
        item(1, 'A', 100, range.sourceStart, range.sourceEnd),
        item(2, 'B', 200, range.targetStart, range.targetEnd),
        item(3, 'C', 300, range.targetStart, range.targetEnd),
      ],
      crews: [crew('A'), crew('B', { rank: 'FO' }), crew('C')],
      rankOrder: new Map([['CA', 1], ['FO', 2]]),
      now: testNow,
    })

    const lowerRank = plans.roster.options.find((candidate) => candidate.targetCrewId === 'B')
    expect(lowerRank).toBeUndefined()

    const swap = plans.roster.options.find((candidate) => candidate.mode === 'swap' && candidate.targetCrewId === 'C')
    expect(swap).toMatchObject({ localExecutable: true, targetPairingId: 300 })
    expect(swap?.afterItems.filter((entry) => entry.pairingId === 100).every((entry) => entry.crewId === 'C' && entry.isRecoveryAffected)).toBe(true)
    expect(swap?.afterItems.filter((entry) => entry.pairingId === 300).every((entry) => entry.crewId === 'A' && entry.isRecoveryAffected)).toBe(true)
  })

  it('uses inclusive SBY boundaries and retains the marked SBY task in preview', () => {
    const plans = buildRecoveryPlans({
      alert,
      items: [
        item(1, 'A', 100, range.sourceStart, range.sourceEnd),
        item(2, 'B', null, '2026-09-05T10:00:00.000Z', '2026-09-05T18:00:00.000Z'),
      ],
      crews: [crew('A'), crew('B')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    const option = plans.standby.options.find((candidate) => candidate.targetCrewId === 'B')
    expect(option?.localExecutable).toBe(true)
    expect(option?.afterItems.find((entry) => entry.id === 2)).toMatchObject({ crewId: 'B', isCalloutStandby: true })
    expect(option?.beforeItems.find((entry) => entry.id === 1)).toMatchObject({ crewId: 'A', isRecoveryAffected: true })
    expect(option?.afterItems.find((entry) => entry.id === 1)).toMatchObject({ crewId: 'B', isRecoveryAffected: true })
  })

  it('filters non-Callout candidates that overlap any existing Roster task', () => {
    const plans = buildRecoveryPlans({
      alert,
      items: [
        item(1, 'A', 100, range.sourceStart, range.sourceEnd),
        item(2, 'B', null, '2026-09-05T11:00:00.000Z', '2026-09-05T13:00:00.000Z', { assignmentGroup: 'GND', assignment: 'TRN' }),
      ],
      crews: [crew('A'), crew('B')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    expect(plans.roster.options).toHaveLength(0)
  })

  it('allows only the selected SBY task to overlap a Callout recovery', () => {
    const plans = buildRecoveryPlans({
      alert,
      items: [
        item(1, 'A', 100, range.sourceStart, range.sourceEnd),
        item(2, 'B', null, '2026-09-05T10:00:00.000Z', '2026-09-05T18:00:00.000Z'),
        item(3, 'B', null, '2026-09-05T11:00:00.000Z', '2026-09-05T12:30:00.000Z', { assignmentGroup: 'GND', assignment: 'TRN' }),
      ],
      crews: [crew('A'), crew('B')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    expect(plans.standby.options).toHaveLength(0)
  })

  it('rejects a candidate that leaves 8004 on a received Roster or creates any new Rule violation', () => {
    const option = {
      mode: 'transfer' as const,
      sourceCrewId: 'A',
      targetCrewId: 'B',
      sourcePairingId: 100,
      targetPairingId: null,
    }
    const failures = recoveryRuleFailures({
      option,
      before: [{ crewId: 'A', pairingId: 100, ruleCode: '8004', message: 'A is not qualified' }],
      after: [
        { crewId: 'B', pairingId: 100, ruleCode: '8004', message: 'B is not qualified' },
        { crewId: 'B', pairingId: 100, ruleCode: '7501', message: 'New rest violation' },
      ],
    })

    expect(failures).toContain('8004: Crew B remains unqualified for Pairing 100.')
    expect(failures).toContain('7501: New rest violation')
  })

  it('does not treat a partial fleet code as a qualification', () => {
    const plans = buildRecoveryPlans({
      alert: { ...alert, fleet: '7M8' },
      items: [item(1, 'A', 100, range.sourceStart, range.sourceEnd)],
      crews: [crew('A', { fleetQuals: ['7M8'] }), crew('1464', { fleetQuals: ['7M'] })],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    expect(plans.roster.options.some((option) => option.targetCrewId === '1464')).toBe(false)
    expect(plans.standby.options.some((option) => option.targetCrewId === '1464')).toBe(false)
  })

  it('requires every loaded flight fleet in the affected Roster', () => {
    const plans = buildRecoveryPlans({
      alert: { ...alert, fleet: 'A320' },
      items: [
        item(1, 'A', 100, range.sourceStart, range.sourceEnd, { fleetCode: 'A320' }),
        item(2, 'A', 100, range.sourceEnd, '2026-09-05T13:00:00.000Z', { fleetCode: '7M8', segSeq: 2 }),
      ],
      crews: [crew('A', { fleetQuals: ['A320', '7M8'] }), crew('B', { fleetQuals: ['A320'] })],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    expect(plans.roster.options.some((option) => option.targetCrewId === 'B')).toBe(false)
  })

  it('does not generate recovery options for a completed Roster', () => {
    const completedNow = Date.parse(range.sourceEnd) + 1
    const plans = buildRecoveryPlans({
      alert,
      items: [item(1, 'A', 100, range.sourceStart, range.sourceEnd)],
      crews: [crew('A'), crew('B')],
      rankOrder: new Map([['CA', 1]]),
      now: completedNow,
    })

    expect(plans.roster.options).toHaveLength(0)
    expect(plans.standby.options).toHaveLength(0)
    expect(plans.roster.description).toContain('ended')
  })

  it('keeps a Roster whose end equals Now eligible under the strict completed rule', () => {
    const plans = buildRecoveryPlans({
      alert,
      items: [item(1, 'A', 100, range.sourceStart, range.sourceEnd)],
      crews: [crew('A'), crew('B')],
      rankOrder: new Map([['CA', 1]]),
      now: Date.parse(range.sourceEnd),
    })

    expect(plans.roster.options.some((option) => option.targetCrewId === 'B')).toBe(true)
  })

  it('builds complete multi-alert combinations and merges both Preview rosters', () => {
    const secondAlert: RecoveryAlertSnapshot = {
      ...alert,
      id: 'v-8004-second',
      crewId: 'B',
      pairingId: 200,
      flightNumber: 'MU200',
    }
    const plans = buildRecoveryPlans({
      alerts: [alert, secondAlert],
      items: [
        item(1, 'A', 100, '2026-09-05T10:00:00.000Z', '2026-09-05T12:00:00.000Z'),
        item(2, 'B', 200, '2026-09-05T14:00:00.000Z', '2026-09-05T16:00:00.000Z'),
      ],
      crews: [crew('A'), crew('B'), crew('C'), crew('D')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    const combined = plans.roster.options.find((option) => option.subOptions?.some((child) => child.sourceCrewId === 'A' && child.targetCrewId === 'C')
      && option.subOptions?.some((child) => child.sourceCrewId === 'B' && child.targetCrewId === 'D'))
    expect(plans.alerts).toHaveLength(2)
    expect(combined?.subOptions).toHaveLength(2)
    expect(combined?.afterItems.filter((entry) => entry.isRecoveryAffected).map((entry) => entry.crewId)).toEqual(expect.arrayContaining(['C', 'D']))
    expect(combined?.metrics.affectedCrewCount).toBe(4)
  })

  it('filters a combined option when two recovered Rosters overlap on one Crew', () => {
    const secondAlert: RecoveryAlertSnapshot = { ...alert, id: 'v-8004-second', crewId: 'B', pairingId: 200 }
    const plans = buildRecoveryPlans({
      alerts: [alert, secondAlert],
      items: [
        item(1, 'A', 100, '2026-09-05T10:00:00.000Z', '2026-09-05T12:00:00.000Z'),
        item(2, 'B', 200, '2026-09-05T11:00:00.000Z', '2026-09-05T13:00:00.000Z'),
      ],
      crews: [crew('A'), crew('B'), crew('C')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })

    expect(plans.roster.options).toHaveLength(0)
  })

  it('filters a combined option when the same complete Roster is selected twice', () => {
    const secondAlert: RecoveryAlertSnapshot = { ...alert, id: 'v-8004-second', crewId: 'C', pairingId: 300 }
    const singleA = buildRecoveryPlans({
      alert,
      items: [item(1, 'A', 100, range.sourceStart, range.sourceEnd), item(2, 'B', 200, range.targetStart, range.targetEnd), item(3, 'C', 300, '2026-09-05T18:00:00.000Z', '2026-09-05T20:00:00.000Z')],
      crews: [crew('A'), crew('B'), crew('C')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })
    const singleC = buildRecoveryPlans({
      alert: secondAlert,
      items: [item(1, 'A', 100, range.sourceStart, range.sourceEnd), item(2, 'B', 200, range.targetStart, range.targetEnd), item(3, 'C', 300, '2026-09-05T18:00:00.000Z', '2026-09-05T20:00:00.000Z')],
      crews: [crew('A'), crew('B'), crew('C')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })
    const firstSwap = singleA.roster.options.find((option) => option.mode === 'swap' && option.targetCrewId === 'B')
    const secondSwap = singleC.roster.options.find((option) => option.mode === 'swap' && option.targetCrewId === 'A')
    expect(firstSwap).toBeDefined()
    expect(secondSwap).toBeDefined()

    const combined = buildRecoveryPlans({
      alerts: [alert, secondAlert],
      items: [item(1, 'A', 100, range.sourceStart, range.sourceEnd), item(2, 'B', 200, range.targetStart, range.targetEnd), item(3, 'C', 300, '2026-09-05T18:00:00.000Z', '2026-09-05T20:00:00.000Z')],
      crews: [crew('A'), crew('B'), crew('C')],
      rankOrder: new Map([['CA', 1]]),
      now: testNow,
    })
    expect(combined.roster.options.some((option) => option.subOptions?.some((child) => child.id === firstSwap?.id)
      && option.subOptions?.some((child) => child.id === secondSwap?.id))).toBe(false)
  })
})
