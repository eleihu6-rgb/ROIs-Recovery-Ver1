import { describe, expect, it } from 'vitest'

import { buildStaffingOptions, openPairingSeats } from '@/services/open-pairing-recovery'
import type { CrewItem, PairingItem, RosterItem } from '@/types'

const targetPairingId = 152800
const now = Date.parse('2026-09-17T00:00:00Z')
const targetStart = '2026-09-20T10:00:00Z'
const targetEnd = '2026-09-20T20:00:00Z'

const pairing = (overrides: Record<string, unknown> = {}): PairingItem => ({
  pairing: {
    id: targetPairingId, pairingLabel: 'OPEN-152800', filiale: 'F8', division: 'P', base: 'ADD', fleet: 'B787',
    assignmentGroup: 'FLY', assignment: 'FLY', schStrDtUtc: targetStart, schEndDtUtc: targetEnd,
    actStrDtUtc: targetStart, actEndDtUtc: targetEnd, durationDays: 1, tafb: 600, dutyCount: 1,
    segCount: 1, blockMinutes: 120, ver: 1, isDeleted: 0, source: null, tags: null, comments: null,
    pairingDt: '2026-09-20', composition: [{ rank: 'CA', plan: 1, fill: 0 }, { rank: 'FO', plan: 1, fill: 1 }],
    isFull: false, ...overrides,
  }, flights: [], sessionTags: [], segments: [{
    id: 1, pairingId: targetPairingId, dutySeq: 1, segSeq: 1, fltId: 9001, fltNum: 'ET9001',
    airline: 'ET', depArp: 'ADD', arvArp: 'DXB', schStrDtUtc: targetStart, schEndDtUtc: targetEnd,
    actStrDtUtc: targetStart, actEndDtUtc: targetEnd, segAssignment: 'FLY', dutyStrArp: 'ADD', dutyEndArp: 'DXB',
    dutySchStrDtUtc: targetStart, dutySchEndDtUtc: targetEnd, dutySchRestMin: null, dutyActRestMin: null,
    dutyActCreditedMinutes: '120', pickupStartUtc: null, pickupEndUtc: null, briefAirport: null,
    briefStartUtc: null, briefEndUtc: null, debriefAirport: null, debriefStartUtc: null, debriefEndUtc: null,
    dropoffStartUtc: null, dropoffEndUtc: null, doublePickupStartUtc: null, doublePickupEndUtc: null,
    doubleBriefAirport: null, doubleBriefStartUtc: null, doubleBriefEndUtc: null, doubleDebriefAirport: null,
    doubleDebriefStartUtc: null, doubleDebriefEndUtc: null, doubleDropoffStartUtc: null, doubleDropoffEndUtc: null,
  }],
})

const crew = (id: string, overrides: Record<string, unknown> = {}): CrewItem => ({
  sessionTags: [], crew: { id: Number(id.slice(1)), crewId: id, firstName: 'Test', middleName: null, lastName: id,
    preferredName: null, gender: 'X', division: 'P', filiale: 'F8', status: 1, remarks: null, seniorityNum: null,
    panelRank: 'CA', panelBase: 'ADD', panelFleets: ['B787'], ...overrides },
})

const roster = (crewId: string, values: Partial<RosterItem>): RosterItem => ({
  id: 100, crewId, pairingId: null, ver: 1, base: 'ADD', label: 'task', assignmentGroup: 'GRND', assignment: 'GRND',
  role: null, subRole: null, source: null, isRequested: 0, isSwapped: 0, preference: null, comments: null,
  score: null, workingHour: null, schStrDtUtc: '2026-09-20T00:00:00Z', schEndDtUtc: '2026-09-20T02:00:00Z',
  actStrDtUtc: null, actEndDtUtc: null, fltId: null, fltDt: null, dutySeq: null, segSeq: null, division: 'P',
  flightActingRank: 'CA', rosterActingRank: 'CA', activeRank: null, position: null, schCreditedMinutes: null,
  actCreditedMinutes: null, tagSet: null, exceptionCode: null, ybh: null, mbh: null, yal: null, mal: null,
  ydo: null, mdo: null, mcred: null, ...values,
})

