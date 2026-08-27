import { parseISO } from 'date-fns'

const minutesBetween = (
  dep: string | null | undefined,
  arv: string | null | undefined,
): number | null => {
  if (!dep || !arv) return null
  try {
    const d = parseISO(dep).getTime()
    const a = parseISO(arv).getTime()
    if (a <= d) return null
    return Math.round((a - d) / 60000)
  } catch {
    return null
  }
}

/**
 * Block Hours for Flight Detail: ATA−ATD when both actuals exist, else STA−STD.
 */
export const deriveFlightBlockMinutes = (input: {
  actDepDtUtc: string | null | undefined
  actArvDtUtc: string | null | undefined
  schDepDtUtc: string | null | undefined
  schArvDtUtc: string | null | undefined
}): number | null => {
  if (input.actDepDtUtc && input.actArvDtUtc) {
    return minutesBetween(input.actDepDtUtc, input.actArvDtUtc)
  }
  return minutesBetween(input.schDepDtUtc, input.schArvDtUtc)
}
