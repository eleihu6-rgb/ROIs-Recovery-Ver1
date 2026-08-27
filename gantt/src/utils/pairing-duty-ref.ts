import type { PairingDutyRef } from '@/services/pairing-api'
import type { PairingSegment } from '@/types/pairing'

type DutyRefLookup = Map<number, number | null>

const padMinutes = (value: number): string => String(value).padStart(2, '0')

export const formatDutyRefTz = (minutes: number | null | undefined): string => {
  if (minutes == null || !Number.isFinite(minutes)) return ''
  const absolute = Math.abs(Math.round(minutes))
  return `${minutes < 0 ? '-' : '+'}${Math.floor(absolute / 60)}:${padMinutes(absolute % 60)}`
}

export const buildPairingDutyRefLookup = (
  refs: ReadonlyArray<PairingDutyRef>,
  crewId: string | null,
  pairingId: number,
): DutyRefLookup => {
  const lookup: DutyRefLookup = new Map()
  if (!crewId) return lookup
  for (const ref of refs) {
    if (ref.crewId === crewId && ref.pairingId === pairingId) {
      lookup.set(ref.dutySeq, ref.dutyRefTz)
    }
  }
  return lookup
}

export const resolveDutyRefTz = (
  segment: Pick<PairingSegment, 'dutySeq' | 'dutyRefTz'>,
  crewRefs: DutyRefLookup,
): number | null => crewRefs.has(segment.dutySeq)
  ? crewRefs.get(segment.dutySeq) ?? null
  : segment.dutyRefTz ?? null
