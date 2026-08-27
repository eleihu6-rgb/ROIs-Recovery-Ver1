import { normalizeUtcIso } from '@/components/gantt/gantt-utils'

/**
 * Format a UTC instant as YYYY-MM-DD in an airport IANA zone.
 * Missing instant or zone → null.
 */
export const formatFlightAirportLocalDate = (
  utcIso: string | null | undefined,
  zoneId: string | undefined,
): string | null => {
  if (!utcIso || !zoneId) return null
  try {
    const d = new Date(normalizeUtcIso(utcIso))
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return null
  }
}
