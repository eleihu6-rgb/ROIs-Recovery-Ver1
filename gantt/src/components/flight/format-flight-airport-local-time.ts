import { formatTime } from '@/stores/timezone-store'

/**
 * Format a UTC instant as HH:mm in an airport IANA zone.
 * Missing instant or zone → em dash.
 */
export const formatFlightAirportLocalTime = (
  utcIso: string | null | undefined,
  zoneId: string | undefined,
): string => {
  if (!utcIso || !zoneId) return '—'
  try {
    return formatTime(utcIso, zoneId)
  } catch {
    return '—'
  }
}
