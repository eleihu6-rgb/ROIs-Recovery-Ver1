import type { Flight } from '@/types'

/** A flight row enriched with client-side pairing/crew counts. */
export interface NaviRow {
  flight: Flight
  /** Number of loaded pairings that use this flight. */
  pairingCount: number
  /** Number of loaded crew assigned to this flight. */
  crewCount: number
}

/** Parsed "fizz" smart-filter expression. */
export interface FizzParsed {
  fltNum?: string
  dep?: string
  arr?: string
}

/** The full Flight Navi filter state. */
export interface NaviFilters {
  /** Inclusive 'YYYY-MM-DD' bounds on flight date. */
  dateStart?: string
  dateEnd?: string
  /** Exact aircraft registration. */
  register?: string
  /** Crew-coverage bucket. */
  coverage?: 'all' | 'covered' | 'uncovered'
  /** Departure / arrival airport substring. */
  dep?: string
  arr?: string
  /** Minimum block hours. */
  minBlockHours?: number
  /** Status toggles (AND-combined with the rest). */
  toggles: { dhd: boolean; rc: boolean; pc: boolean; cnl: boolean }
  /** Free-text fizz expression. */
  fizz?: string
}

const up = (s: string | null | undefined): string => (s ?? '').trim().toUpperCase()

/**
 * A flight is a deadhead when its carrier code differs from the home airline
 * (e.g. an AC-operated leg crew deadhead on, while F8 legs are operating).
 */
export const isDeadhead = (flight: Flight, homeAirline: string): boolean =>
  up(flight.airline) !== up(homeAirline)

/**
 * Parse the fizz (smart) filter grammar:
 * - `YVR-`      → departures from YVR
 * - `-YVR`      → arrivals into YVR
 * - `BKK-HKT`   → departures from BKK AND arrivals into HKT
 * - `924`       → flight-number contains match
 */
export const parseFizz = (raw: string): FizzParsed => {
  const t = up(raw)
  if (t === '') return {}
  if (t.includes('-')) {
    const [dep, arr] = t.split('-', 2)
    const out: FizzParsed = {}
    if (dep) out.dep = dep
    if (arr) out.arr = arr
    return out
  }
  return { fltNum: t }
}

/** Apply all Flight Navi filters to the rows. AND semantics across every active dimension. */
export const applyNaviFilters = (
  rows: NaviRow[],
  filters: NaviFilters,
  homeAirline: string,
): NaviRow[] => {
  const fizz = parseFizz(filters.fizz ?? '')
  return rows.filter(({ flight, pairingCount, crewCount }) => {
    if (filters.dateStart && flight.fltDt < filters.dateStart) return false
    if (filters.dateEnd && flight.fltDt > filters.dateEnd) return false
    if (filters.register && up(flight.register) !== up(filters.register)) return false
    if (filters.dep && !up(flight.depArp).includes(up(filters.dep))) return false
    if (filters.arr && !up(flight.arvArp).includes(up(filters.arr))) return false
    if (filters.minBlockHours != null && flight.blkMin / 60 < filters.minBlockHours) return false
    if (filters.coverage === 'covered' && crewCount <= 0) return false
    if (filters.coverage === 'uncovered' && crewCount > 0) return false

    const { dhd, rc, pc, cnl } = filters.toggles
    if (dhd && !isDeadhead(flight, homeAirline)) return false
    if (rc && crewCount <= 0) return false
    if (pc && pairingCount <= 0) return false
    if (cnl && !flight.isCancelled) return false

    if (fizz.fltNum && !up(flight.fltNum).includes(fizz.fltNum)) return false
    if (fizz.dep && up(flight.depArp) !== fizz.dep) return false
    if (fizz.arr && up(flight.arvArp) !== fizz.arr) return false
    return true
  })
}
