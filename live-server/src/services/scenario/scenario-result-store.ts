import type { FastifyInstance } from 'fastify'
import { invalidate } from '../../utils/cache.js'

export type ScenarioResultType = 'raw_result' | 'kpi' | 'credit_hours' | 'uncovered' | 'distribution'

export interface ScenarioResultPayload {
  kpi: unknown[]
  creditHours: unknown[]
  uncovered: unknown[]
  distribution: unknown
  rawResult: unknown | null
}

const CACHE_PREFIX = 'scenario:result'

export const ensureScenarioResultTable = async (fastify: FastifyInstance): Promise<void> => {
  await fastify.pgPool.query(`
    create table if not exists scenario_result (
      id bigint generated always as identity primary key,
      created_by varchar(30) not null default 'system',
      created_at timestamp not null default now(),
      updated_by varchar(30) not null default 'system',
      updated_at timestamp not null default now(),
      scenario_id bigint not null default 0,
      type varchar(50) not null,
      json jsonb not null default '{}'::jsonb
    )
  `)
  await fastify.pgPool.query(`
    create unique index if not exists uq_scenario_result_type
      on scenario_result (scenario_id, type)
  `)
  await fastify.pgPool.query(`
    create index if not exists ix_scenario_result_list
      on scenario_result (scenario_id, type)
  `)
}

export const upsertScenarioResultJson = async (
  fastify: FastifyInstance,
  scenarioId: number,
  type: ScenarioResultType,
  json: unknown,
  username = 'engine',
): Promise<void> => {
  await ensureScenarioResultTable(fastify)
  await fastify.pgPool.query(
    `
      insert into scenario_result
        (scenario_id, type, json, created_by, updated_by)
      values ($1, $2, $3::jsonb, $4, $4)
      on conflict (scenario_id, type) do update set
        json = excluded.json,
        updated_by = excluded.updated_by,
        updated_at = now()
    `,
    [scenarioId, type, JSON.stringify(json ?? {}), username],
  )
  await invalidate(fastify.redis, `${CACHE_PREFIX}:${scenarioId}`)
}

export const deleteScenarioResultJson = async (
  pool: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  scenarioId: number,
): Promise<void> => {
  try {
    await pool.query(`delete from scenario_result where scenario_id = $1`, [scenarioId])
  } catch {
    // Older deployments may not have the table until the first result write creates it.
  }
}

/** Delete a scenario's non-notes result rows only. Notes survive "Remove result". */
export const deleteScenarioResultExceptNotes = async (
  pool: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  scenarioId: number,
): Promise<void> => {
  try {
    await pool.query(`delete from scenario_result where scenario_id = $1 and type <> 'notes'`, [scenarioId])
  } catch {
    // Older deployments may not have the table until the first result write creates it.
  }
}

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []

export const getScenarioResults = async (
  fastify: FastifyInstance,
  scenarioId: number,
): Promise<ScenarioResultPayload> => {
  await ensureScenarioResultTable(fastify)
  const { getOrSet } = await import('../../utils/cache.js')
  return getOrSet(fastify.redis, `${CACHE_PREFIX}:${scenarioId}`, 600, async () => {
    const { rows } = await fastify.pgPool.query<{ type: string; json: unknown }>(
      `select type, json from scenario_result where scenario_id = $1`,
      [scenarioId],
    )
    const byType = new Map(rows.map((row) => [row.type, row.json]))
    return {
      kpi: asArray(byType.get('kpi')),
      creditHours: asArray(byType.get('credit_hours')),
      uncovered: asArray(byType.get('uncovered')),
      distribution: byType.get('distribution') ?? [],
      rawResult: byType.get('raw_result') ?? null,
    }
  })
}
