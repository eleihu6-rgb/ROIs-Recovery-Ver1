import { formatFlightStatusLine } from './format-flight-status-line'
import type { Flight, FlightComposition } from '@/types'

/** Flight fields a pairing/roster segment may carry inline (when not in the flight store). */
export type PartialSegmentFlight = Partial<
  Pick<Flight, 'airline' | 'fltNum' | 'depArp' | 'arvArp' | 'schDepDtUtc' | 'schArvDtUtc' | 'fleet' | 'register'>
>

/**
 * Parse a roster task `label` of the form `"F82820 YVR-MEX"` (`{fltNum} {dep}-{arv}`) into its
 * flight fields. Returns null for non-flight labels (pairing routes like `"YVR/MEX/YVR"`, ground
 * task names). Roster rows encode the flight identity only in this label (fltId is null).
 */
export const parseFlightLabel = (label: string | null | undefined): Pick<Flight, 'fltNum' | 'depArp' | 'arvArp'> | null => {
  if (!label) return null
  const m = label.match(/^(\S+)\s+([A-Z]{3})-([A-Z]{3})$/)
  if (!m) return null
  return { fltNum: m[1], depArp: m[2], arvArp: m[3] }
}

export interface SegmentFlightContext {
  /** Currently selected gantt timezone (IANA zoneId). */
  ganttZoneId: string
  /** Airport → IANA zoneId resolver (airport-tz store). */
  zoneIdFor: (airport: string) => string | undefined
  /** Bulk-loaded per-flight composition keyed by flight id (flight-composition store). */
  compositionById: Record<number, FlightComposition>
  /** Full flights loaded in the flight store, keyed by id (preferred source). */
  flightById: Map<number, Flight>
}

/**
 * Resolve a full `Flight` for a pairing/roster segment: prefer the flight store (by `fltId`,
 * which carries every field incl. fleet/register), otherwise synthesize one from the inline
 * fields the segment carries. Returns null when neither source has enough to render flight info.
 */
export const resolveSegmentFlight = (
  fltId: number | null,
  partial: PartialSegmentFlight,
  flightById: Map<number, Flight>,
): Flight | null => {
  if (fltId != null) {
    const fromStore = flightById.get(fltId)
    if (fromStore) return fromStore
  }
  if (partial.fltNum && partial.depArp && partial.arvArp && partial.schDepDtUtc && partial.schArvDtUtc) {
    return {
      id: fltId ?? -1,
      airline: partial.airline ?? '',
      fltDt: partial.schDepDtUtc.slice(0, 10),
      fltNum: partial.fltNum,
      depArp: partial.depArp,
      arvArp: partial.arvArp,
      schDepDtUtc: partial.schDepDtUtc,
      schArvDtUtc: partial.schArvDtUtc,
      actDepDtUtc: '', actArvDtUtc: '', actDepArp: '', actArvArp: '',
      flightFlag: '', blkMin: 0,
      fleet: partial.fleet ?? '',
      register: partial.register ?? null,
      fltType: '', fltSts: null, isDeleted: 0, isCancelled: false,
    }
  }
  return null
}

/**
 * Enhanced flight-info string for a hovered pairing/roster segment, reusing the exact same
 * renderer as the Flight pane. Returns null when the segment's flight can't be resolved (e.g. a
 * non-flight roster task, or a flight not present in the store with no inline fields) — callers
 * then keep their original status text.
 */
export const segmentFlightInfo = (
  fltId: number | null,
  partial: PartialSegmentFlight,
  ctx: SegmentFlightContext,
): string | null => {
  const flight = resolveSegmentFlight(fltId, partial, ctx.flightById)
  if (!flight) return null
  // With no fltId the composition can't be resolved at all — hide it rather than imply "No crew".
  const hideComposition = fltId == null
  return formatFlightStatusLine({
    flight,
    ganttZoneId: ctx.ganttZoneId,
    depLocalZoneId: ctx.zoneIdFor(flight.depArp),
    arvLocalZoneId: ctx.zoneIdFor(flight.arvArp),
    composition: fltId != null ? ctx.compositionById[fltId] : undefined,
    hideComposition,
  })
}
