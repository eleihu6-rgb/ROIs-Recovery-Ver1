/**
 * FDP durations are shown to controllers in hours, never raw minutes — a flight
 * delay and its FDP discretion are reasoned about as "1.5 hours", not "90 min"
 * that the reader has to divide in their head.
 */

/** A whole FDP duty length, e.g. 840 → "14h 00m", 930 → "15h 30m". */
export const formatFdpHm = (min: number): string => {
  const total = Math.max(0, Math.round(min))
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`
}

/**
 * An FDP extension / discretion amount in decimal hours, e.g. 90 → "1.5 h",
 * 60 → "1 h", 75 → "1.25 h". Trailing zeros are trimmed so round values stay clean.
 */
export const formatFdpHours = (min: number): string => {
  const hours = Math.round(min) / 60
  return `${Number(hours.toFixed(2))} h`
}

/** Signed decimal-hours delta for the Before → Proposed chip, e.g. +90 → "+1.5 h". */
export const formatFdpHoursDelta = (min: number): string =>
  `${min > 0 ? '+' : ''}${formatFdpHours(min)}`

/** Minutes for a decimal-hours controller input ("1.5" → 90). Empty/NaN → 0. */
export const fdpHoursToMin = (hours: string | number): number => {
  const value = typeof hours === 'number' ? hours : Number(hours)
  return Number.isFinite(value) ? Math.round(value * 60) : 0
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Report/Release instants shown as a compact UTC stamp, e.g.
 * "2026-09-29T23:15:00.000Z" → "29 Sep 23:15Z". Keeping the day makes a delay that
 * pushes the release past midnight (→ "30 Sep 00:45Z") legible at a glance, where a
 * raw ISO string buries the +1-day rollover. Returns the input unchanged if unparseable.
 */
export const formatUtcStamp = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm}Z`
}
