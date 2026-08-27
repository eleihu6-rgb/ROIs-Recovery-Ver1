import { pairingApi, type PairingDetailResponse, type PairingCrewDetail, type PairingDutyRef } from './pairing-api'

/**
 * Session cache for the Pairing-Info dialog (detail + crew-detail), keyed by pairingId.
 *
 * Over the Asia↔Canada link (~150-250ms RTT) re-opening the same pairing otherwise pays
 * two round-trips every time. The dialog already fetches the two endpoints in parallel;
 * this removes the repeat fetch entirely on re-open.
 *
 * Correctness: the cache is cleared whenever the pairing list is reloaded
 * (`pairing-store.fetchPairings` → on filter change and after a commit touching pairings),
 * so an edited pairing never serves a stale popup. Kept small (LRU-ish cap) to bound memory.
 */
export interface PairingInfoBundle {
  detail: PairingDetailResponse
  crew: PairingCrewDetail[]
  rosterDutyRefs?: PairingDutyRef[]
}

const MAX_ENTRIES = 30
const cache = new Map<number, PairingInfoBundle>()

/** Fetch a pairing's info bundle, serving from cache on repeat opens. */
export const getPairingInfo = async (pairingId: number): Promise<PairingInfoBundle> => {
  const cached = cache.get(pairingId)
  if (cached) return cached

  const [detail, crew] = await Promise.all([
    pairingApi.getDetail(pairingId),
    pairingApi.getCrewDetail(pairingId),
  ])
  const bundle: PairingInfoBundle = { detail, crew, rosterDutyRefs: detail.rosterDutyRefs }

  // Bound the cache: drop the oldest entry (Map preserves insertion order).
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(pairingId, bundle)
  return bundle
}

/** Invalidate the whole cache — call when the pairing list is (re)loaded. */
export const clearPairingInfoCache = (): void => {
  cache.clear()
}
