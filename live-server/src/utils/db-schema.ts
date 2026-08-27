import { env } from '../config/index.js'

const IDENTIFIER = /^[a-z][a-z0-9_]*$/

export const quoteIdentifier = (value: string): string => {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`)
  }
  return `"${value}"`
}

export const liveSchemaName = (): string => env.LIVE_SCHEMA
export const scenarioSchemaName = (): string => env.SCENARIO_SCHEMA

export const liveSchema = (): string => quoteIdentifier(env.LIVE_SCHEMA)
export const scenarioSchema = (): string => quoteIdentifier(env.SCENARIO_SCHEMA)

export const logicalSchema = (schema: string): string => {
  if (schema === 'f8') return liveSchema()
  if (schema === 'scenario') return scenarioSchema()
  return quoteIdentifier(schema)
}

export const qualifiedTable = (schema: string, table: string): string =>
  `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
