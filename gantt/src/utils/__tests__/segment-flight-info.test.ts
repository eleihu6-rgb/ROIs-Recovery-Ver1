import { describe, it, expect } from 'vitest'
import { resolveSegmentFlight, segmentFlightInfo, parseFlightLabel, type SegmentFlightContext } from '../segment-flight-info'
import type { Flight, FlightComposition } from '@/types'

const storeFlight: Flight = {
  id: 100, airline: 'F8', fltDt: '2026-06-11', fltNum: '751',
  depArp: 'YWG', arvArp: 'YEG',
  schDepDtUtc: '2026-06-11T01:00:00Z', schArvDtUtc: '2026-06-11T03:05:00Z',
  actDepDtUtc: '', actArvDtUtc: '', actDepArp: '', actArvArp: '',
  flightFlag: '', blkMin: 125, fleet: '7M8', register: 'C-FLBG',
  fltType: 'J', fltSts: null, isDeleted: 0, isCancelled: false,
}

const comp: FlightComposition = {
  CA: { plan: 1, actual: 1 },
  FO: { plan: 1, actual: 1 },
  FA: { plan: 4, actual: 4 },
}

const ctx = (over: Partial<SegmentFlightContext> = {}): SegmentFlightContext => ({
  ganttZoneId: 'UTC',
  zoneIdFor: () => undefined,
  compositionById: {},
  flightById: new Map(),
  ...over,
})

describe('resolveSegmentFlight', () => {
  it('prefers the full flight from the store by fltId', () => {
    const f = resolveSegmentFlight(100, { fltNum: 'WRONG' }, new Map([[100, storeFlight]]))
    expect(f).toBe(storeFlight)
  })

  it('synthesizes a flight from inline segment fields when not in the store', () => {
    const f = resolveSegmentFlight(100, {
      airline: 'F8', fltNum: '751', depArp: 'YWG', arvArp: 'YEG',
      schDepDtUtc: '2026-06-11T01:00:00Z', schArvDtUtc: '2026-06-11T03:05:00Z', fleet: '7M8',
    }, new Map())
    expect(f).toMatchObject({ airline: 'F8', fltNum: '751', depArp: 'YWG', arvArp: 'YEG', fleet: '7M8', register: null })
  })

  it('returns null when neither store nor inline fields are sufficient', () => {
    expect(resolveSegmentFlight(100, {}, new Map())).toBeNull()
    expect(resolveSegmentFlight(null, {}, new Map())).toBeNull()
  })
})

describe('segmentFlightInfo', () => {
  it('reuses the Flight-pane renderer for a store-resolved flight, incl. composition', () => {
    const line = segmentFlightInfo(100, {}, ctx({
      flightById: new Map([[100, storeFlight]]),
      compositionById: { 100: comp },
    }))
    expect(line).toBe('F8-751 · YWG 6/11 01:00 / 01:00L → YEG 6/11 03:05 / 03:05L · 7M8 · C-FLBG · CA 1/1  FO 1/1  FA 4/4')
  })

  it('renders from inline fields with airport-local zones when the flight is not in the store', () => {
    const line = segmentFlightInfo(200, {
      airline: 'F8', fltNum: '751', depArp: 'YWG', arvArp: 'YEG',
      schDepDtUtc: '2026-06-11T01:00:00Z', schArvDtUtc: '2026-06-11T03:05:00Z', fleet: '737',
    }, ctx({ zoneIdFor: (a) => (a === 'YWG' ? 'America/Winnipeg' : 'America/Edmonton') }))
    // Winnipeg (CDT-5) 01:00Z → 6/10 20:00; gantt UTC → 6/11 01:00 (cross-midnight → local date shown).
    expect(line).toContain('YWG 6/11 01:00 / 6/10 20:00L')
    expect(line).toContain('· 737 ·')
    // No register inline → register omitted; no composition loaded → "No crew".
    expect(line!.endsWith('· No crew')).toBe(true)
  })

  it('returns null for a non-flight segment (no fltId, no inline fields)', () => {
    expect(segmentFlightInfo(null, {}, ctx())).toBeNull()
  })

  it('hides composition (no "No crew") when there is no fltId to resolve it', () => {
    const line = segmentFlightInfo(null, {
      fltNum: 'F82820', depArp: 'YVR', arvArp: 'MEX',
      schDepDtUtc: '2026-06-11T01:00:00Z', schArvDtUtc: '2026-06-11T07:00:00Z',
    }, ctx())
    expect(line).toContain('F82820 · YVR ')
    expect(line).not.toContain('No crew')
    expect(line).not.toMatch(/(CA|FO|PU|FA) \d/)
  })
})

describe('parseFlightLabel', () => {
  it('parses a roster flight label "F82820 YVR-MEX"', () => {
    expect(parseFlightLabel('F82820 YVR-MEX')).toEqual({ fltNum: 'F82820', depArp: 'YVR', arvArp: 'MEX' })
  })

  it('returns null for a pairing route label "YVR/MEX/YVR"', () => {
    expect(parseFlightLabel('YVR/MEX/YVR')).toBeNull()
  })

  it('returns null for empty/ground labels', () => {
    expect(parseFlightLabel(null)).toBeNull()
    expect(parseFlightLabel('VAC')).toBeNull()
    expect(parseFlightLabel('Training')).toBeNull()
  })
})
