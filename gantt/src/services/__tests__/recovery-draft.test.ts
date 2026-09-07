import { describe, expect, it } from 'vitest'
import type { RosterItem } from '@/types'
import { buildRecoveryDraftPlan } from '@/services/recovery-draft'
import type { RecoveryOption } from '@/services/recovery-candidates'

const item = (id: number, crewId: string, pairingId: number | null, assignmentGroup = 'FLT'): RosterItem => ({
  id,
  crewId,
  pairingId,
  ver: 1,
  base: 'PVG',
  label: pairingId == null ? 'SBY' : `FLIGHT-${pairingId}`,
  assignmentGroup,
  assignment: assignmentGroup === 'SBY' ? 'SBY' : 'FLY',
  role: 'CREW',
  subRole: null,
  source: 'MA',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-09-06T10:00:00.000Z',
  schEndDtUtc: '2026-09-06T12:00:00.000Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: pairingId == null ? null : id,
  fltDt: '2026-09-06',
  dutySeq: 1,
  segSeq: 1,
  division: 'P',
  flightActingRank: 'CA',
  rosterActingRank: 'CA',
  activeRank: 'CA',
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
})

const option = (mode: RecoveryOption['mode'], targetPairingId: number | null = null, standbyTaskId: number | null = null): RecoveryOption => ({
  id: `${mode}-100-B`,
  mode,
  title: 'test',
  targetCrewId: 'B',
  targetCrewName: 'B',
  sourceCrewId: 'A',
  sourcePairingId: 100,
  targetPairingId,
  standbyTaskId,
  standbyWindow: null,
  timeDistanceMinutes: null,
  sameRank: true,
  sameBase: true,
  crossDivision: false,
  crossRole: false,
  localExecutable: true,
  reasons: [],
  beforeItems: [],
  afterItems: [],
  changes: [],
  metrics: {
    affectedCrewCount: 2,
    cancelledRosterCount: 1,
    addedRosterCount: 1,
    changedRosterCount: 1,
    followOnImpactCount: 0,
    rosterStability: 100,
    directCost: 0,
    virtualCost: 0,
    virtualCostWeight: 1,
    totalCost: 0,
    currency: 'CNY',
  },
  ruleCheck: 'passed',
  ruleMessages: [],
  positioning: null,
})

