import { describe, expect, it } from 'vitest'
import type { RosterItem } from '@/types'
import { canRecoverViolation, hasGroundTaskFlyOverlap, recoveryTriggerFor } from '@/services/recovery-trigger'
import { collectRecoveryAlerts, recoverablePairingsForCrew } from '@/services/recovery-trigger'
import { overlappingPairingIdsForTask } from '@/services/recovery-rules'

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

// Ground task 00:00-12:00 and flying Pairing 06:00-10:00 overlap.
const overlapping = [
  item(1, 'A', null, '2026-09-05T00:00:00.000Z', '2026-09-05T12:00:00.000Z'),
  item(2, 'A', 100, '2026-09-05T06:00:00.000Z', '2026-09-05T10:00:00.000Z'),
]

// Ground task ends before the flying Pairing starts — no overlap.
const adjacent = [
  item(1, 'A', null, '2026-09-05T00:00:00.000Z', '2026-09-05T05:00:00.000Z'),
  item(2, 'A', 100, '2026-09-05T06:00:00.000Z', '2026-09-05T10:00:00.000Z'),
]

describe('recoveryTriggerFor', () => {
  it('maps 8004 to roster qualification and 1001 to assignment overlap', () => {
    expect(recoveryTriggerFor('8004')).toBe('roster-qualification')
    expect(recoveryTriggerFor('1001')).toBe('assignment-overlap')
  })

  it('rejects every other rule', () => {
    expect(recoveryTriggerFor('7501')).toBeNull()
    expect(recoveryTriggerFor('')).toBeNull()
  })
})

describe('hasGroundTaskFlyOverlap', () => {
  it('is true when a ground task overlaps the flying Pairing', () => {
    expect(hasGroundTaskFlyOverlap(overlapping, 'A', 100)).toBe(true)
  })

  it('is false when the ground task does not overlap', () => {
    expect(hasGroundTaskFlyOverlap(adjacent, 'A', 100)).toBe(false)
  })

  it('is false when the Crew has no ground task at all', () => {
    const onlyFlying = [item(2, 'A', 100, '2026-09-05T06:00:00.000Z', '2026-09-05T10:00:00.000Z')]
    expect(hasGroundTaskFlyOverlap(onlyFlying, 'A', 100)).toBe(false)
  })
})

describe('canRecoverViolation', () => {
  it('keeps an unfinished 8004 Roster recoverable', () => {
    expect(canRecoverViolation({
      ruleCode: '8004',
      items: overlapping,
      crewId: 'A',
      pairingId: 100,
      now: new Date('2026-09-05T08:00:00.000Z').getTime(),
    })).toBe(true)
  })

  it('withdraws 8004 once the Roster has ended', () => {
    expect(canRecoverViolation({
      ruleCode: '8004',
      items: overlapping,
      crewId: 'A',
      pairingId: 100,
      now: new Date('2026-09-06T00:00:00.000Z').getTime(),
    })).toBe(false)
  })

  it('opens Recovery for a 1001 alert only with a ground/fly overlap', () => {
    expect(canRecoverViolation({ ruleCode: '1001', items: overlapping, crewId: 'A', pairingId: 100 })).toBe(true)
    expect(canRecoverViolation({ ruleCode: '1001', items: adjacent, crewId: 'A', pairingId: 100 })).toBe(false)
  })

  it('never opens Recovery for an unrelated rule', () => {
    expect(canRecoverViolation({ ruleCode: '7501', items: overlapping, crewId: 'A', pairingId: 100 })).toBe(false)
  })
})

describe('overlappingPairingIdsForTask', () => {
  it('resolves the flying Pairing when the ground task itself is right-clicked', () => {
    // Mirrors crew 113 / 2026-09-08: ADM MTG 00:00-12:00 overlapped by Pairing #100.
    expect(overlappingPairingIdsForTask(overlapping, 'A', 1)).toEqual([100])
  })

  it('returns nothing when the right-clicked task overlaps no flying Pairing', () => {
    expect(overlappingPairingIdsForTask(adjacent, 'A', 1)).toEqual([])
  })
})

