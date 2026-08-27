// gantt/src/components/scenario/distribution-model.ts
// Ported from the Report's ScheduleDistribution distributionModel.ts — the pure
// day-bucketing model for the Scenario Distribution tab. Kept verbatim (minus the
// Gantt-header-only filterCrewsByRank/filterDemandByRank/compareRanks helpers the
// scenario tab never calls) so the tab and the Report count the same numbers.
//
// Counting conventions, shared with the Report:
// - A task counts on every local day its [start, end) span overlaps, so a
//   Jul 15 → 21 pairing adds one to all seven days (slot-days).
// - Uncovered demand is per expanded slot, never de-duplicated by original
//   pairing id — each slot is one unit of planned demand.
// - "Available" is the pre-solve line: a crew is available on a day iff no
//   pre-assignment (work activity or day off) overlaps it. Solver-assigned
//   pairings do not reduce availability — the line shows the capacity the
//   solver had to work with.

import { floorLocalDay, nextLocalDay, HOUR, UTC } from './distribution-day-math'

export const ALL_RANKS = 'ALL'

export interface DistributionTask {
  id?: string
  label?: string
  kind: 'assigned' | 'preassign' | 'wanted'
  start: string // ISO-8601 UTC (…Z)
  end: string
  sub?: string
  reserve?: boolean // true for reserve/standby pairings (vs flight)
}

export interface DistributionCrew {
  crew_id: string
  rank: string
  tasks: DistributionTask[]
}

// One uncovered slot of open demand, split by seat rank and pairing type.
export interface DistributionDemand {
  start: string // ISO-8601 UTC (…Z)
  end: string
  reserve: boolean // true = reserve, false = pairing
  rank: string // seat rank (CA/FO/…)
}

/** Seat ordering for rank filter chips; unknown ranks sort last, then A–Z. */
const RANK_ORDER: Record<string, number> = { CA: 0, FO: 1, IFD: 2, FA: 3 }

export interface DayMeta {
  key: string // local date in the active tz, e.g. '2026 Jul 01'
  startMs: number // UTC instant of the local midnight opening the day
  endMs: number
  weekday: string // 'Mon'
  day: number // 21
  month: string // 'Jul'
  weekend: boolean
  monthStart: boolean // day === 1 (month separators; first tick also shows month)
}

export interface DayRow {
  key: string
  assignedPairing: number
  assignedReserve: number
  available: number
  uncoveredPairing: number
  uncoveredReserve: number
}

export interface DistributionTotals {
  assignedPairingSlots: number // task counts, not day-expanded
  assignedReserveSlots: number
  uncoveredPairingSlots: number // demand slot counts
  uncoveredReserveSlots: number
  crewCount: number
  busyCrewDays: number // distinct crew-days with an assigned task
  busyPairingCrewDays: number // …with an assigned pairing (utilization under the type filter)
  busyReserveCrewDays: number // …with an assigned reserve
  availableCrewDays: number // distinct pre-solve blank crew-days
  avgAvailable: number // availableCrewDays / days
}

export interface DistributionData {
  days: DayMeta[]
  rows: DayRow[]
  totals: DistributionTotals
}

/** Distinct rank filter options across crews and open demand, seat-sorted. */
export function rankOptions(crews: DistributionCrew[], demand: DistributionDemand[] | undefined): string[] {
  const ranks = new Set<string>()
  for (const c of crews) {
    const r = String(c.rank || '').trim().toUpperCase()
    if (r) ranks.add(r)
  }
  for (const d of demand ?? []) {
    for (const token of String(d.rank || '').split(',')) {
      const r = token.trim().toUpperCase()
      if (r && r !== '—') ranks.add(r)
    }
  }
  return [...ranks].sort(
    (a, b) => (RANK_ORDER[a] ?? 99) - (RANK_ORDER[b] ?? 99) || a.localeCompare(b),
  )
}

/**
 * Chart window as [min, max) UTC ms, snapped to local days in `tz`. Mirrors the
 * Report's range: the provided window when present, else the task-span extent.
 */
export function dayRange(
  crews: DistributionCrew[],
  window: { start: string; end: string } | undefined,
  demand: DistributionDemand[] | undefined,
  tz: string,
): { min: number; max: number } | null {
  let min = window?.start ? new Date(window.start).getTime() : Infinity
  let max = window?.end ? new Date(window.end).getTime() : -Infinity
  if (!window?.start || !window?.end) {
    for (const c of crews) {
      for (const t of c.tasks) {
        min = Math.min(min, new Date(t.start).getTime())
        max = Math.max(max, new Date(t.end).getTime())
      }
    }
    for (const d of demand ?? []) {
      min = Math.min(min, new Date(d.start).getTime())
      max = Math.max(max, new Date(d.end).getTime())
    }
  }
  if (!isFinite(min) || !isFinite(max) || max <= min) return null
  const lo = floorLocalDay(tz, min)
  let hi = floorLocalDay(tz, max)
  if (hi < max) hi = nextLocalDay(tz, hi)
  return { min: lo, max: hi }
}

const WEEKEND = new Set(['Sat', 'Sun'])
const _dayFmt = new Map<string, Intl.DateTimeFormat>()
function dayParts(tz: string, ms: number): { key: string; weekday: string; day: number; month: string } {
  let dtf = _dayFmt.get(tz)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
    })
    _dayFmt.set(tz, dtf)
  }
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value
  return {
    key: `${p.year} ${p.month} ${p.day}`, // unique per local day; display uses the parts
    weekday: String(p.weekday),
    day: Number(p.day),
    month: String(p.month),
  }
}

