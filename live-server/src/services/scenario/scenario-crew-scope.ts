import { sql, type SQL } from 'drizzle-orm'
import { normalizeCrewDivision } from './filter-params-normalize.js'

export interface ScenarioCrewScope {
  strDtLoc: Date
  endDtLoc: Date
  filterParams?: Record<string, unknown> | null
  division?: string | null
}

/** Helper: build SQL array literal from app-controlled string values. */
export const sqlStrArray = (values: string[]): SQL => {
  const params = values.map((value) => sql`${value}`)
  return sql.join(params, sql`, `)
}

export const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const dateStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 10) : null

/**
 * Return the authoritative Crew Filter scope for a scenario.
 *
 * `schema` is optional because the export path runs with the airline schema as
 * search_path, while the DB-backed Gantt explicitly qualifies live tables.
 */
export const crewIdSet = (scenario: ScenarioCrewScope, schema?: string): SQL => {
  const filterParams = scenario.filterParams ?? {}
  const crewFilter = (filterParams.crew ?? {}) as Record<string, unknown>
  const division = normalizeCrewDivision(scenario.division)
  const bases = (crewFilter.bases as string[] | undefined) ?? []
  const ranks = (crewFilter.ranks as string[] | undefined) ?? []
  const fleets = (crewFilter.fleets as string[] | undefined) ?? []
  const seniority = (crewFilter.seniority ?? {}) as Record<string, unknown>
  const birthday = (crewFilter.birthday ?? {}) as Record<string, unknown>
  const seniorityMin = numberOrNull(seniority.min)
  const seniorityMax = numberOrNull(seniority.max)
  const birthdayFrom = dateStringOrNull(birthday.from)
  const birthdayTo = dateStringOrNull(birthday.to)
  const table = (name: string): SQL => sql.raw(schema ? `${schema}.${name}` : name)

  const parts: SQL[] = [sql`SELECT crew_id FROM ${table('crew')} WHERE 1=1`]
  parts.push(sql` AND division = ${division}`)

  // 全局有效性门槛：与 Live 一致，rank 与 base 各须与 scenario 窗口相交（Division-only
  // 或无 rank/base 条件时同样生效）。
  parts.push(sql` AND crew_id IN (
    SELECT crew_id FROM ${table('crew_rank')}
    WHERE eff_dt <= ${scenario.endDtLoc}
      AND (exp_dt IS NULL OR exp_dt >= ${scenario.strDtLoc}))`)
  parts.push(sql` AND crew_id IN (
    SELECT crew_id FROM ${table('crew_base')}
    WHERE eff_dt <= ${scenario.endDtLoc}
      AND (exp_dt IS NULL OR exp_dt >= ${scenario.strDtLoc}))`)

  if (bases.length > 0) {
    parts.push(sql` AND crew_id IN (
      SELECT crew_id FROM ${table('crew_base')}
      WHERE base = ANY(ARRAY[${sqlStrArray(bases)}]::text[])
        AND eff_dt <= ${scenario.endDtLoc}
        AND (exp_dt >= ${scenario.strDtLoc} OR exp_dt IS NULL))`)
  }

  if (ranks.length > 0) {
    parts.push(sql` AND crew_id IN (
      SELECT crew_id FROM ${table('crew_rank')}
      WHERE rank = ANY(ARRAY[${sqlStrArray(ranks)}]::text[])
        AND eff_dt <= ${scenario.endDtLoc}
        AND (exp_dt >= ${scenario.strDtLoc} OR exp_dt IS NULL))`)
  }

  if (fleets.length > 0) {
    parts.push(sql` AND crew_id IN (
      SELECT crew_id FROM ${table('crew_fleet')}
      WHERE fleet_specific = ANY(ARRAY[${sqlStrArray(fleets)}]::text[])
        AND eff_dt <= ${scenario.endDtLoc}
        AND (exp_dt >= ${scenario.strDtLoc} OR exp_dt IS NULL))`)
  }

  if (seniorityMin != null) {
    parts.push(sql` AND seniority_num IS NOT NULL AND seniority_num >= ${seniorityMin}`)
  }
  if (seniorityMax != null) {
    parts.push(sql` AND seniority_num IS NOT NULL AND seniority_num <= ${seniorityMax}`)
  }
  if (birthdayFrom) {
    parts.push(sql` AND birthday IS NOT NULL AND birthday::date >= ${birthdayFrom}::date`)
  }
  if (birthdayTo) {
    parts.push(sql` AND birthday IS NOT NULL AND birthday::date <= ${birthdayTo}::date`)
  }

  return sql.join(parts, sql``)
}