describe('open pairing staffing options', () => {
  it('preserves rank-specific deficits and exposes only the requested open rank', () => {
    const item = pairing({ composition: [{ rank: 'CA', plan: 2, fill: 1 }, { rank: 'FO', plan: 1, fill: 0 }] })
    expect(openPairingSeats(item)).toEqual([{ rank: 'CA', plan: 2, fill: 1 }, { rank: 'FO', plan: 1, fill: 0 }])
    expect(buildStaffingOptions(item, 'FO', [crew('J4001')], [], now)).toHaveLength(0)
    expect(buildStaffingOptions(item, 'CA', [crew('J4001')], [], now)).toHaveLength(1)
  })

  it('offers standby with callout update and assignment, without removing a source', () => {
    const standby = roster('J4001', { id: 11, assignmentGroup: 'SBY', assignment: 'ASBY', schStrDtUtc: '2026-09-20T08:00:00Z', schEndDtUtc: '2026-09-20T22:00:00Z' })
    const option = buildStaffingOptions(pairing(), 'CA', [crew('J4001')], [standby], now)[0]!
    expect(option.method).toBe('standby')
    expect(option.operations).toEqual(expect.arrayContaining([
      { type: 'update', taskId: 11, data: { exceptionCode: 'CALLOUT_STANDBY' } },
      expect.objectContaining({ type: 'assign-pairing', pairingId: targetPairingId, crewId: 'J4001' }),
    ]))
    expect(option.operations.some(operation => operation.type === 'remove-pairing-from-crew')).toBe(false)
  })

  it('preserves an unrelated unpaired task whose pairing ID is absent', () => {
    const task = roster('J4001', { pairingId: undefined })
    const option = buildStaffingOptions(pairing(), 'CA', [crew('J4001')], [task], now)[0]!
    expect(option.afterItems).toContainEqual(task)
    expect(option.operations).toHaveLength(1)
  })

  it('offers available crew with assignment only', () => {
    const option = buildStaffingOptions(pairing(), 'CA', [crew('J4001')], [], now)[0]!
    expect(option.method).toBe('available')
    expect(option.operations).toHaveLength(1)
    expect(option.operations[0]).toMatchObject({ type: 'assign-pairing', pairingId: targetPairingId, crewId: 'J4001' })
  })

  it('moves up only from one actual complete donor and never invents a source', () => {
    const donor = roster('J4001', { id: 12, pairingId: 152801, schStrDtUtc: '2026-09-20T08:00:00Z', schEndDtUtc: '2026-09-20T18:00:00Z' })
    const option = buildStaffingOptions(pairing(), 'CA', [crew('J4001')], [donor], now)[0]!
    expect(option.method).toBe('move-up')
    expect(option.donorPairingId).toBe(152801)
    expect(option.operations[0]).toMatchObject({ type: 'remove-pairing-from-crew', pairingId: 152801, crewId: 'J4001' })
    expect(option.operations.filter(operation => operation.type === 'remove-pairing-from-crew')).toHaveLength(1)
    expect(buildStaffingOptions(pairing(), 'CA', [crew('J4002')], [], now)[0]!.donorPairingId).toBeUndefined()
  })

  it.each([
    ['rank', crew('J4001', { panelRank: 'FO' }), []],
    ['base', crew('J4001', { panelBase: 'NBO' }), []],
    ['fleet', crew('J4001', { panelFleets: ['A350'] }), []],
    ['division', crew('J4001', { division: 'C' }), []],
    ['overlapping ground task', crew('J4001'), [roster('J4001', { id: 13, schStrDtUtc: '2026-09-20T08:00:00Z', schEndDtUtc: '2026-09-20T22:00:00Z' })]],
    ['completed donor', crew('J4001'), [roster('J4001', { id: 14, pairingId: 152801, briefStartUtc: '2026-09-16T08:00:00Z', schStrDtUtc: '2026-09-20T08:00:00Z', schEndDtUtc: '2026-09-20T18:00:00Z' })]],
  ])('rejects %s candidates', (_label, candidate, existing) => {
    expect(buildStaffingOptions(pairing(), 'CA', [candidate], existing, now)).toEqual([])
  })

  it('rejects candidates with multiple overlapping donor pairings rather than removing a fake source', () => {
    const items = [
      roster('J4001', { id: 21, pairingId: 152801, schStrDtUtc: '2026-09-20T08:00:00Z', schEndDtUtc: '2026-09-20T12:00:00Z' }),
      roster('J4001', { id: 22, pairingId: 152802, schStrDtUtc: '2026-09-20T12:00:00Z', schEndDtUtc: '2026-09-20T22:00:00Z' }),
    ]
    expect(buildStaffingOptions(pairing(), 'CA', [crew('J4001')], items, now)).toEqual([])
  })
})
