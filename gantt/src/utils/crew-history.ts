type EffRecord = { effDt: string; expDt: string | null }

/**
 * Returns all records effective on `date`:
 *   eff_dt <= date AND (exp_dt IS NULL OR exp_dt > date)
 * Multiple records may match simultaneously (e.g. dual ratings).
 */
export function getAllEffective<T extends EffRecord>(records: T[], date: Date): T[] {
  return records.filter((r) => {
    const eff = new Date(r.effDt)
    const exp = r.expDt ? new Date(r.expDt) : null
    return eff <= date && (exp === null || exp > date)
  })
}

/** Returns the single effective record with the latest eff_dt, or null if none match. */
export function getEffective<T extends EffRecord>(records: T[], date: Date): T | null {
  const matches = getAllEffective(records, date)
  if (matches.length === 0) return null
  return matches.reduce((best, r) =>
    new Date(r.effDt) > new Date(best.effDt) ? r : best,
  )
}
