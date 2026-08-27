import { describe, it, expect } from 'vitest'
import { parseFizz, isDeadhead, applyNaviFilters, type NaviRow } from '../flight-navi-filters'
import type { Flight } from '@/types'

const f = (over: Partial<Flight>): Flight => ({
  id: 1, airline: 'F8', fltDt: '2026-06-12', fltNum: '924', depArp: 'BKK', arvArp: 'HKT',
  schDepDtUtc: '2026-06-12T00:30:00Z', schArvDtUtc: '2026-06-12T02:00:00Z',
  actDepDtUtc: '', actArvDtUtc: '', actDepArp: 'BKK', actArvArp: 'HKT',
  flightFlag: 'A', blkMin: 90, fleet: '350', register: 'HSTHX', fltType: 'PAX',
  fltSts: null, isDeleted: 0, isCancelled: false, ...over,
})
const row = (fl: Flight, pc = 0, cc = 0): NaviRow => ({ flight: fl, pairingCount: pc, crewCount: cc })
const ids = (rows: NaviRow[]): number[] => rows.map((r) => r.flight.id)
const base = { toggles: { dhd: false, rc: false, pc: false, cnl: false } } as const

describe('parseFizz', () => {
  it('YVR- → departures from YVR', () => expect(parseFizz('YVR-')).toEqual({ dep: 'YVR' }))
  it('-YVR → arrivals into YVR', () => expect(parseFizz('-YVR')).toEqual({ arr: 'YVR' }))
  it('BKK-HKT → dep + arr', () => expect(parseFizz('BKK-HKT')).toEqual({ dep: 'BKK', arr: 'HKT' }))
  it('924 → flight number', () => expect(parseFizz('924')).toEqual({ fltNum: '924' }))
  it('empty → no constraints', () => expect(parseFizz('  ')).toEqual({}))
})

describe('isDeadhead', () => {
  it('non-home carrier is deadhead', () => expect(isDeadhead(f({ airline: 'AC' }), 'F8')).toBe(true))
  it('home carrier is operating', () => expect(isDeadhead(f({ airline: 'F8' }), 'F8')).toBe(false))
})

describe('applyNaviFilters', () => {
  it('DEP filter narrows to matching departures', () => {
    const rows = [row(f({ depArp: 'BKK' })), row(f({ id: 2, depArp: 'CNX' }))]
    expect(ids(applyNaviFilters(rows, { ...base, dep: 'BKK' }, 'F8'))).toEqual([1])
  })
  it('ARR filter narrows to matching arrivals', () => {
    const rows = [row(f({ arvArp: 'HKT' })), row(f({ id: 2, arvArp: 'CNX' }))]
    expect(ids(applyNaviFilters(rows, { ...base, arr: 'HKT' }, 'F8'))).toEqual([1])
  })
  it('register filter is exact', () => {
    const rows = [row(f({ register: 'HSTHX' })), row(f({ id: 2, register: 'HSTHZ' }))]
    expect(ids(applyNaviFilters(rows, { ...base, register: 'HSTHX' }, 'F8'))).toEqual([1])
  })
  it('minBlockHours filters short flights', () => {
    const rows = [row(f({ blkMin: 180 })), row(f({ id: 2, blkMin: 30 }))]
    expect(ids(applyNaviFilters(rows, { ...base, minBlockHours: 2 }, 'F8'))).toEqual([1])
  })
  it('coverage=covered keeps crewed flights', () => {
    const rows = [row(f({}), 0, 2), row(f({ id: 2 }), 0, 0)]
    expect(ids(applyNaviFilters(rows, { ...base, coverage: 'covered' }, 'F8'))).toEqual([1])
  })
  it('coverage=uncovered keeps empty flights', () => {
    const rows = [row(f({}), 0, 2), row(f({ id: 2 }), 0, 0)]
    expect(ids(applyNaviFilters(rows, { ...base, coverage: 'uncovered' }, 'F8'))).toEqual([2])
  })
  it('R/C keeps only crew-covered', () => {
    const rows = [row(f({}), 0, 2), row(f({ id: 2 }), 0, 0)]
    expect(ids(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, rc: true } }, 'F8'))).toEqual([1])
  })
  it('P/C keeps only pairing-covered', () => {
    const rows = [row(f({}), 1, 0), row(f({ id: 2 }), 0, 0)]
    expect(ids(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, pc: true } }, 'F8'))).toEqual([1])
  })
  it('CNL keeps only cancelled', () => {
    const rows = [row(f({ isCancelled: true })), row(f({ id: 2 }))]
    expect(ids(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, cnl: true } }, 'F8'))).toEqual([1])
  })
  it('DHD keeps only deadhead (non-home carrier)', () => {
    const rows = [row(f({ airline: 'AC' })), row(f({ id: 2, airline: 'F8' }))]
    expect(ids(applyNaviFilters(rows, { ...base, toggles: { ...base.toggles, dhd: true } }, 'F8'))).toEqual([1])
  })
  it('fizz BKK-HKT matches dep + arr exactly', () => {
    const rows = [row(f({})), row(f({ id: 2, arvArp: 'CNX' }))]
    expect(ids(applyNaviFilters(rows, { ...base, fizz: 'BKK-HKT' }, 'F8'))).toEqual([1])
  })
  it('fizz -HKT matches arrivals only', () => {
    const rows = [row(f({ arvArp: 'HKT' })), row(f({ id: 2, depArp: 'HKT', arvArp: 'BKK' }))]
    expect(ids(applyNaviFilters(rows, { ...base, fizz: '-HKT' }, 'F8'))).toEqual([1])
  })
  it('fizz 924 matches flight number substring', () => {
    const rows = [row(f({ fltNum: '924' })), row(f({ id: 2, fltNum: '500' }))]
    expect(ids(applyNaviFilters(rows, { ...base, fizz: '924' }, 'F8'))).toEqual([1])
  })
  it('combines toggles AND fizz', () => {
    const rows = [
      row(f({ fltNum: '924' }), 1, 2),
      row(f({ id: 2, fltNum: '924' }), 0, 0),
      row(f({ id: 3, fltNum: '500' }), 1, 2),
    ]
    const out = applyNaviFilters(rows, { ...base, fizz: '924', toggles: { dhd: false, rc: true, pc: true, cnl: false } }, 'F8')
    expect(ids(out)).toEqual([1])
  })
})
