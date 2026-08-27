/**
 * Format credited minutes as `H:MM` (e.g. 680 → "11:20", 240 → "4:00").
 *
 * Credit columns (`sch_credited_minutes` / `duty_act_credited_minutes`) are numeric and arrive as
 * strings from the API; minutes can carry a fractional part, so the value is rounded to the nearest
 * whole minute before splitting. Returns '' for null / non-numeric / non-positive input so callers
 * can omit the segment entirely rather than print "0:00".
 */
export const formatCreditMinutes = (value: string | number | null | undefined): string => {
  if (value == null) return ''
  const min = Math.round(Number(value))
  if (!Number.isFinite(min) || min <= 0) return ''
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

/**
 * Total credited minutes for a pairing = sum of each distinct duty's credit. Credit lives at the
 * duty level (the same `dutyActCreditedMinutes` repeats on every segment of a duty), so segments
 * are deduplicated by `dutySeq` before summing — otherwise a multi-sector duty is counted N times.
 * Mirrors the backend's `MAX(duty_act_credited_minutes)` per (pairingId, dutySeq) convention.
 */
export const sumPairingCreditMinutes = (
  segments: ReadonlyArray<{ dutySeq: number; dutyActCreditedMinutes: string | null }>,
): number => {
  const byDuty = new Map<number, number>()
  for (const s of segments) {
    if (s.dutyActCreditedMinutes != null) byDuty.set(s.dutySeq, Math.round(Number(s.dutyActCreditedMinutes)))
  }
  return [...byDuty.values()].reduce((a, b) => a + b, 0)
}

/**
 * Total credited minutes for ONE crew's roster items within a calendar month (`YYYY-MM`,
 * matched on `schStrDtUtc`). Flying duties (pairingId ≠ null) are deduped by `(pairingId,dutySeq)`
 * taking `dutyActCreditedMinutes` (the same value repeats on every segment of a duty); ground items
 * (pairingId null) add `actCreditedMinutes`. Mirrors the backend's
 * `MAX(duty_act_credited_minutes)` per (crew,pairing,dutySeq) credit model (manday-credit-service.ts),
 * so a client-side `credit(virtual) − credit(base)` delta tracks the same number Save will persist.
 */
export const sumCrewCreditMinutes = (
  items: ReadonlyArray<{
    pairingId: number | null
    dutySeq?: number | null
    dutyActCreditedMinutes?: string | null
    actCreditedMinutes: string | null
    schStrDtUtc: string | null
  }>,
  yearMonth: string,
): number => {
  const byDuty = new Map<string, number>()
  let groundTotal = 0
  for (const it of items) {
    if (!it.schStrDtUtc || it.schStrDtUtc.slice(0, 7) !== yearMonth) continue
    if (it.pairingId != null) {
      const v = it.dutyActCreditedMinutes != null ? Math.round(Number(it.dutyActCreditedMinutes)) : 0
      if (Number.isFinite(v)) byDuty.set(`${it.pairingId}:${it.dutySeq ?? 0}`, v)
    } else {
      const v = it.actCreditedMinutes != null ? Math.round(Number(it.actCreditedMinutes)) : 0
      if (Number.isFinite(v)) groundTotal += v
    }
  }
  let total = groundTotal
  for (const v of byDuty.values()) total += v
  return total
}
