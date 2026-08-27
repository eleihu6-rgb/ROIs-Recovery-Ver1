// gantt/src/components/scenario/distribution-day-math.ts
// Ported from the Report's ScheduleDistribution dayMath.ts — the DST-correct
// local-day math the distribution charts bucket by. Kept verbatim (minus the
// unused fmt/fmtStamp formatters) so the Scenario Distribution tab and the
// Report agree on which local day a task lands on in any timezone.
export const UTC = 'UTC'
export const HOUR = 3600_000
export const DAY = 24 * HOUR

// Offset (ms) of `tz` from UTC at instant `ms`; 0 for UTC. Reads the target-tz wall
// clock via Intl parts and compares to the instant, so it stays correct on DST days
// (unlike the toLocaleString round-trip, which reparses in the host timezone).
const _tzParts = new Map<string, Intl.DateTimeFormat>()
export function tzOffsetMs(tz: string, ms: number): number {
  if (tz === UTC) return 0
  let dtf = _tzParts.get(tz)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    _tzParts.set(tz, dtf)
  }
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - ms
}

// UTC instant of the local midnight at or before `ms`, in `tz`.
export function floorLocalDay(tz: string, ms: number): number {
  const off = tzOffsetMs(tz, ms)
  let mid = Math.floor((ms + off) / DAY) * DAY - off
  // On a DST-transition day the offset at the computed midnight differs from the
  // one at `ms`; recompute once with the midnight's own offset to land exactly.
  const off2 = tzOffsetMs(tz, mid)
  if (off2 !== off) mid = Math.floor((ms + off2) / DAY) * DAY - off2
  return mid
}

// UTC instant of the next local midnight after a local-midnight `ms`. Probing +30h
// lands strictly past the next midnight (23–25h away) but before the one after, so
// it stays correct across DST transitions.
export function nextLocalDay(tz: string, ms: number): number {
  return floorLocalDay(tz, ms + DAY + 6 * HOUR)
}
