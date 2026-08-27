// Split flight-leg block minutes across crew-base local midnights.
// Spec: docs/superpowers/specs/2026-07-20-manday-blh-base-midnight-split-design.md
import { localWallTimeToUtc, localDateInZone } from '../../utils/zoned-time.js'

export interface BlhDayShare {
  localDate: string
  minutes: number
}

export interface SplitBlhOpts {
  depUtc: string
  arvUtc: string
  blkMin: number
  /** Both act_dep and act_arv present — use absolute act wall minutes. */
  hasAct: boolean
  zoneId: string
}

export interface SplitDutyDpOpts {
  startUtc: string
  endUtc: string
  totalDutyMinutes?: number
  dpPct: number
  zoneId: string
}

const toLocalDate = (utcIso: string, zoneId: string): string => localDateInZone(utcIso, zoneId)

const addCalendarDays = (localDate: string, days: number): string => {
  const [y, m, d] = localDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

const midnightUtcMs = (localDate: string, zoneId: string): number => {
  const [y, m, d] = localDate.split('-').map(Number)
  return localWallTimeToUtc(y, m, d, 0, 0, zoneId).getTime()
}

/** Wall-clock overlap minutes of [dep, arv) with each local calendar day in zone. */
const wallOverlapsByDay = (
  depMs: number,
  arvMs: number,
  zoneId: string,
): BlhDayShare[] => {
  if (!(arvMs > depMs)) return []
  const startDate = toLocalDate(new Date(depMs).toISOString(), zoneId)
  const endDate = toLocalDate(new Date(arvMs).toISOString(), zoneId)
  const out: BlhDayShare[] = []
  for (let d = startDate; ; d = addCalendarDays(d, 1)) {
    const dayStart = midnightUtcMs(d, zoneId)
    const dayEnd = midnightUtcMs(addCalendarDays(d, 1), zoneId)
    const lo = Math.max(depMs, dayStart)
    const hi = Math.min(arvMs, dayEnd)
    const minutes = Math.max(0, Math.round((hi - lo) / 60000))
    if (minutes > 0) out.push({ localDate: d, minutes })
    if (d === endDate) break
    // Safety: avoid infinite loop on bad zone math
    if (out.length > 40) break
  }
  return out
}

const allocateByWeights = (total: number, weights: number[]): number[] => {
  if (!Number.isFinite(total) || total <= 0 || weights.length === 0) return []
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  if (totalWeight <= 0) return []

  const shares: number[] = []
  let allocated = 0
  let cumulativeWeight = 0
  for (let i = 0; i < weights.length; i++) {
    const weight = Math.max(0, weights[i])
    if (i === weights.length - 1) {
      shares.push(Math.max(0, Math.round(total - allocated)))
      break
    }
    cumulativeWeight += weight
    const target = Math.round((total * cumulativeWeight) / totalWeight)
    const minutes = Math.max(0, target - allocated)
    allocated += minutes
    shares.push(minutes)
  }
  return shares
}

/**
 * Attribute a flight leg's BLH across crew-base local dates.
 * - hasAct: absolute wall minutes of [dep, arv] per local day (sum may ≠ blkMin)
 * - else: proportional shares of blkMin by sch wall overlap (sum = blkMin)
 */
export const splitBlhByBaseMidnight = (opts: SplitBlhOpts): BlhDayShare[] => {
  const zoneId = opts.zoneId || 'UTC'
  const depMs = new Date(opts.depUtc).getTime()
  const arvMs = new Date(opts.arvUtc).getTime()
  const blkMin = Math.max(0, Math.round(opts.blkMin || 0))
  const startLocal = toLocalDate(opts.depUtc, zoneId)

  if (!Number.isFinite(depMs) || !Number.isFinite(arvMs)) {
    return blkMin > 0 ? [{ localDate: startLocal, minutes: blkMin }] : []
  }

  const overlaps = wallOverlapsByDay(depMs, arvMs, zoneId)

  if (opts.hasAct) {
    return overlaps
  }

  // No act: proportional allocation of blk_min
  if (blkMin <= 0) return []
  const wall = overlaps.reduce((s, o) => s + o.minutes, 0)
  if (wall <= 0) return [{ localDate: startLocal, minutes: blkMin }]

  const shares: BlhDayShare[] = []
  let allocated = 0
  for (let i = 0; i < overlaps.length; i++) {
    const o = overlaps[i]
    const minutes =
      i === overlaps.length - 1
        ? blkMin - allocated
        : Math.round((blkMin * o.minutes) / wall)
    allocated += minutes
    if (minutes > 0) shares.push({ localDate: o.localDate, minutes })
  }
  return shares
}

export const splitDutyDpByBaseMidnight = (opts: SplitDutyDpOpts): BlhDayShare[] => {
  const zoneId = opts.zoneId || 'UTC'
  const startMs = new Date(opts.startUtc).getTime()
  const endMs = new Date(opts.endUtc).getTime()
  const fallbackDutyMinutes =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(0, Math.round((endMs - startMs) / 60000))
      : 0
  const totalDutyMinutes = Math.max(0, Math.round(opts.totalDutyMinutes ?? fallbackDutyMinutes))
  const dpPct = Number.isFinite(opts.dpPct) ? Math.max(0, opts.dpPct) : 0
  const startLocal = toLocalDate(opts.startUtc, zoneId)

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    const weighted = Math.round(totalDutyMinutes * dpPct)
    return weighted > 0 ? [{ localDate: startLocal, minutes: weighted }] : []
  }

  const overlaps = wallOverlapsByDay(startMs, endMs, zoneId)
  if (!overlaps.length) {
    const weighted = Math.round(totalDutyMinutes * dpPct)
    return weighted > 0 ? [{ localDate: startLocal, minutes: weighted }] : []
  }

  const rawShares = allocateByWeights(
    totalDutyMinutes,
    overlaps.map((share) => share.minutes),
  )
  if (!rawShares.length) return []

  const weightedTotal = Math.round(totalDutyMinutes * dpPct)
  const weightedShares = allocateByWeights(weightedTotal, rawShares)
  return overlaps
    .map((share, index) => ({ localDate: share.localDate, minutes: weightedShares[index] ?? 0 }))
    .filter((share) => share.minutes > 0)
}
