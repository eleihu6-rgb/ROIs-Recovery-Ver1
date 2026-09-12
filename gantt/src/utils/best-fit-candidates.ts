import type { PairingItem } from '@/types/pairing'
import { classifyCoverage } from '@/utils/pairing-coverage'
import { resolveBaseTimezone } from '@/utils/base-timezone'
import { formatDateShort, formatTime, useTimezoneStore } from '@/stores/timezone-store'

/**
 * The open-pairing list Best-fit offers.
 *
 * Only pairings that still need crew (coverage `open` or `partial`) are offered —
 * the pane exists to answer "what still needs crew?" (playbook §9 product
 * principle), and a full pairing has nothing to fit. Composition rank scope
 * follows the pane's rank filter so the badge and the dialog agree.
 */

export interface BestFitPairingOption {
  pairingId: number
  label: string
  base: string
  fleet: string
  departsLocal: string
  openSlots: string
}

/** Sort key is internal — callers get the public option shape. */
type InternalPairingOption = BestFitPairingOption & { startsAtMs: number }

export const openSlotSummary = (item: PairingItem): string =>
  item.pairing.composition
    .filter((slot) => (slot.plan ?? 0) > (slot.fill ?? 0))
    .map((slot) => `${slot.rank} ×${(slot.plan ?? 0) - (slot.fill ?? 0)}`)
    .join(' · ')

export const buildBestFitPairingOptions = (
  items: PairingItem[],
  ranks: string[] = [],
): BestFitPairingOption[] => {
  const { timezone, timezoneOptions } = useTimezoneStore.getState()
  const zoneId = resolveBaseTimezone(timezoneOptions, timezone) ?? timezone ?? 'UTC'

  const options: InternalPairingOption[] = items
    .filter((item) => {
      const state = classifyCoverage(item.pairing.composition ?? [], ranks)
      return state === 'open' || state === 'partial'
    })
    .map((item) => {
      const start = item.pairing.schStrDtUtc
      return {
        pairingId: item.pairing.id,
        label: item.pairing.pairingLabel ?? `#${item.pairing.id}`,
        base: item.pairing.base ?? '',
        fleet: item.pairing.fleet ?? '',
        departsLocal: `${formatDateShort(start, zoneId)} ${formatTime(start, zoneId)}`,
        openSlots: openSlotSummary(item),
        startsAtMs: Date.parse(start),
      }
    })
    // Earliest departure first: the first batch a planner runs should be the most
    // urgent work, not an arbitrary slice of the month.
    .sort((a, b) => a.startsAtMs - b.startsAtMs || a.label.localeCompare(b.label))
  return options
    .sort((a, b) => a.startsAtMs - b.startsAtMs || a.label.localeCompare(b.label))
    .map(({ startsAtMs: _startsAtMs, ...option }) => option)
}
