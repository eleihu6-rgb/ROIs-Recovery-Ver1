import type { RosterGroundRecord, SingleLegFlightRecord } from '../../../types/import-jobs.js'
import type { RejectionRecord } from '../../../utils/rejection-store.js'
import { normalizeRosterGroundAssignment } from './normalize.js'

const toIso = (v: string | null | undefined): string =>
  v ? new Date(String(v).replace(' ', 'T')).toISOString() : ''

const crewDivision = (rec: Record<string, unknown>): string => {
  const d = String(rec['division'] ?? 'P').trim().toUpperCase().slice(0, 1)
  return d === 'P' || d === 'C' ? d : 'P'
}

const toCredit = (rec: Record<string, unknown>): number => {
  const value = rec['credit'] ?? rec['creditedMinutes'] ?? rec['Credit'] ?? 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export interface TransformRosterGroundResult {
  groundRecords: RosterGroundRecord[]
  singleLegRecords: SingleLegFlightRecord[]
  rejected: RejectionRecord[]
}

/**
 * Split the F8 flight label into a 2-char airline prefix and the numeric part.
 * Returns `null` when the label is too short or the prefix does not match the
 * configured airline. The caller falls back to the configured `airline` in that
 * case and leaves the original label as-is.
 */
const splitAirlinePrefix = (label: string, airline: string): { airline: string; fltNum: string } | null => {
  const raw = label.trim()
  const upperAirline = airline.trim().toUpperCase()
  if (raw.length < 3 || upperAirline.length === 0) return null
  if (raw.slice(0, upperAirline.length).toUpperCase() !== upperAirline) return null
  const fltNum = raw.slice(upperAirline.length).trim()
  if (!fltNum) return null
  return { airline: upperAirline, fltNum }
}

/**
 * Transform fetched rosterGround records into typed import records.
 *
 * @param groundRaw    non-Flight assignment records (Illness/Vacation/...).
 * @param singleLegRaw Flight assignment records with pairingId=0 (single legs).
 * @param crewSet      crew ids present in DB; records for unknown crew are rejected.
 * @param airline      2-char IATA airline code (e.g. "F8"). Used to split the F8 flight
 *                     label into airline + flight-number so the downstream flight lookup
 *                     can match by the 5-tuple (airline/flt_dt/dep_arp/arv_arp/flt_num).
 */
export function transformF8RosterGround(
  groundRaw: unknown[],
  singleLegRaw: unknown[],
  crewSet: Set<string>,
  airline: string,
): TransformRosterGroundResult {
  const groundRecords: RosterGroundRecord[] = []
  const singleLegRecords: SingleLegFlightRecord[] = []
  const rejected: RejectionRecord[] = []

  for (const item of groundRaw) {
    const r = item as Record<string, unknown>
    const crewId = String(r['crewId'] ?? '').slice(0, 30)
    if (!crewId) {
      rejected.push({ crewId: '', reason: 'roster_ground: missing crewId', raw: item })
      continue
    }
    if (!crewSet.has(crewId)) {
      rejected.push({ crewId, reason: 'crew_id not found in DB', raw: item })
      continue
    }

    const strDtUtc = toIso(r['startTimeUtc'] as string)
    const endDtUtc = toIso(r['endTimeUtc'] as string)
    if (!strDtUtc || !endDtUtc) {
      rejected.push({ crewId, reason: 'roster_ground: missing start/end time', raw: item })
      continue
    }

    groundRecords.push({
      crewId,
      assignment: normalizeRosterGroundAssignment(String(r['assignment'] ?? '')),
      assignmentGroup: String(r['assignmentGroup'] ?? 'GRD').slice(0, 20),
      location: String(r['location'] ?? '').slice(0, 3),
      depArp: String(r['startLocation'] ?? r['location'] ?? '').slice(0, 3),
      arvArp: String(r['endLocation'] ?? r['location'] ?? '').slice(0, 3),
      strDtUtc,
      endDtUtc,
      division: crewDivision(r),
      label: String(r['label'] ?? '').slice(0, 200),
      role: String(r['trainingRole'] ?? '').slice(0, 20),
      credit: toCredit(r),
      source: 'PA',
    })
  }

  for (const item of singleLegRaw) {
    const r = item as Record<string, unknown>
    const crewId = String(r['crewId'] ?? '').slice(0, 30)
    if (!crewId) {
      rejected.push({ crewId: '', reason: 'single-leg: missing crewId', raw: item })
      continue
    }
    if (!crewSet.has(crewId)) {
      rejected.push({ crewId, reason: 'crew_id not found in DB', raw: item })
      continue
    }

    const strDtUtc = toIso(r['startTimeUtc'] as string)
    const rawLabel = String(r['label'] ?? '').trim()
    const split = splitAirlinePrefix(rawLabel, airline)
    singleLegRecords.push({
      crewId,
      airline: split ? split.airline : airline,
      interfaceFltId: String(r['fltId'] ?? '').trim(),
      label: split ? split.fltNum : rawLabel,
      strDtUtc,
      endTimeUtc: toIso(r['endTimeUtc'] as string),
      checkInUtc: toIso(r['checkInUtc'] as string),
      dutyEndUtc: toIso(r['dutyEndUtc'] as string),
      actualDepartureTime: String(r['actualDepartureTime'] ?? ''),
      actualArrivalTime: String(r['actualArrivalTime'] ?? ''),
      startLocation: String(r['startLocation'] ?? r['location'] ?? '').slice(0, 3),
      endLocation: String(r['endLocation'] ?? r['location'] ?? '').slice(0, 3),
      division: crewDivision(r),
      credit: toCredit(r),
      source: 'PA',
    })
  }

  return { groundRecords, singleLegRecords, rejected }
}
