export interface FlightRow {
  stdUtc: Date   // sch_str_dt_utc
  staUtc: Date   // sch_end_dt_utc
  blkMin: number // flight.blk_min
}

export interface RecentFlightHours {
  last24h: number   // minutes
  last7d: number
  last28d: number
  last90d: number
  last365d: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compute rolling block-minute sums for multiple windows.
 * Pure function -- no DB access. Expects flights sorted by stdUtc ascending.
 *
 * A flight counts if: staUtc <= referenceTime (landed before pairing starts)
 * Window boundary: stdUtc >= referenceTime - N days
 */
export function computeWindowSums(
  referenceTime: Date,
  flights: FlightRow[],
): RecentFlightHours {
  const refMs = referenceTime.getTime()
  const windows = [1, 7, 28, 90, 365].map((d) => refMs - d * DAY_MS)
  const sums = [0, 0, 0, 0, 0]

  for (const f of flights) {
    if (f.stdUtc.getTime() > refMs) break   // sorted by stdUtc asc; all subsequent flights haven't departed yet
    if (f.staUtc.getTime() > refMs) continue // still in the air at ref; don't count, but keep looking
    const startMs = f.stdUtc.getTime()
    for (let i = 0; i < 5; i++) {
      if (startMs >= windows[i]) sums[i] += f.blkMin
    }
  }

  return {
    last24h: sums[0],
    last7d: sums[1],
    last28d: sums[2],
    last90d: sums[3],
    last365d: sums[4],
  }
}
