// Shared normalize helpers for scenario.filter_params (PO flat bases + RO/TO crew).
// Division lives on workset.division — not in filter_params.

import type { DateRangeFilter, FlightStatusFilter, NumberRangeFilter, PoFilterParams, RoFilterParams } from '@/types'

export const DEFAULT_CREW_DIVISION = 'P'

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0

/** Normalize a division code: empty / ALL / A → default P. */
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

const asNullableNumber = (raw: unknown): number | null => {
  if (raw == null || raw === '') return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

const asNumberRange = (raw: unknown): NumberRangeFilter => {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    min: asNullableNumber(src.min),
    max: asNullableNumber(src.max),
  }
}

const asDateRange = (raw: unknown): DateRangeFilter => {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    from: isNonEmptyString(src.from) ? src.from.trim().slice(0, 10) : '',
    to: isNonEmptyString(src.to) ? src.to.trim().slice(0, 10) : '',
  }
}

/**
 * PO filter_params may arrive as:
 *  - new shape: { bases, flightNos, ... }
 *  - legacy: { base: "YYZ", division: "P" } — division ignored (workset owns it)
 */
export const normalizePoFilterParams = (raw: unknown): PoFilterParams => {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  let bases = asStringArray(src.bases)
  if (bases.length === 0 && isNonEmptyString(src.base)) {
    bases = [src.base.trim()]
  }

  const flightStatus = (src.flightStatus as FlightStatusFilter | undefined) ?? 'ALL'
  const validStatus: FlightStatusFilter[] = ['SCHEDULED', 'ACTUAL', 'ALL']
  const status = validStatus.includes(flightStatus) ? flightStatus : 'ALL'

  return {
    bases,
    flightNos: asStringArray(src.flightNos),
    depAirports: asStringArray(src.depAirports),
    arrAirports: asStringArray(src.arrAirports),
    fleets: asStringArray(src.fleets),
    flightStatus: status,
  }
}

/** Deep-merge RO crew defaults with stored values (no division field). */
export const normalizeRoCrewFilter = (
  raw: Partial<RoFilterParams['crew']> | null | undefined,
): RoFilterParams['crew'] => ({
  bases: asStringArray(raw?.bases),
  fleets: asStringArray(raw?.fleets),
  ranks: asStringArray(raw?.ranks),
  seniority: asNumberRange(raw?.seniority),
  birthday: asDateRange(raw?.birthday),
  status: raw?.status === 'ALL' ? 'ALL' : 'ACTIVE',
})

export const normalizeRoPairingFilter = (
  raw: Partial<RoFilterParams['pairing']> | null | undefined,
): RoFilterParams['pairing'] => ({
  bases: asStringArray(raw?.bases),
  fleets: asStringArray(raw?.fleets),
  ranks: asStringArray(raw?.ranks),
  types: asStringArray(raw?.types),
  duration: asNumberRange(raw?.duration),
  sources: Array.isArray(raw?.sources) ? raw.sources : undefined,
})
