import { describe, it, expect } from 'vitest'
import { transformF8Flights } from '../../transform/f8/db/transform-flight.js'

const rawFlight = {
  fltId: '12345',
  fltNum: 'F8604',
  datOp: '2026-06-01T00:00:00Z',
  depStn: 'PEK',
  arrStn: 'PVG',
  std: '2026-06-01T08:00:00Z',
  sta: '2026-06-01T10:00:00Z',
  atd: null,
  ata: null,
  acGrp: 'B738',
  acReg: 'B-5678',
}

describe('transformF8Flights', () => {
  it('maps F8 flight to FlightImportRecord', () => {
    const records = transformF8Flights([rawFlight], 'F8')
    expect(records).toHaveLength(1)
    const r = records[0]
    expect(r.interfaceFltId).toBe('12345')
    expect(r.fltNum).toBe('604')
    expect(r.fltDt).toBe('2026-06-01')
    expect(r.depArp).toBe('PEK')
    expect(r.arvArp).toBe('PVG')
    expect(r.schStrDtUtc).toBe('2026-06-01T08:00:00.000Z')
    expect(r.schEndDtUtc).toBe('2026-06-01T10:00:00.000Z')
    expect(r.actStrDtUtc).toBe('2026-06-01T08:00:00.000Z')
    expect(r.actEndDtUtc).toBe('2026-06-01T10:00:00.000Z')
    expect(r.blkMin).toBe(120)
    expect(r.fleet).toBe('B738')
    expect(r.tailNum).toBe('B-5678')
    expect(r.airline).toBe('F8')
    expect(r.fltType).toBe('PAX')
  })

  it('uses actual times when provided', () => {
    const records = transformF8Flights([{
      ...rawFlight,
      atd: '2026-06-01T08:15:00Z',
      ata: '2026-06-01T10:05:00Z',
    }], 'F8')
    expect(records[0].actStrDtUtc).toBe('2026-06-01T08:15:00.000Z')
    expect(records[0].actEndDtUtc).toBe('2026-06-01T10:05:00.000Z')
  })

  it('maps new API fields: est times, take-off/touch-down, seg type, device code', () => {
    const records = transformF8Flights([{
      ...rawFlight,
      etd: '2026-06-01T08:05:00Z',
      eta: '2026-06-01T10:05:00Z',
      toff: '2026-06-01T08:20:00Z',
      tdwn: '2026-06-01T09:55:00Z',
      stc: 'I',
      divCode: 'DEV1',
    }], 'F8')
    const r = records[0]
    expect(r.estStrDtUtc).toBe('2026-06-01T08:05:00.000Z')
    expect(r.estEndDtUtc).toBe('2026-06-01T10:05:00.000Z')
    expect(r.actTakeOffUtc).toBe('2026-06-01T08:20:00.000Z')
    expect(r.actTouchDownUtc).toBe('2026-06-01T09:55:00.000Z')
    expect(r.segType).toBe('I')
    expect(r.deviceCode).toBe('DEV1')
  })

  it('defaults seg type to J and est/take-off to null when absent', () => {
    const r = transformF8Flights([rawFlight], 'F8')[0]
    expect(r.segType).toBe('J')
    expect(r.deviceCode).toBe('')
    expect(r.estStrDtUtc).toBeNull()
    expect(r.actTakeOffUtc).toBeNull()
  })

  it('falls back to fltId when fltNum is absent', () => {
    const { fltNum: _, ...rawNoFltNum } = rawFlight
    const records = transformF8Flights([rawNoFltNum], 'F8')
    expect(records[0].fltNum).toBe('12345')
  })

  it('skips records with missing fltId or datOp', () => {
    const records = transformF8Flights([{ fltId: '', datOp: '' }], 'F8')
    expect(records).toHaveLength(0)
  })
})
