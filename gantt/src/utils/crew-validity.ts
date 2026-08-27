type EffRecord = { effDt: string; expDt: string | null }

const ms = (iso: string | null | undefined): number | null => {
  if (iso == null) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

const coversWindowEnd = (recs: EffRecord[], winEndMs: number): boolean =>
  recs.some((r) => {
    const eff = ms(r.effDt)
    const exp = ms(r.expDt)
    return eff !== null && eff <= winEndMs && (exp === null || exp >= winEndMs)
  })

/** Last covered instant (max expDt) among records overlapping the window, or null. */
const lastCoverageMs = (recs: EffRecord[], winStartMs: number, winEndMs: number): number | null => {
  let max: number | null = null
  for (const r of recs) {
    const eff = ms(r.effDt)
    const exp = ms(r.expDt)
    if (eff == null || exp == null) continue // null exp ⇒ covers end, handled by coversWindowEnd
    if (eff <= winEndMs && exp >= winStartMs && (max === null || exp > max)) max = exp
  }
  return max
}

/**
 * Earliest instant inside [winStartMs, winEndMs) at which the crew loses rank OR base
 * coverage (no record covering after that instant). Returns null when the crew is
 * covered through the window end, or the gap is outside the window.
 */
export function computeValidityBlock(
  ranks: EffRecord[],
  bases: EffRecord[],
  winStartMs: number,
  winEndMs: number,
): number | null {
  const rankCovers = coversWindowEnd(ranks, winEndMs)
  const baseCovers = coversWindowEnd(bases, winEndMs)
  if (rankCovers && baseCovers) return null
  const ends = [
    rankCovers ? null : lastCoverageMs(ranks, winStartMs, winEndMs),
    baseCovers ? null : lastCoverageMs(bases, winStartMs, winEndMs),
  ].filter((v): v is number => v !== null)
  if (ends.length === 0) return null
  const block = Math.min(...ends)
  return block > winStartMs && block < winEndMs ? block : null
}
