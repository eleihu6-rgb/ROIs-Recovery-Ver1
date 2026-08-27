import { describe, it, expect } from 'vitest'
import { transformF8Pairings } from '../../transform/f8/db/transform-pairing.js'

const rawPairing = {
  pairingId: 'P001',
  pairingDt: '2026-06-01T00:00:00Z',
  label: 'P001-F8',
  base: 'PEK',
  fleet: 'B738',
  durationDays: 2,
  pairingDutyList: [{
    actStrDtUtc: '2026-06-01T06:00:00Z',
    actEndDtUtc: '2026-06-01T18:00:00Z',
    strArp: 'PEK',
    endArp: 'PVG',
    pairingDutyNodes: [
      { node: 'CHECKIN', startUtc: '2026-06-01T06:00:00Z', endUtc: '2026-06-01T06:30:00Z', airport: 'PEK' },
      { node: 'CHECKOUT', startUtc: '2026-06-01T17:30:00Z', endUtc: '2026-06-01T18:00:00Z', airport: 'PVG' },
    ],
    pairingDutySegments: [{
      fltId: '12345',
      depArp: 'PEK',
      arvArp: 'PVG',
      fltNum: 'F8001',
      fleet: 'B738',
      airline: 'F8',
      assignment: 'FLY',
      actStrDtUtc: '2026-06-01T08:00:00Z',
      actEndDtUtc: '2026-06-01T10:00:00Z',
    }],
  }],
}