describe('buildRecoveryDraftPlan', () => {
  it('builds a complete-Roster transfer without a direct persistence call', () => {
    const plan = buildRecoveryDraftPlan(option('transfer'), [item(1, 'A', 100), item(2, 'B', 200)])

    expect(plan.operations.map((operation) => operation.type)).toEqual([
      'remove-pairing-from-crew',
      'assign-pairing',
    ])
    expect(plan.operations[0]).toMatchObject({ pairingId: 100, crewId: 'A' })
    expect(plan.operations[1]).toMatchObject({ pairingId: 100, crewId: 'B', rosterActingRank: 'CA' })
    expect(plan.operations[1].tasks).toEqual([expect.objectContaining({ id: 1, crewId: 'B', isPending: true })])
  })

  it('builds both sides of a complete-Roster swap', () => {
    const plan = buildRecoveryDraftPlan(option('swap', 200), [item(1, 'A', 100), item(2, 'B', 200)])

    expect(plan.operations.map((operation) => operation.type)).toEqual([
      'remove-pairing-from-crew',
      'remove-pairing-from-crew',
      'assign-pairing',
      'assign-pairing',
    ])
    expect(plan.operations[2]).toMatchObject({ pairingId: 100, crewId: 'B' })
    expect(plan.operations[3]).toMatchObject({ pairingId: 200, crewId: 'A' })
    expect(plan.affectedCrewIds).toEqual(['A', 'B'])
    expect(plan.affectedPairingIds).toEqual([100, 200])
  })

  it('retains the SBY task and marks it as Callout Standby in the draft', () => {
    const plan = buildRecoveryDraftPlan(option('standby', null, 9), [item(1, 'A', 100), item(9, 'B', null, 'SBY')])

    expect(plan.operations.at(-1)).toEqual({
      type: 'update',
      taskId: 9,
      data: { exceptionCode: 'CALLOUT_STANDBY' },
    })
  })

  it('encodes Cross-base positioning as one draft operation with two DHD placeholders', () => {
    const crossOption = {
      ...option('cross-base-standby', null, 9),
      positioning: {
        supportBase: 'BJS', recoveryBase: 'PVG',
        outbound: { id: 501, fltNum: 'D501', depArp: 'BJS', arvArp: 'PVG', schDepDtUtc: '2026-09-06T08:00:00.000Z', schArvDtUtc: '2026-09-06T10:00:00.000Z', fleet: 'A320', airline: 'MU', blockMinutes: 120 },
        inbound: { id: 502, fltNum: 'D502', depArp: 'PVG', arvArp: 'BJS', schDepDtUtc: '2026-09-06T15:00:00.000Z', schArvDtUtc: '2026-09-06T17:00:00.000Z', fleet: 'A320', airline: 'MU', blockMinutes: 120 },
        minFlightLeadHours: 2, reserveBeforeHours: 2, returnAfterHours: 1, dhdFlightCost: 1920,
      },
      afterItems: [item(1, 'B', 100), item(-10, 'B', -11, 'DHD'), item(-11, 'B', -12, 'DHD')],
    } as RecoveryOption
    const plan = buildRecoveryDraftPlan(crossOption, [item(1, 'A', 100), item(9, 'B', null, 'SBY')])

    expect(plan.operations).toHaveLength(1)
    expect(plan.operations[0]).toMatchObject({ type: 'cross-base-recovery', crossBase: { operation: 'standby', outboundFlightId: 501, returnFlightId: 502, supportBase: 'BJS' } })
    expect(plan.operations[0].mockItems).toHaveLength(3)
  })

  it('encodes destination-base recovery without external DHD flight ids and preserves the source Acting Rank', () => {
    const destinationOption = {
      ...option('cross-base-destination'),
      destinationSplit: {
        destinationBase: 'BJS',
        sourcePairingId: 100,
        createdPairingId: -900001,
        createsPairing: true,
        actingRank: 'FO',
        middleFlightIds: [2001],
        removedDhdFlightIds: [2000, 2002],
        dhdCostSavings: 960,
      },
      afterItems: [{ ...item(-1, 'B', -900001), rosterActingRank: 'FO', flightActingRank: 'FO', fltId: 2001 }],
    } as RecoveryOption

    const plan = buildRecoveryDraftPlan(destinationOption, [item(1, 'A', 100)])

    expect(plan.operations).toHaveLength(1)
    expect(plan.operations[0]).toMatchObject({
      type: 'cross-base-recovery',
      crossBase: {
        operation: 'destination',
        outboundFlightId: null,
        returnFlightId: null,
        rosterActingRank: 'FO',
        destinationSplit: { actingRank: 'FO', createsPairing: true },
      },
    })
  })

  it('flattens a combined option into Draft operations for every selected alert', () => {
    const first = option('transfer')
    const second = {
      ...option('transfer'),
      id: 'transfer-300-D',
      sourceCrewId: 'C',
      sourcePairingId: 300,
      targetCrewId: 'D',
      targetCrewName: 'D',
    }
    const combined = { ...first, id: 'combined', subOptions: [first, second] } as RecoveryOption
    const plan = buildRecoveryDraftPlan(combined, [item(1, 'A', 100), item(3, 'C', 300)])

    expect(plan.operations.map((operation) => operation.type)).toEqual([
      'remove-pairing-from-crew', 'assign-pairing',
      'remove-pairing-from-crew', 'assign-pairing',
    ])
    expect(plan.affectedCrewIds).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']))
    expect(plan.affectedPairingIds).toEqual(expect.arrayContaining([100, 300]))
  })
})
