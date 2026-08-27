import { formatDateShort, formatTime } from '@/stores/timezone-store'
import type { Flight, FlightComposition } from '@/types'


/**
 * One airport stamp: `{airport} {ganttDate} {ganttTime} / {localTime}L`, or with the local
 * date repeated (`… / {localDate} {localTime}L`) only when the local calendar date differs
 * from the gantt-tz date (i.e. the instant crosses midnight between the two zones).
 */
const stamp = (airport: string, utc: string, ganttZoneId: string, localZoneId: string): string => {
  const gDate = formatDateShort(utc, ganttZoneId)
  const gTime = formatTime(utc, ganttZoneId)
  const lDate = formatDateShort(utc, localZoneId)
  const lTime = formatTime(utc, localZoneId)
  const local = gDate === lDate ? `${lTime}L` : `${lDate} ${lTime}L`
  return `${airport} ${gDate} ${gTime} / ${local}`
}

export interface FlightStatusLineArgs {
  flight: Flight
  /** Currently selected gantt timezone (IANA zoneId). */
  ganttZoneId: string
  /** Departure airport's own local timezone; falls back to ganttZoneId. */
  depLocalZoneId?: string
  /** Arrival airport's own local timezone; falls back to ganttZoneId. */
  arvLocalZoneId?: string
  /** Per-rank plan/actual; omit to hide the composition segment. */
  composition?: FlightComposition
  /** When true, drop the composition segment entirely (no "No crew") — used where composition
   *  can't be resolved at all (e.g. a roster row with no fltId). */
  hideComposition?: boolean
}

/**
 * Build the bottom-left status-bar line for a hovered flight.
 * Format: `F8-281381 · YYZ 6/10 17:00 / 13:00L → YHZ 6/10 19:10 / 16:10L · 7M8 · C-FLKA · CA 1/1  FO 1/0  FA 4/3`
 * Each stamp is M/D + HH:MM in the gantt-selected tz, then the airport-local time (suffixed `L`); the
 * local date is repeated only when it differs from the gantt-tz date (cross-midnight).
 * Composition shows per-rank plan/actual, or `No crew` when the flight has no plan and no rostered crew.
 */
export const formatFlightStatusLine = (args: FlightStatusLineArgs): string => {
  const { flight, ganttZoneId, depLocalZoneId, arvLocalZoneId, composition, hideComposition } = args

  // Flight number as `{carrier}-{number}`. Some data stores fltNum with the carrier already
  // embedded (e.g. airline "F8", fltNum "F8604") — strip it so we never double the prefix.
  const bareNum = flight.airline && flight.fltNum.startsWith(flight.airline)
    ? flight.fltNum.slice(flight.airline.length)
    : flight.fltNum
  const fltLabel = flight.airline ? `${flight.airline}-${bareNum}` : flight.fltNum

  const depSeg = stamp(flight.depArp, flight.schDepDtUtc, ganttZoneId, depLocalZoneId || ganttZoneId)
  const arvSeg = stamp(flight.arvArp, flight.schArvDtUtc, ganttZoneId, arvLocalZoneId || ganttZoneId)
  const route = `${depSeg} → ${arvSeg}`

  const parts: string[] = [fltLabel, route]
  if (flight.fleet) parts.push(flight.fleet)
  if (flight.register) parts.push(flight.register)

  // Composition: per-rank plan/actual; when a flight has no plan and no rostered crew at all,
  // show an explicit "No crew" so empty is distinguishable from broken. Skipped entirely when
  // composition can't be resolved at all (hideComposition).
  if (!hideComposition) {
    const compSeg = composition
      ? Object.entries(composition)
          .filter(([, c]) => c.plan > 0 || c.actual > 0)
          .map(([r, c]) => `${r} ${c.plan}/${c.actual}`)
          .join('  ')
      : ''
    parts.push(compSeg || 'No crew')
  }

  return parts.join(' · ')
}