/** Local-day grid for the window, with weekday/weekend metadata for the axis. */
export function buildDays(range: { min: number; max: number }, tz: string): DayMeta[] {
  const days: DayMeta[] = []
  for (let t = range.min; t < range.max; t = nextLocalDay(tz, t)) {
    // Sample at local noon, clear of both midnight boundaries even on DST days.
    const { key, weekday, day, month } = dayParts(tz, t + 12 * HOUR)
    days.push({
      key,
      startMs: t,
      endMs: nextLocalDay(tz, t),
      weekday,
      day,
      month,
      weekend: WEEKEND.has(weekday),
      monthStart: day === 1,
    })
  }
  return days
}

export function matchesRank(crewRank: string, rank: string): boolean {
  return rank === ALL_RANKS || crewRank.trim().toUpperCase() === rank
}

export function demandMatchesRank(demandRank: string, rank: string): boolean {
  if (rank === ALL_RANKS) return true
  return String(demandRank || '')
    .split(',')
    .some((token) => token.trim().toUpperCase() === rank)
}

/** Indices of `days` a [startMs, endMs) span overlaps (half-open per day). */
function overlappedDays(days: DayMeta[], s: number, e: number): number[] {
  const idx: number[] = []
  for (let i = 0; i < days.length; i++) {
    if (s < days[i].endMs && e > days[i].startMs) idx.push(i)
  }
  return idx
}

/**
 * Per-day distribution for the selected rank ('ALL' for every crew/slot):
 * assigned pairing/reserve slot-days, uncovered pairing/reserve slot-days, and
 * the pre-solve available-crew count, plus the headline totals for the tiles.
 */
export function buildDistribution(
  crews: DistributionCrew[],
  demand: DistributionDemand[] | undefined,
  days: DayMeta[],
  rank: string,
): DistributionData {
  const n = days.length
  const assignedPairing = new Array<number>(n).fill(0)
  const assignedReserve = new Array<number>(n).fill(0)
  const available = new Array<number>(n).fill(0)
  const uncoveredPairing = new Array<number>(n).fill(0)
  const uncoveredReserve = new Array<number>(n).fill(0)

  let assignedPairingSlots = 0
  let assignedReserveSlots = 0
  let busyCrewDays = 0
  let busyPairingCrewDays = 0
  let busyReserveCrewDays = 0
  let availableCrewDays = 0
  let crewCount = 0

  for (const crew of crews) {
    if (!matchesRank(String(crew.rank || ''), rank)) continue
    crewCount += 1
    const preassigned = new Set<number>()
    const busy = new Set<number>()
    const busyPairing = new Set<number>()
    const busyReserve = new Set<number>()
    for (const t of crew.tasks) {
      if (t.kind !== 'assigned' && t.kind !== 'preassign') continue // 'wanted' never counts
      const s = new Date(t.start).getTime()
      const e = new Date(t.end).getTime()
      if (!isFinite(s) || !isFinite(e)) continue
      const idx = overlappedDays(days, s, e)
      if (t.kind === 'preassign') {
        for (const i of idx) preassigned.add(i)
      } else {
        if (t.reserve) assignedReserveSlots += 1
        else assignedPairingSlots += 1
        for (const i of idx) {
          busy.add(i)
          if (t.reserve) {
            busyReserve.add(i)
            assignedReserve[i] += 1
          } else {
            busyPairing.add(i)
            assignedPairing[i] += 1
          }
        }
      }
    }
    busyCrewDays += busy.size
    busyPairingCrewDays += busyPairing.size
    busyReserveCrewDays += busyReserve.size
    for (let i = 0; i < n; i++) {
      if (!preassigned.has(i)) {
        available[i] += 1
        availableCrewDays += 1
      }
    }
  }

  let uncoveredPairingSlots = 0
  let uncoveredReserveSlots = 0
  for (const d of demand ?? []) {
    if (!demandMatchesRank(d.rank, rank)) continue
    const s = new Date(d.start).getTime()
    const e = new Date(d.end).getTime()
    if (!isFinite(s) || !isFinite(e)) continue
    if (d.reserve) uncoveredReserveSlots += 1
    else uncoveredPairingSlots += 1
    for (const i of overlappedDays(days, s, e)) {
      if (d.reserve) uncoveredReserve[i] += 1
      else uncoveredPairing[i] += 1
    }
  }

  const rows: DayRow[] = days.map((d, i) => ({
    key: d.key,
    assignedPairing: assignedPairing[i],
    assignedReserve: assignedReserve[i],
    available: available[i],
    uncoveredPairing: uncoveredPairing[i],
    uncoveredReserve: uncoveredReserve[i],
  }))

  return {
    days,
    rows,
    totals: {
      assignedPairingSlots,
      assignedReserveSlots,
      uncoveredPairingSlots,
      uncoveredReserveSlots,
      crewCount,
      busyCrewDays,
      busyPairingCrewDays,
      busyReserveCrewDays,
      availableCrewDays,
      avgAvailable: n > 0 ? availableCrewDays / n : 0,
    },
  }
}

// Re-export so callers don't import the day-math module separately.
export { UTC }
