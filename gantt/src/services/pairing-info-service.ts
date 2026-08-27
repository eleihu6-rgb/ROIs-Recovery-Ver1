import { getPairingInfo, type PairingInfoBundle } from './pairing-detail-cache'
import type { PairingCompositionRow, PairingDetailResponse, PairingDutyRef } from './pairing-api'
import { usePairingStore } from '@/stores/pairing-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'

/**
 * Home base for Pairing Info "Crew on Pairing".
 * Prefer crew_base (panelBase / bases history); roster_flight.base is often blank
 * and must not block the fallback (`'' ?? x` would keep '').
 */
export const resolvePairingCrewBase = (
  rosterBase: string | null | undefined,
  crew: { panelBase?: string | null; bases?: ReadonlyArray<{ base: string }> } | null | undefined,
): string | null =>
  crew?.panelBase || crew?.bases?.[0]?.base || (rosterBase || null) || null

const crewPairingCreditMin = (
  rosterItems: ReadonlyArray<{
    crewId: string
    dutySeq?: number | null
    actCreditedMinutes: string | null
    schCreditedMinutes: string | null
    dutyActCreditedMinutes?: string | null
  }>,
  crewId: string,
): number | null => {
  const byDuty = new Map<number, { priority: number; minutes: number }>()
  for (const r of rosterItems) {
    if (r.crewId !== crewId) continue
    const dutySeq = r.dutySeq ?? 0
    const raw = r.actCreditedMinutes != null
      ? { priority: 3, value: r.actCreditedMinutes }
      : r.schCreditedMinutes != null
        ? { priority: 2, value: r.schCreditedMinutes }
        : r.dutyActCreditedMinutes != null
          ? { priority: 1, value: r.dutyActCreditedMinutes }
          : null
    if (!raw) continue
    const minutes = Math.round(Number(raw.value))
    if (!Number.isFinite(minutes) || minutes <= 0) continue
    const prev = byDuty.get(dutySeq)
    if (!prev || raw.priority > prev.priority) byDuty.set(dutySeq, { priority: raw.priority, minutes })
  }
  const total = [...byDuty.values()].reduce((sum, entry) => sum + entry.minutes, 0)
  return total > 0 ? total : null
}

/** Try to build a PairingInfoBundle from already-loaded store data (zero network). */
function tryBuildFromLocal(pairingId: number): PairingInfoBundle | null {
  const { items: pairingItems } = usePairingStore.getState()
  const pairingItem = pairingItems.find((item) => item.pairing.id === pairingId)
  if (!pairingItem) return null

  const p = pairingItem.pairing
  const segments = pairingItem.segments

  // Reconstruct composition rows from the composition slots already on the pairing object
  const compositions: PairingCompositionRow[] = p.composition.map((slot) => ({
    actingRank: slot.rank,
    plan: slot.plan,
    fill: slot.fill,
    open: slot.plan - slot.fill,
  }))

  const detail: PairingDetailResponse = {
    pairing: p,
    segments,
    compositions,
  }

  // Gather assigned crew from roster_flight rows (one row per segment per crew — deduplicate by crewId)
  const rosterItems = useRosterStore.getState().main.rosterItems.filter(
    (r) => r.pairingId === pairingId,
  )
  const { items: crewItems } = useCrewStore.getState()

  const seenCrewIds = new Set<string>()
  const crew = rosterItems.flatMap((r) => {
    if (seenCrewIds.has(r.crewId)) return []
    seenCrewIds.add(r.crewId)

    const crewItem = crewItems.find((c) => c.crew.crewId === r.crewId)
    return [{
      crewId: r.crewId,
      name: crewItem
        ? `${crewItem.crew.lastName}/${crewItem.crew.firstName}`
        : r.crewId,
      gender: crewItem?.crew.gender ?? null,
      base: resolvePairingCrewBase(r.base, crewItem?.crew),
      position: r.position ?? null,
      crewRank: r.activeRank ?? null,
      actingRank: r.rosterActingRank ?? r.activeRank ?? r.flightActingRank ?? null,
      rosterActingRank: r.rosterActingRank ?? null,
      flightActingRank: r.flightActingRank ?? null,
      source: r.source ?? null,
      mbhMin: null,
      creditMin: crewPairingCreditMin(rosterItems, r.crewId),
    }]
  })

  const refsByKey = new Map<string, PairingDutyRef>()
  for (const item of rosterItems) {
    if (item.dutySeq == null || item.dutyRefTz === undefined) continue
    const key = `${item.crewId}:${item.dutySeq}`
    if (!refsByKey.has(key)) {
      refsByKey.set(key, {
        crewId: item.crewId,
        pairingId,
        dutySeq: item.dutySeq,
        dutyRefTz: item.dutyRefTz,
      })
    }
  }

  return { detail, crew, rosterDutyRefs: [...refsByKey.values()] }
}

/**
 * Get pairing info bundle — local stores first, server fallback.
 * Falls back to server if the pairing is not yet in the local pairing-store
 * (e.g. the pane hasn't been loaded yet), OR if local crew rows still lack a
 * home base (roster_flight.base blank and crew not in crew-store). Uses the
 * session cache in pairing-detail-cache for repeat server fetches.
 */
export const getPairingInfoWithLocalFirst = async (
  pairingId: number,
): Promise<PairingInfoBundle> => {
  const local = tryBuildFromLocal(pairingId)
  if (!local) return getPairingInfo(pairingId)
  // Server listCrewDetail resolves crew_base; use it when local base is still empty.
  if (local.crew.some((c) => !c.base)) return getPairingInfo(pairingId)
  return local
}
