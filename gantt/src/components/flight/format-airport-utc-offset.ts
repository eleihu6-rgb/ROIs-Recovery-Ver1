import { parseISO } from 'date-fns'
import { getTimezoneOffset } from '@/components/gantt/gantt-utils'

/** Format offset minutes as `(-4:00)` / `(+8:00)` — hours not zero-padded. */
export const formatUtcOffsetLabel = (offsetMinutes: number): string => {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `(${sign}${h}:${m.toString().padStart(2, '0')})`
}

/**
 * Suffix for Departure/Arrival headers, e.g. ` (-4:00)`.
 * Empty when airport zone or instant is unavailable.
 */
export const airportOffsetSuffix = (
  airport: string,
  instantIso: string | null | undefined,
  zoneIdFor: (code: string) => string | undefined,
): string => {
  if (!airport || !instantIso) return ''
  const zoneId = zoneIdFor(airport)
  if (!zoneId) return ''
  try {
    const instant = parseISO(instantIso)
    if (Number.isNaN(instant.getTime())) return ''
    const offsetMin = getTimezoneOffset(instant, zoneId)
    return ` ${formatUtcOffsetLabel(offsetMin)}`
  } catch {
    return ''
  }
}
