import type { Pool } from 'pg'
import {
  parsePbsRedeyeDefinition,
  pbsBidDefinitionCodes,
  type PbsRedeyeDefinition,
} from '../../../../packages/contracts/pbs-bid-definitions.js'

const validateSchemaName = (schema: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid live schema name: ${schema}`)
  return schema
}

export const loadRedeyeDefinition = async (
  pgPool: Pick<Pool, 'query'>,
  liveSchema: string,
): Promise<PbsRedeyeDefinition> => {
  const schema = validateSchemaName(liveSchema)
  const result = await pgPool.query<{ code: string; code_value: string | null }>(
    `select code, code_value
     from ${schema}.dictionary
     where parent_code = $1 and code = any($2::text[])`,
    [pbsBidDefinitionCodes.redeyeParent, [
      pbsBidDefinitionCodes.redeyeStartTime,
      pbsBidDefinitionCodes.redeyeEndTime,
    ]],
  )
  const values = new Map(result.rows.map((row) => [row.code, row.code_value]))
  return parsePbsRedeyeDefinition({
    startTime: values.get(pbsBidDefinitionCodes.redeyeStartTime),
    endTime: values.get(pbsBidDefinitionCodes.redeyeEndTime),
  })
}
