import { sql, type SQL } from 'drizzle-orm'

export interface ScenarioPairingScope {
  strDtLoc: Date
  endDtLoc: Date
  division: string
  bases: string[]
  ranks?: string[]
  fleets: string[]
  types?: string[]
  duration?: {
    min?: number | null
    max?: number | null
  }
  compositionTable?: string
  compositionScenarioId?: number
  includeDateRange?: boolean
}

const sqlTextArray = (values: string[]): SQL =>
  sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`

export const buildScenarioPairingScopeWhere = (scope: ScenarioPairingScope): SQL => {
  const parts: SQL[] = [sql`division = ${scope.division}`]
  if (scope.includeDateRange !== false) {
    parts.unshift(
      sql`sch_str_dt_utc < (${scope.endDtLoc}::date + interval '1 day')`,
      sql`sch_end_dt_utc >= ${scope.strDtLoc}`,
    )
  }
  if (scope.bases.length > 0) parts.push(sql`base = ANY(${sqlTextArray(scope.bases)})`)
  if ((scope.ranks?.length ?? 0) > 0) {
    const compositionTable = scope.compositionTable ?? 'pairing_composition'
    const scenarioId = scope.compositionScenarioId ?? 0
    parts.push(sql`EXISTS (
      SELECT 1 FROM ${sql.raw(compositionTable)} pc
      WHERE pc.pairing_id = pairing.id
        AND pc.scenario_id = ${scenarioId}
        AND pc.is_deleted = 0
        AND pc.acting_rank = ANY(${sqlTextArray(scope.ranks ?? [])}))`)
  }
  if (scope.fleets.length > 0) parts.push(sql`fleet = ANY(${sqlTextArray(scope.fleets)})`)
  if ((scope.types?.length ?? 0) > 0) parts.push(sql`assignment = ANY(${sqlTextArray(scope.types ?? [])})`)
  if (scope.duration?.min != null) parts.push(sql`tafb >= ${scope.duration.min}`)
  if (scope.duration?.max != null) parts.push(sql`tafb <= ${scope.duration.max}`)
  return sql.join(parts, sql` AND `)
}