describe('transformF8Pairings', () => {
  it('maps pairing to PairingImportRecord', () => {
    const records = transformF8Pairings([rawPairing])
    expect(records).toHaveLength(1)
    const p = records[0]
    expect(p.interfaceId).toBe('P001')
    expect(p.pairingLabel).toBe('P001-F8')
    expect(p.base).toBe('PEK')
    expect(p.fleet).toBe('B738')
    expect(p.source).toBe('F8')
    expect(p.duties).toHaveLength(1)
    expect(p.duties[0].dutySeq).toBe(1)
    expect(p.duties[0].segments).toHaveLength(1)
    expect(p.duties[0].segments[0].interfaceFltId).toBe('12345')
    expect(p.duties[0].segments[0].fltDt).toBeNull()
  })

  it('expands CHECKIN/CHECKOUT to PICKUP/BRIEF/DEBRIEF/DROPOFF nodes', () => {
    const records = transformF8Pairings([rawPairing])
    const duty = records[0].duties[0]
    expect(duty.pickupStartUtc).toBeDefined()
    expect(duty.briefEndUtc).toBeDefined()
    expect(duty.debriefStartUtc).toBeDefined()
    expect(duty.dropoffEndUtc).toBeDefined()
  })

  it('maps new API fields: top-level times, division, assignment, tafb, per-diem, duty stats', () => {
    const records = transformF8Pairings([{
      ...rawPairing,
      schStrDtUtc: '2026-06-01T05:30:00Z',
      schEndDtUtc: '2026-06-02T19:00:00Z',
      actStrDtUtc: '2026-06-01T05:35:00Z',
      actEndDtUtc: '2026-06-02T19:05:00Z',
      division: 'C',
      assignmentGroup: 'TRN',
      assignment: 'SIM',
      tafb: 999,
      comments: 'note',
      perDiemMins: 120,
      wpMins: 480,
      pairingDutyList: [{
        ...rawPairing.pairingDutyList[0],
        creditedMinutes: 300,
        maxFdpMin: 720,
        actFlightMin: 240,
        layoverNits: 1,
        pairingDutySegments: [{
          ...rawPairing.pairingDutyList[0].pairingDutySegments[0],
          assignment: 'DH',
          isLongTransit: 1,
        }],
      }],
    }])
    const p = records[0]
    expect(p.schStrDtUtc).toBe('2026-06-01T05:30:00.000Z')
    expect(p.actStrDtUtc).toBe('2026-06-01T05:35:00.000Z')
    expect(p.division).toBe('C')
    expect(p.assignmentGroup).toBe('TRN')
    expect(p.assignment).toBe('SIM')
    expect(p.tafb).toBe(999)
    expect(p.comments).toBe('note')
    expect(p.perDiemMins).toBe(120)
    expect(p.wpMins).toBe(480)
    expect(p.duties[0].creditedMinutes).toBe(300)
    expect(p.duties[0].maxFdpMin).toBe(720)
    expect(p.duties[0].actFlightMin).toBe(240)
    expect(p.duties[0].layoverNits).toBe(1)
    expect(p.duties[0].segments[0].segAssignment).toBe('DHD')
    expect(p.duties[0].segments[0].isLongTransit).toBe(1)
  })

  it('prefers segment scheduled std/sta over actual timestamps', () => {
    const p = transformF8Pairings([{
      ...rawPairing,
      pairingDutyList: [{
        ...rawPairing.pairingDutyList[0],
        pairingDutySegments: [{
          ...rawPairing.pairingDutyList[0].pairingDutySegments[0],
          stdUtc: '2026-06-01T08:00:00Z',
          staUtc: '2026-06-01T10:05:00Z',
          actStrDtUtc: '2026-06-01T08:12:00Z',
          actEndDtUtc: '2026-06-01T10:17:00Z',
        }],
      }],
    }])[0]

    expect(p.duties[0].segments[0].schStrDtUtc).toBe('2026-06-01T08:00:00.000Z')
    expect(p.duties[0].segments[0].schEndDtUtc).toBe('2026-06-01T10:05:00.000Z')
    expect(p.duties[0].segments[0].actStrDtUtc).toBe('2026-06-01T08:12:00.000Z')
    expect(p.duties[0].segments[0].actEndDtUtc).toBe('2026-06-01T10:17:00.000Z')
  })

  it('prefers explicit segment schStrDtUtc/schEndDtUtc over actual timestamps', () => {
    const p = transformF8Pairings([{
      ...rawPairing,
      pairingDutyList: [{
        ...rawPairing.pairingDutyList[0],
        pairingDutySegments: [{
          ...rawPairing.pairingDutyList[0].pairingDutySegments[0],
          schStrDtUtc: '2026-06-01T08:00:00Z',
          schEndDtUtc: '2026-06-01T10:05:00Z',
          actStrDtUtc: '2026-06-01T08:12:00Z',
          actEndDtUtc: '2026-06-01T10:17:00Z',
        }],
      }],
    }])[0]

    expect(p.duties[0].segments[0].schStrDtUtc).toBe('2026-06-01T08:00:00.000Z')
    expect(p.duties[0].segments[0].schEndDtUtc).toBe('2026-06-01T10:05:00.000Z')
    expect(p.duties[0].segments[0].actStrDtUtc).toBe('2026-06-01T08:12:00.000Z')
    expect(p.duties[0].segments[0].actEndDtUtc).toBe('2026-06-01T10:17:00.000Z')
  })

  it('falls back to durationDays when tafb is missing', () => {
    const records = transformF8Pairings([{
      ...rawPairing,
      tafb: undefined,
      durationDays: 5,
      schStrDtUtc: '2026-06-01T05:30:00Z',
      schEndDtUtc: '2026-06-06T19:00:00Z',
    }])
    expect(records[0].tafb).toBe(5)
  })

  it('extracts briefMin, debriefMin, and segment fltDt', () => {
    const raw = {
      ...rawPairing,
      pairingDutyList: [{
        actStrDtUtc: '2026-06-01T06:00:00Z',
        actEndDtUtc: '2026-06-01T18:00:00Z',
        strArp: 'PEK',
        endArp: 'PVG',
        briefMin: 51,
        debriefMin: 15,
        pairingDutyNodes: [],
        pairingDutySegments: [{
          fltId: '99',
          fltNum: 'F8001',
          depArp: 'PEK',
          arvArp: 'PVG',
          fleet: 'B738',
          airline: 'F8',
          assignment: 'FLY',
          isLongTransit: 0,
          fltDt: '2026-06-01 00:00:00',
        }],
      }],
    }
    const p = transformF8Pairings([raw])[0]
    expect(p.duties[0].briefMin).toBe(51)
    expect(p.duties[0].debriefMin).toBe(15)
    expect(p.duties[0].segments[0].fltDt).toBe('2026-06-01')
  })

  it('falls back to segment times and default airline for OBDO deadhead segments', () => {
    const p = transformF8Pairings([{
      ...rawPairing,
      pairingDutyList: [{
        strArp: 'YUL',
        endArp: 'YUL',
        pairingDutyNodes: [
          { node: 'PICKUP', startUtc: '', endUtc: '', airport: 'YUL' },
          { node: 'BRIEF', startUtc: '', endUtc: '', airport: 'YUL' },
          { node: 'DEBRIEF', startUtc: '2026-07-31T19:00:00Z', endUtc: '2026-07-31T19:00:00Z', airport: 'YUL' },
        ],
        pairingDutySegments: [{
          fltId: '48216',
          fltNum: 'OBDO',
          depArp: 'YUL',
          arvArp: 'YUL',
          fleet: '',
          airline: '',
          assignment: 'DH',
          actStrDtUtc: '2026-07-31T18:00:00Z',
          actEndDtUtc: '2026-07-31T19:00:00Z',
          fltDt: '2026-07-31',
        }],
      }],
    }])[0]

    expect(p.duties[0].schStrDtUtc).toBe('2026-07-31T18:00:00.000Z')
    expect(p.duties[0].schEndDtUtc).toBe('2026-07-31T19:00:00.000Z')
    expect(p.duties[0].segments[0].airline).toBe('F8')
    expect(p.duties[0].segments[0].fltNum).toBe('OBDO')
    expect(p.duties[0].segments[0].segAssignment).toBe('DHD')
    expect(p.duties[0].pickupStartUtc).toBeUndefined()
    expect(p.duties[0].briefStartUtc).toBeUndefined()
    expect(p.duties[0].debriefStartUtc).toBe('2026-07-31T19:00:00.000Z')
  })

  it('defaults division to P and assignment to FLY when absent', () => {
    const p = transformF8Pairings([rawPairing])[0]
    expect(p.division).toBe('P')
    expect(p.assignment).toBe('FLY')
    expect(p.assignmentGroup).toBe('FLY')
  })

  it('skips pairings with no pairingId', () => {
    const records = transformF8Pairings([{ ...rawPairing, pairingId: '' }])
    expect(records).toHaveLength(0)
  })

  it('extracts pairingCompositions into compositions with normalized rank and plan', () => {
    const raw = {
      ...rawPairing,
      pairingCompositions: [
        { actingRank: 'CAP', planValue: 2 },
        { actingRank: 'FO', planValue: 1 },
      ],
    }
    const p = transformF8Pairings([raw])[0]
    expect(p.compositions).toHaveLength(2)
    expect(p.compositions[0]).toEqual({ rank: 'CA', plan: 2 })
    expect(p.compositions[1]).toEqual({ rank: 'FO', plan: 1 })
  })

  it('returns empty compositions array when pairingCompositions absent', () => {
    const p = transformF8Pairings([rawPairing])[0]
    expect(p.compositions).toEqual([])
  })

  it('filters out compositions with zero or missing plan', () => {
    const raw = {
      ...rawPairing,
      pairingCompositions: [
        { actingRank: 'CA', planValue: 0 },
        { actingRank: 'FA', planValue: 4 },
        { actingRank: '', planValue: 1 },
      ],
    }
    const p = transformF8Pairings([raw])[0]
    expect(p.compositions).toHaveLength(1)
    expect(p.compositions[0]).toEqual({ rank: 'FA', plan: 4 })
  })
})
