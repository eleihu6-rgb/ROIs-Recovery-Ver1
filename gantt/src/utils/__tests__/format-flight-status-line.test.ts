import { describe, it, expect } from 'vitest'
import { formatFlightStatusLine } from '../format-flight-status-line'
import type { Flight, FlightComposition } from '@/types'

const baseFlight: Flight = {
  id: 1, airline: 'F8', fltDt: '2026-06-10', fltNum: '281381',
  depArp: 'YYZ', arvArp: 'YHZ',
  schDepDtUtc: '2026-06-10T17:00:00Z', schArvDtUtc: '2026-06-10T19:10:00Z',
  actDepDtUtc: '', actArvDtUtc: '', actDepArp: '', actArvArp: '',
  flightFlag: '', blkMin: 130, fleet: '7M8', register: 'C-FLKA',
  fltType: 'J', fltSts: null, isDeleted: 0, isCancelled: false,
}
const comp: FlightComposition = {
  CA: { plan: 1, actual: 1 },
  FO: { plan: 1, actual: 0 },
  FA: { plan: 4, actual: 3 },
}

describe('formatFlightStatusLine', () => {
  it('renders all fields; collapses the local date when it equals the gantt date', () => {
    const line = formatFlightStatusLine({
      flight: baseFlight, ganttZoneId: 'UTC',
      depLocalZoneId: 'America/Toronto', arvLocalZoneId: 'America/Halifax',
      composition: comp,
    })
    // gantt=UTC → 17:00/19:10 on 6/10; Toronto (EDT-4) dep 13:00; Halifax (ADT-3) arv 16:10, all 6/10.
    // Local date == gantt date → show local time only (no repeated date).
    expect(line).toBe('F8-281381 · YYZ 6/10 17:00 / 13:00L → YHZ 6/10 19:10 / 16:10L · 7M8 · C-FLKA · CA 1/1  FO 1/0  FA 4/3')
  })

  it('collapses to a single date + two times when the local date matches', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC' })
    expect(line).toContain('YYZ 6/10 17:00 / 17:00L')
  })

  it('repeats the local date only when it differs from the gantt date (cross-midnight)', () => {
    // 02:00Z on Jun11 is 22:00 Jun10 in Toronto (UTC-4). gantt=UTC → 6/11 02:00; local=6/10 22:00.
    const lateFlight = { ...baseFlight, schDepDtUtc: '2026-06-11T02:00:00Z' }
    const line = formatFlightStatusLine({
      flight: lateFlight, ganttZoneId: 'UTC', depLocalZoneId: 'America/Toronto',
    })
    expect(line).toContain('YYZ 6/11 02:00 / 6/10 22:00L')
  })

  it('hides ranks with plan=0 and actual=0', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC', composition: comp })
    expect(line).toContain('CA 1/1  FO 1/0  FA 4/3')
    expect(line).not.toContain('FA 0')
  })

  it('shows "No crew" when no composition is given', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC' })
    expect(line).not.toMatch(/(CA|FO|FA|IFD) \d/)
    expect(line.endsWith('· No crew')).toBe(true)
  })

  it('shows "No crew" when composition exists but every rank is zero', () => {
    const empty: FlightComposition = { CA: { plan: 0, actual: 0 }, FO: { plan: 0, actual: 0 }, FA: { plan: 0, actual: 0 } }
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC', composition: empty })
    expect(line.endsWith('· No crew')).toBe(true)
  })

  it('falls back to gantt tz when a local zone is missing (collapsed, time mirrored)', () => {
    const line = formatFlightStatusLine({ flight: baseFlight, ganttZoneId: 'UTC' })
    expect(line).toContain('YYZ 6/10 17:00 / 17:00L')
  })

  it('renders bare flt number when airline missing', () => {
    const line = formatFlightStatusLine({ flight: { ...baseFlight, airline: '' }, ganttZoneId: 'UTC' })
    expect(line.startsWith('281381 ·')).toBe(true)
  })

  it('does not double the carrier prefix when fltNum already embeds it', () => {
    const line = formatFlightStatusLine({ flight: { ...baseFlight, airline: 'F8', fltNum: 'F8604' }, ganttZoneId: 'UTC' })
    expect(line.startsWith('F8-604 ·')).toBe(true)
  })

  it('omits register when null', () => {
    const line = formatFlightStatusLine({ flight: { ...baseFlight, register: null }, ganttZoneId: 'UTC' })
    expect(line).not.toContain('C-FLKA')
    expect(line).toContain('7M8')
  })
})
