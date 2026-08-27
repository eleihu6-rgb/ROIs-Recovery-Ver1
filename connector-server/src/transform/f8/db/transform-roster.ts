import type { RosterFlightRecord } from '../../../types/import-jobs.js'
import type { RejectionRecord } from '../../../utils/rejection-store.js'

const RANK_MAP: Record<string, string> = {
  captain: 'CA', 'first officer': 'FO', fo: 'FO', ca: 'CA',
  purser: 'PS', 'flight attendant': 'FA', fa: 'FA',
}

const normalizeRank = (r: string): string => {
  const key = r.toLowerCase().trim()
  return RANK_MAP[key] ?? (r.length <= 4 ? r.toUpperCase() : r)
}

const mapFltType = (fltType: string): string => {
  if (fltType === 'Transport') return 'DHD'
  if (fltType === 'Simulator') return 'SIM'
  if (!fltType) return 'FLY'
  return 'GND'
}

export interface TransformRosterResult {
  records: RosterFlightRecord[]
  rejected: RejectionRecord[]
}

export function transformF8RosterFlight(
  raw: unknown[],
  crewSet: Set<string>,
  filiale: string,
): TransformRosterResult {
  const records: RosterFlightRecord[] = []
  const rejected: RejectionRecord[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    const r = item as Record<string, unknown>
    const pairingId = Number(r['pairingId'] ?? 0)

    // pairingId=0 single-leg assignments are materialized by the roster_ground
    // single-leg pipeline (synthetic pairing), not here.
    if (pairingId === 0) continue

    const crewData = (r['crew'] ?? {}) as Record<string, unknown>
    const crewId = String(crewData['crewId'] ?? r['rosterId'] ?? '').slice(0, 30)

    if (!crewSet.has(crewId)) {
      rejected.push({
        crewId,
        reason: `crew_id not found in DB`,
        raw: item,
      })
      continue
    }

    const key = `${pairingId}:${crewId}`
    if (seen.has(key)) continue
    seen.add(key)

    records.push({
      crewId,
      pairingInterfaceId: String(pairingId),
      actingRank: normalizeRank(String(crewData['actingRank'] ?? '')),
      activeRank: normalizeRank(String(crewData['activeRank'] ?? '')),
      division: String(crewData['division'] ?? 'P').slice(0, 1),
      seqOrder: Math.min(Number(crewData['seqOrder'] ?? 0), 999),
      assignment: mapFltType(String(r['fltType'] ?? '')),
      assignmentGroup: String(crewData['assignmentGroup'] ?? 'FLY').slice(0, 20),
      base: '',
      source: 'PA',
    })
  }

  return { records, rejected }
}