describe('collectRecoveryAlerts', () => {
  const persisted = new Map<number, Array<{ ruleCode: string; severity: number; message: string; passed: boolean; crewId?: string }>>([
    [100, [{ ruleCode: '1001', severity: 1, message: 'overlap', passed: false, crewId: 'A' }]],
  ])

  it('finds a persisted 1001 row keyed by Pairing id', () => {
    expect(collectRecoveryAlerts({ crewId: 'A', pairingId: 100, persistedViolations: persisted }))
      .toEqual([{ ruleCode: '1001', severity: 1, message: 'overlap' }])
  })

  it('ignores a row owned by another Crew', () => {
    expect(collectRecoveryAlerts({ crewId: 'B', pairingId: 100, persistedViolations: persisted })).toEqual([])
  })

  it('ignores rules that are not Recovery entry points', () => {
    const other = new Map([[100, [{ ruleCode: '3007', severity: 1, message: 'fdp', passed: false }]]])
    expect(collectRecoveryAlerts({ crewId: 'A', pairingId: 100, persistedViolations: other })).toEqual([])
  })
})

describe('recoverablePairingsForCrew', () => {
  // Mirrors crew 113 / 2026-09-08: ADM ground task overlapping flying Pairing #100
  // with a persisted 1001 Assignment Overlap alert.
  const crewItems = [
    item(1, 'A', null, '2026-09-05T00:00:00.000Z', '2026-09-05T12:00:00.000Z', { assignmentGroup: 'ADM', assignment: 'MTG' }),
    item(2, 'A', 100, '2026-09-05T06:00:00.000Z', '2026-09-05T10:00:00.000Z'),
    item(3, 'B', 200, '2026-09-05T14:00:00.000Z', '2026-09-05T18:00:00.000Z'),
  ]
  const alerts = new Map([[100, [{ ruleCode: '1001', severity: 1, message: 'overlap', passed: false, crewId: 'A' }]]])

  it('surfaces the overlapping flying Pairing for the Crew', () => {
    expect(recoverablePairingsForCrew({ crewId: 'A', items: crewItems, persistedViolations: alerts }))
      .toEqual([{ pairingId: 100, alert: { ruleCode: '1001', severity: 1, message: 'overlap' } }])
  })

  it('does not surface a Pairing without a ground-task overlap', () => {
    const noOverlap = crewItems.map((entry) =>
      entry.id === 1 ? { ...entry, schEndDtUtc: '2026-09-05T05:00:00.000Z' } : entry)
    expect(recoverablePairingsForCrew({ crewId: 'A', items: noOverlap, persistedViolations: alerts })).toEqual([])
  })

  // Real case: crew 113 / 2026-09-08. The Pairing carries BOTH an 8004 (aircraft
  // qualification) and a 1001 (Assignment Overlap) alert, and the date is already
  // in the past. The 8004 entry condition fails on a finished Roster, so the
  // 1001 alert has to win — otherwise the menu silently loses its Recovery entry.
  it('prefers the 1001 alert when the finished Roster blocks the 8004 entry', () => {
    const pastItems = [
      item(1, 'A', null, '2026-09-08T04:00:00.000Z', '2026-09-08T07:00:00.000Z', { assignmentGroup: 'ADM', assignment: 'MTG' }),
      item(2, 'A', 135672, '2026-09-08T05:45:00.000Z', '2026-09-08T09:50:00.000Z'),
    ]
    const bothAlerts = new Map([[135672, [
      { ruleCode: '8004', severity: 1, message: 'fleet invalid', passed: false, crewId: 'A' },
      { ruleCode: '1001', severity: 1, message: 'overlap', passed: false, crewId: 'A' },
    ]]])
    expect(recoverablePairingsForCrew({
      crewId: 'A',
      items: pastItems,
      persistedViolations: bothAlerts,
      now: new Date('2026-09-11T00:00:00.000Z').getTime(),
    })).toEqual([{ pairingId: 135672, alert: { ruleCode: '1001', severity: 1, message: 'overlap' } }])
  })

  it('prefers 1001 when BOTH entry conditions hold (new trigger wins)', () => {
    // Live, unfinished Pairing: 8004 (qualification) and 1001 (overlap) both apply.
    const liveItems = [
      item(1, 'A', null, '2026-09-11T04:00:00.000Z', '2026-09-11T07:00:00.000Z', { assignmentGroup: 'ADM', assignment: 'MTG' }),
      item(2, 'A', 100, '2026-09-11T05:45:00.000Z', '2026-09-11T09:50:00.000Z'),
    ]
    const both = new Map([[100, [
      { ruleCode: '8004', severity: 1, message: 'fleet invalid', passed: false, crewId: 'A' },
      { ruleCode: '1001', severity: 1, message: 'overlap', passed: false, crewId: 'A' },
    ]]])
    expect(recoverablePairingsForCrew({
      crewId: 'A',
      items: liveItems,
      persistedViolations: both,
      now: new Date('2026-09-11T06:00:00.000Z').getTime(),
    })).toEqual([{ pairingId: 100, alert: { ruleCode: '1001', severity: 1, message: 'overlap' } }])
  })
})
