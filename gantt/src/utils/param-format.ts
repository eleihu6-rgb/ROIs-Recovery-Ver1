const HH_MM_RE = /^\d+:\d{2}$/
const INT_RE = /^\d+$/
const NUMERIC_RE = /^\d+(\.\d+)?%?$/
const APPLICABILITY_RE = /^(bases?|ranks?|fleets?|teams?|crew teams?)$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE_HEADER_RE = /^(eff|exp)\s*date$/i

export type CellFormat = 'hhmm' | 'integer' | 'numeric' | 'applicability' | 'text' | 'date'

const isRealIsoDate = (value: string): boolean => {
  if (!ISO_DATE_RE.test(value)) return false
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(5, 7))
  const d = Number(value.slice(8, 10))
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Infer a column's expected format from its header name and existing cell values.
 * If no existing values, falls back to text; header containing 'HH:MM' overrides to hhmm.
 */
export const detectColumnFormat = (header: string, existingValues: string[]): CellFormat => {
  if (APPLICABILITY_RE.test(header)) return 'applicability'
  if (DATE_HEADER_RE.test(header)) return 'date'
  if (/HH:MM/i.test(header)) return 'hhmm'
  const nonEmpty = existingValues.filter((v) => v.trim() !== '')
  if (nonEmpty.length === 0) return 'text'
  if (nonEmpty.every((v) => HH_MM_RE.test(v))) return 'hhmm'
  if (nonEmpty.every((v) => INT_RE.test(v))) return 'integer'
  if (nonEmpty.every((v) => NUMERIC_RE.test(v))) return 'numeric'
  return 'text'
}

/** Returns a validation error message, or null if valid. */
export const validateCell = (value: string, format: CellFormat): string | null => {
  if (format === 'applicability') {
    return value.trim() === '' ? 'Required' : null
  }
  if (value.trim() === '') return 'Required'
  if (format === 'date' && !isRealIsoDate(value.trim())) {
    return 'Use YYYY-MM-DD (e.g. 2026-08-01)'
  }
  if (format === 'hhmm' && !HH_MM_RE.test(value)) return 'Use HH:MM (e.g. 08:30)'
  if (format === 'integer' && !INT_RE.test(value)) return 'Must be a number'
  if (format === 'numeric' && !NUMERIC_RE.test(value)) return 'Must be a number'
  return null
}

const APPLICABILITY_TOOLTIPS: Record<string, string> = {
  BASE: 'Airport base code (e.g. YEG). Use * to match all bases.',
  BASES: 'Airport base code (e.g. YEG). Use * to match all bases.',
  RANK: 'Crew rank (e.g. CA, FO). Use * to match all ranks.',
  RANKS: 'Crew rank (e.g. CA, FO). Use * to match all ranks.',
  FLEET: 'Aircraft fleet type (e.g. B737). Use * to match all fleets.',
  FLEETS: 'Aircraft fleet type (e.g. B737). Use * to match all fleets.',
  TEAM: 'Crew team group. Use * to match all teams.',
  TEAMS: 'Crew team group. Use * to match all teams.',
  'CREW TEAM': 'Crew team group. Use * to match all teams.',
  'CREW TEAMS': 'Crew team group. Use * to match all teams.',
}

/** Tooltip text for a column header. */
export const getColumnTooltip = (header: string, format: CellFormat): string => {
  if (format === 'applicability') {
    return APPLICABILITY_TOOLTIPS[header.toUpperCase()] ?? header
  }
  if (format === 'hhmm') return `${header} — Format: HH:MM (e.g. 08:30)`
  if (format === 'date') return `${header} — Format: YYYY-MM-DD (e.g. 2026-08-01)`
  if (format === 'integer' || format === 'numeric') return `${header} — Must be a number`
  return header
}

/** Returns true if all cells in a draft row are valid given their column formats. */
export const isDraftValid = (draft: string[], formats: CellFormat[]): boolean =>
  draft.every((v, i) => validateCell(v, formats[i] ?? 'text') === null)
