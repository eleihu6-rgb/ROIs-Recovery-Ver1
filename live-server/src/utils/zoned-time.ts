// zoned-time.ts — convert a wall-clock time in an IANA zone to a UTC Date (DST-correct, no deps)
//
// Intl.DateTimeFormat instantiation with a timeZone loads tz data and is expensive
// (~90µs vs ~2µs for a cached formatter). Manday recompute calls these helpers tens of
// thousands of times per scenario patch, so formatters are cached per (locale, zone, opts).
const formatterCache = new Map<string, Intl.DateTimeFormat>()
const cachedFormatter = (locale: string, zoneId: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const key = `${locale}|${zoneId}|${JSON.stringify(options)}`
  let fmt = formatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { ...options, timeZone: zoneId })
    formatterCache.set(key, fmt)
  }
  return fmt
}

const offsetMinutes = (date: Date, zoneId: string): number => {
  const dtf = cachedFormatter('en-US', zoneId, {
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a }, {})
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? '0' : p.hour), +p.minute, +p.second)
  return (asUTC - date.getTime()) / 60000
}

const localDateFmt = (zoneId: string): Intl.DateTimeFormat =>
  cachedFormatter('en-CA', zoneId, { year: 'numeric', month: '2-digit', day: '2-digit' })

/** Format a UTC ISO timestamp as `YYYY-MM-DD` in the given IANA zone (same output as the
 *  per-call formatter it replaces — only the formatter lifecycle is cached). */
export const localDateInZone = (utcIso: string, zoneId: string): string => {
  try {
    return localDateFmt(zoneId).format(new Date(utcIso))
  } catch {
    return utcIso.slice(0, 10)
  }
}

export const localWallTimeToUtc = (
  year: number, month1to12: number, day: number, hh: number, mm: number, zoneId: string,
): Date => {
  const guess = Date.UTC(year, month1to12 - 1, day, hh, mm)
  const off1 = offsetMinutes(new Date(guess), zoneId)
  let utc = guess - off1 * 60000
  const off2 = offsetMinutes(new Date(utc), zoneId)
  if (off2 !== off1) utc = guess - off2 * 60000
  return new Date(utc)
}
