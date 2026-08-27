// gantt/src/utils/pairing-credit.ts
//
// Shared pairing-credit helpers (single source of truth for Live + Scenario).
// The Live pairing pane (legacy fork) and the SharedPairingPane (scenario, and
// future Live 5B-2) both compute the pane "Cred" column and the open/partial
// coverage credit total from these — keep the credit math in ONE place.

import type { PairingItem } from '@/types/pairing'
import { classifyCoverage, type CoverageState } from './pairing-coverage'

/**
 * Sum of a pairing's credited minutes, deduped by dutySeq.
 * `duty_act_credited_minutes` is a duty-level value (identical across every segment
 * in the same duty), so we count it once per dutySeq. This is exactly the value the
 * pairing pane shows in its "Cred" column.
 */
export const pairingCreditedMinutes = (item: PairingItem): number => {
  const seen = new Set<number>()
  let total = 0
  for (const seg of item.segments ?? []) {
    if (!seen.has(seg.dutySeq)) {
      seen.add(seg.dutySeq)
      total += seg.dutyActCreditedMinutes ? Number(seg.dutyActCreditedMinutes) : 0
    }
  }
  return total
}

/**
 * The coverage selection is limited to the still-uncovered states (open and/or
 * partial), and is non-empty. This gates the pane "open credit" badge — it shows
 * only when the planner narrows to Open, Partial, or both (never when Full/Over
 * are part of the selection).
 */
export const isOpenPartialCoverage = (cov: CoverageState[]): boolean =>
  cov.length > 0 && cov.every((c) => c === 'open' || c === 'partial')

/**
 * Total credited minutes of the pairings in `items` whose classified coverage is in
 * `coverageSel` — i.e. how much flying the still-uncovered (open/partial) pairings
 * represent. Drives the pairing-pane open-credit badge (HH:MM).
 * Optional `ranks` scopes classification to those composition slots (rank-scoped coverage).
 */
export const sumCoverageCredit = (
  items: PairingItem[],
  coverageSel: CoverageState[],
  ranks?: string[],
): number => {
  let total = 0
  for (const it of items) {
    if (coverageSel.includes(classifyCoverage(it.pairing.composition ?? [], ranks))) {
      total += pairingCreditedMinutes(it)
    }
  }
  return total
}
