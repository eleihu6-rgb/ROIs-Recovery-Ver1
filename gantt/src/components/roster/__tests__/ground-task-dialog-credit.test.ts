import { describe, expect, it } from 'vitest'
import { formatGroundTaskCredit } from '../ground-task-dialog'
import type { RosterItem } from '@/types'

describe('formatGroundTaskCredit', () => {
  it('uses actual credited minutes first', () => {
    expect(formatGroundTaskCredit('180', '240')).toBe('3h 00m')
  })

  it('falls back to scheduled credited minutes when actual is absent', () => {
    expect(formatGroundTaskCredit(null, '240')).toBe('4h 00m')
  })

  it('returns dash for absent, invalid, zero, or negative credit', () => {
    expect(formatGroundTaskCredit(null, null)).toBe('-')
    expect(formatGroundTaskCredit('bad', null)).toBe('-')
    expect(formatGroundTaskCredit('0', '0')).toBe('-')
    expect(formatGroundTaskCredit('-15', '0')).toBe('-')
  })

  it('rounds decimal minute values from numeric DB payloads', () => {
    expect(formatGroundTaskCredit('89.6', null)).toBe('1h 30m')
  })
})

const creditedGroundTask = {
  id: 1292674,
  crewId: '1010',
  pairingId: null,
  ver: 1,
  base: 'YOW',
  depArp: 'YOW',
  arvArp: 'YYZ',
  label: null,
  assignmentGroup: 'GRD',
  assignment: 'SIM',
  role: null,
  subRole: null,
  source: 'PA',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-06-21T06:00:00.000Z',
  schEndDtUtc: '2026-06-21T18:00:00.000Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: null,
  fltDt: null,
  dutySeq: null,
  segSeq: null,
  division: 'P',
  flightActingRank: '',
  rosterActingRank: null,
  activeRank: null,
  position: null,
  schCreditedMinutes: '240',
  actCreditedMinutes: '180',
  tagSet: null,
  exceptionCode: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
} satisfies RosterItem

describe('ground task credit row contract', () => {
  it('documents the edit-mode display value from a roster item', () => {
    expect(formatGroundTaskCredit(
      creditedGroundTask.actCreditedMinutes,
      creditedGroundTask.schCreditedMinutes,
    )).toBe('3h 00m')
  })
})
