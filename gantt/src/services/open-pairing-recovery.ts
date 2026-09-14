import type { CrewItem, PairingItem, RosterItem } from '@/types'
import type { DraftOp } from './draft-api'
import type { RecoveryLibraryCostApiInput, RecoveryLibraryCostApiResult } from './recovery-api'
import { buildPairingRosterItems } from '@/utils/assign-pairing-op'

export type OpenRecoveryIncident = { kind: 'unpaired-flight'; flightId: number } | { kind: 'open-pairing'; pairingId: number }
export type StaffingMethod = 'standby' | 'available' | 'move-up'
export interface StaffingOption {
  id: string
  method: StaffingMethod
  crewId: string
  crewName: string
  rank: string
  pairingId: number
  donorPairingId?: number
  standbyTaskId?: number
  beforeItems: RosterItem[]
  afterItems: RosterItem[]
  operations: DraftOp[]
  costInput: RecoveryLibraryCostApiInput
  cost?: RecoveryLibraryCostApiResult
  reasons: string[]
  ruleMessages: string[]
  ruleCheck: 'not-run' | 'pending' | 'passed' | 'failed'
  fingerprint: string
  pairingFingerprint: string
}

const start = (item: RosterItem) => Date.parse(item.briefStartUtc || item.actStrDtUtc || item.schStrDtUtc || '')
const end = (item: RosterItem) => Date.parse(item.debriefEndUtc || item.actEndDtUtc || item.schEndDtUtc || '')
export const staffingFingerprint = (items: RosterItem[]): string => JSON.stringify(items.map(item => [item.id, item.ver, item.pairingId, item.schStrDtUtc, item.schEndDtUtc, item.actStrDtUtc, item.actEndDtUtc, item.exceptionCode]).sort((a, b) => Number(a[0]) - Number(b[0])))
export const staffingPairingFingerprint = (item: Pick<PairingItem, 'pairing' | 'segments'>): string => JSON.stringify([
  item.pairing.id, item.pairing.base, item.pairing.fleet, item.pairing.division,
  item.pairing.composition.map(slot => [slot.rank, slot.plan]).sort(),
  item.segments.map(seg => [seg.id, seg.fltId, seg.dutySeq, seg.segSeq, seg.schStrDtUtc, seg.schEndDtUtc, seg.actStrDtUtc, seg.actEndDtUtc, seg.briefStartUtc, seg.debriefEndUtc]).sort((a, b) => Number(a[0]) - Number(b[0])),
])

/** Pairing store composition includes current draft coverage; never infer empty seats from a filtered crew list. */
export const openPairingSeats = (item: PairingItem) => item.pairing.composition.filter(slot => slot.plan > slot.fill)

export function buildStaffingOptions(pairing: PairingItem, rank: string, crews: CrewItem[], items: RosterItem[], now = Date.now()): StaffingOption[] {
  if (!openPairingSeats(pairing).some(slot => slot.rank === rank) || pairing.segments.length === 0) return []
  const p = pairing.pairing
  const targetStart = Date.parse(p.actStrDtUtc || p.schStrDtUtc)
  const targetEnd = Date.parse(p.actEndDtUtc || p.schEndDtUtc)
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetStart <= now) return []
  const options: StaffingOption[] = []
  for (const { crew } of crews) {
    const own = items.filter(item => item.crewId === crew.crewId)
    if (own.some(item => item.pairingId === p.id)) continue
    const crewRank = crew.panelRank ?? crew.ranks?.[0]?.rank
    const crewBase = crew.panelBase ?? crew.bases?.[0]?.base
    const fleets = crew.panelFleets ?? crew.quals?.fleetQuals ?? crew.fleets?.map(f => f.fleetSpecific) ?? []
    if (crewRank !== rank || crewBase !== p.base || crew.division !== p.division || !fleets.includes(p.fleet)) continue
    const overlaps = own.filter(item => start(item) < targetEnd && end(item) > targetStart)
    const standby = overlaps.find(item => item.pairingId == null && item.assignmentGroup === 'SBY'
      && start(item) <= targetStart && end(item) >= targetStart)
    const donors = [...new Set(overlaps.filter(item => item.pairingId != null).map(item => item.pairingId!))]
    const method: StaffingMethod = overlaps.length === 0 ? 'available' : standby && overlaps.every(item => item.id === standby.id) ? 'standby' : 'move-up'
    const donorPairingId = method === 'move-up' && donors.length === 1 && overlaps.every(item => item.pairingId === donors[0]) ? donors[0] : undefined
    if (method === 'move-up' && donorPairingId == null) continue
    const removed = donorPairingId == null ? [] : own.filter(item => item.pairingId === donorPairingId)
    if (removed.some(item => start(item) <= now)) continue
    const additions = buildPairingRosterItems(pairing, crew.crewId, rank).map(item => ({ ...item, isPending: true, isRecoveryAffected: true }))
    const after = [...own.filter(item => !removed.includes(item)).map(item => item.id === standby?.id
      ? { ...item, exceptionCode: 'CALLOUT_STANDBY', isRecoveryAffected: true } : item), ...additions]
    const operations: DraftOp[] = []
    if (donorPairingId != null) operations.push({ type: 'remove-pairing-from-crew', pairingId: donorPairingId, crewId: crew.crewId })
    if (method === 'standby' && standby) operations.push({ type: 'update', taskId: standby.id, data: { exceptionCode: 'CALLOUT_STANDBY' } })
    operations.push({ type: 'assign-pairing', pairingId: p.id, crewId: crew.crewId, rosterActingRank: rank, tasks: additions as unknown as Record<string, unknown>[] })
    options.push({ id: `${method}-${p.id}-${rank}-${crew.crewId}`, method, crewId: crew.crewId,
      crewName: [crew.firstName, crew.lastName].filter(Boolean).join(' '), rank, pairingId: p.id, donorPairingId,
      standbyTaskId: method === 'standby' ? standby?.id : undefined,
      beforeItems: own.map(item => removed.includes(item) || item.id === standby?.id ? { ...item, isRecoveryAffected: true } : item),
      afterItems: after, operations, reasons: [], ruleMessages: [], ruleCheck: 'not-run', fingerprint: staffingFingerprint(own), pairingFingerprint: staffingPairingFingerprint(pairing),
      costInput: { mode: method === 'standby' ? 'standby' : 'transfer',
        ...(method === 'standby' && standby ? { standbyContext: { crewId: crew.crewId, pairingId: p.id, standbyTaskId: standby.id } }
          : { openPairingContext: { crewId: crew.crewId, pairingId: p.id, donorPairingId } }),
        crossBase: 0, crossDivision: 0, crossRole: 0, changed: donorPairingId ? 2 : 1,
        followOnImpactCount: donorPairingId ? 1 : 0, dhdOutboundSectors: 0, dhdFlightCost: 0, dhdCostSavings: 0 },
    })
  }
  return options
}
