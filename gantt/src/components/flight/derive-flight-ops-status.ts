import { parseISO } from 'date-fns'

export type FlightOpsStatusLabel =
  | 'Cancelled'
  | 'Finished'
  | 'Delayed'
  | 'On Time'
  | 'Scheduled'

export type FlightOpsStatusResult = {
  label: FlightOpsStatusLabel
  badgeClass: 'badge-cancel' | 'badge-partial' | 'badge-full' | 'badge-type'
  unit: string
  unitColor?: string
}

/** Minutes between an actual and scheduled UTC timestamp (positive = late, negative = early). */
export const deltaMinutes = (actual: string | null | undefined, scheduled: string | null | undefined): number | null => {
  if (!actual || !scheduled) return null
  try {
    const a = parseISO(actual).getTime()
    const s = parseISO(scheduled).getTime()
    return Math.round((a - s) / 60000)
  } catch {
    return null
  }
}

const formatDelta = (m: number): string => (m > 0 ? `+${m}m` : `${m}m`)

/**
 * Flight Info → Status (ops progress). Not crew-coverage status.
 * Priority: Cancelled → Finished → Delayed → On Time → Scheduled.
 */
export const deriveFlightOpsStatus = (input: {
  isCancelled: boolean
  actDepDtUtc: string | null | undefined
  actArvDtUtc: string | null | undefined
  schDepDtUtc: string | null | undefined
}): FlightOpsStatusResult => {
  const { isCancelled, actDepDtUtc, actArvDtUtc, schDepDtUtc } = input
  const hasAtd = Boolean(actDepDtUtc)
  const hasAta = Boolean(actArvDtUtc)
  const depDelta = deltaMinutes(actDepDtUtc, schDepDtUtc)

  if (isCancelled) {
    return { label: 'Cancelled', badgeClass: 'badge-cancel', unit: '', unitColor: 'var(--red)' }
  }
  if (hasAtd && hasAta) {
    return { label: 'Finished', badgeClass: 'badge-full', unit: '' }
  }
  if (hasAtd && !hasAta) {
    if (depDelta !== null && depDelta > 15) {
      return {
        label: 'Delayed',
        badgeClass: 'badge-partial',
        unit: `+${depDelta} min`,
        unitColor: 'var(--amber)',
      }
    }
    return {
      label: 'On Time',
      badgeClass: 'badge-full',
      unit: depDelta !== null ? formatDelta(depDelta) : '',
      unitColor: 'var(--green)',
    }
  }
  return { label: 'Scheduled', badgeClass: 'badge-type', unit: '' }
}
