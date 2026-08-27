/**
 * Normalize scenario.filter_params for PO (flat) and RO/TO (crew nested).
 * Keeps export / create paths consistent with the gantt UI.
 */

export const DEFAULT_CREW_DIVISION = 'P'

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0

export const normalizeCrewDivision = (raw: unknown): string => {
  if (!isNonEmptyString(raw)) return DEFAULT_CREW_DIVISION
  const code = raw.trim()
  if (code === 'ALL' || code === '*' || code === 'A') return DEFAULT_CREW_DIVISION
  return code
}

const asStringArray = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
}

export interface NormalizedPoScope {
  division: string
  bases: string[]
}

/**
 * PO scope from filter_params:
 *  - new: { division, bases }
 *  - S3 legacy: { base, division }
 */
export const normalizePoScope = (filterParams: Record<string, unknown> | null | undefined): NormalizedPoScope => {
  const src = (filterParams ?? {}) as Record<string, unknown>
  let bases = asStringArray(src.bases)
  if (bases.length === 0 && isNonEmptyString(src.base)) {
    bases = [src.base.trim()]
  }
  return {
    division: normalizeCrewDivision(src.division),
    bases,
  }
}

/** RO/TO crew.division with ALL/empty → P. */
export const normalizeRoCrewDivision = (
  filterParams: Record<string, unknown> | null | undefined,
): string => {
  const src = (filterParams ?? {}) as Record<string, unknown>
  const crew = (src.crew ?? {}) as Record<string, unknown>
  return normalizeCrewDivision(crew.division)
}
