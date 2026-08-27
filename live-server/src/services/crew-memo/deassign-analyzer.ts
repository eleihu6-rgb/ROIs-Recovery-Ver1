/**
 * Read-only PBS de-assignment classifier.
 *
 * Decides which crew duties should be cleared so the PBS solver can re-assign the
 * month. Pure function over normalized duties — no DB, no mutation.
 *
 * Rules (see docs/superpowers/specs/2026-06-21-crew-memo-pa-removal-design.md §3):
 *   DE_ASSIGN: flying pairings (FLY) + days off (DO)
 *   NO_TOUCH : everything else (VAC/RES/SIM/GRD/ILL/...), plus these exceptions
 *     that pull a FLY/DO back to NO_TOUCH:
 *       1. sim-commute  — an F8#### positioning pairing immediately before the first
 *          SIM and immediately after the last SIM of a contiguous sim block
 *       2. lead-in      — a pairing that starts before the month and ends in it
 *       3. tail         — a pairing that starts in the month and ends after it
 *       4. vac-adjacent — the 2 days off immediately before and after a VAC block
 */
import type { Duty, ClassifiedDuty, Disposition } from './deassign-types.js'

const overlapsMonth = (d: Duty, s: number, e: number): boolean =>
  Date.parse(d.start) < e && Date.parse(d.end) > s
const startsInMonth = (d: Duty, s: number, e: number): boolean => {
  const t = Date.parse(d.start)
  return t >= s && t < e
}
const isFly = (d: Duty): boolean => d.kind === 'FLY' && d.assignment === 'FLY'
const isDayOff = (d: Duty): boolean => d.kind === 'GRD' && d.assignment === 'DO'
const isVac = (d: Duty): boolean => d.assignment === 'VAC'
const isSim = (d: Duty): boolean => d.assignment === 'SIM'
const isCommuteLabel = (d: Duty): boolean => /^F8\d/.test(d.pairingLabel ?? '')

export const classifyDuties = (
  duties: Duty[],
  opts: { monthStart: string; monthEnd: string },
): ClassifiedDuty[] => {
  const s = Date.parse(opts.monthStart)
  const e = Date.parse(opts.monthEnd)
  const sorted = [...duties].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))

  // Find each contiguous SIM block and mark the F8 commute pairing immediately
  // before its first SIM and immediately after its last SIM.
  const commuteIds = new Set<number>()
  for (let i = 0; i < sorted.length; i++) {
    if (!isSim(sorted[i])) continue
    let j = i
    while (j + 1 < sorted.length && isSim(sorted[j + 1])) j++
    for (let k = i - 1; k >= 0; k--) {
      if (isSim(sorted[k])) break
      if (isFly(sorted[k])) {
        if (isCommuteLabel(sorted[k]) && sorted[k].pairingId) commuteIds.add(sorted[k].pairingId!)
        break
      }
    }
    for (let k = j + 1; k < sorted.length; k++) {
      if (isSim(sorted[k])) break
      if (isFly(sorted[k])) {
        if (isCommuteLabel(sorted[k]) && sorted[k].pairingId) commuteIds.add(sorted[k].pairingId!)
        break
      }
    }
    i = j
  }

  const classify = (d: Duty): { disposition: Disposition; reason: string } => {
    if (!overlapsMonth(d, s, e)) return { disposition: 'NO_TOUCH', reason: 'out-of-range' }
    if (isFly(d)) {
      if (d.pairingId && commuteIds.has(d.pairingId)) return { disposition: 'NO_TOUCH', reason: 'sim-commute' }
      if (!startsInMonth(d, s, e)) return { disposition: 'NO_TOUCH', reason: 'lead-in' }
      if (Date.parse(d.end) >= e) return { disposition: 'NO_TOUCH', reason: 'tail' }
      return { disposition: 'DE_ASSIGN', reason: 'flying' }
    }
    if (isDayOff(d)) return { disposition: 'DE_ASSIGN', reason: 'day-off' }
    return { disposition: 'NO_TOUCH', reason: `keep-${d.assignment}` }
  }

  const result: ClassifiedDuty[] = sorted.map((d) => ({ ...d, ...classify(d) }))

  // VAC-adjacency: protect the 2 days off immediately before and after each VAC block.
  for (let i = 0; i < result.length; i++) {
    if (!isVac(result[i])) continue
    let j = i
    while (j + 1 < result.length && isVac(result[j + 1])) j++
    let kept = 0
    for (let k = i - 1; k >= 0 && kept < 2; k--) {
      if (isVac(result[k])) break
      if (isDayOff(result[k])) {
        result[k].disposition = 'NO_TOUCH'
        result[k].reason = 'vac-adjacent'
        kept++
      } else break
    }
    kept = 0
    for (let k = j + 1; k < result.length && kept < 2; k++) {
      if (isVac(result[k])) break
      if (isDayOff(result[k])) {
        result[k].disposition = 'NO_TOUCH'
        result[k].reason = 'vac-adjacent'
        kept++
      } else break
    }
    i = j
  }

  return result
}
