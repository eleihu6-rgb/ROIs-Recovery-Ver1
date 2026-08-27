export function nextIsoDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function crewLocalRpWindowUtc(dateFrom, dateTo, offsetMin) {
  return {
    startUtcSec: Math.floor(new Date(`${dateFrom}T00:00:00Z`).getTime() / 1000) - offsetMin * 60,
    endUtcSec: Math.floor(new Date(`${nextIsoDate(dateTo)}T00:00:00Z`).getTime() / 1000) - offsetMin * 60,
  }
}

/**
 * Calendar RP bounds for Alert Center / GET /violations display overlap.
 * Matches message labels (rpFrom, rpTo). Distinct from crewLocalRpWindowUtc
 * (start_dt/end_dt), which spills into the next UTC day for Americas bases.
 */
export function calendarRpDisplayWindow(rpFrom, rpTo) {
  return {
    window_start_dt: `${rpFrom}T00:00:00.000Z`,
    window_end_dt: `${rpTo}T23:59:59.999Z`,
  }
}

/** Parse trailing `(YYYY-MM-DD, YYYY-MM-DD)` from a 7505/7507 warning message. */
export function parseRpDatesFrom7505Message(message) {
  const m = String(message ?? '').match(/\((\d{4}-\d{2}-\d{2}),\s*(\d{4}-\d{2}-\d{2})\)\s*\.?$/)
  if (!m) return null
  return { rpFrom: m[1], rpTo: m[2] }
}

/**
 * Split an inclusive YYYY-MM-DD range into full calendar months.
 * Live mutation recheck windows are often ~33–400 days; 7505/7507 bands only match
 * 30–30 / 31–31 RPs, so each month must be evaluated separately.
 */
export function listInclusiveCalendarMonths(dateFrom, dateTo) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return from && to ? [{ rpFrom: from, rpTo: to }] : []
  }
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  const yEnd = Number(to.slice(0, 4))
  const mEnd = Number(to.slice(5, 7))
  const out = []
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const mm = String(m).padStart(2, '0')
    out.push({
      rpFrom: `${y}-${mm}-01`,
      rpTo: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}
