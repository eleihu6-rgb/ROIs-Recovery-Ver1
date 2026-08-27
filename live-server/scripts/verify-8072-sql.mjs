// verify-8072-sql.mjs — remote PostgreSQL parse gate for 8072 qualificationFlightSegments.
//
//   npm run verify:8072-sql
//
// The four LATERAL-heavy CTEs (crew_rows/crews/planned/filled) must be AS MATERIALIZED
// so the planner cannot inline them as 1-row nested loops.
// docs/modules/database/generated-sql-safety-standard.md §2.

import process from 'node:process'
import pg from 'pg'

const databaseUrl = (process.env.DATABASE_URL_F8 || process.env.DATABASE_URL || '').trim()
if (!databaseUrl) throw new Error('Missing DATABASE_URL_F8 (or DATABASE_URL) for the remote PostgreSQL gate.')
if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl)) {
  throw new Error('Refusing to verify against a local database (§Remote-DB-Only).')
}

const MATERIALIZED_CTES = ['crew_rows', 'crews', 'planned', 'filled']

async function resolveScenarioSchema(client) {
  const requested = (process.env.SCENARIO_SCHEMA || '').trim()
  if (requested) {
    const ok = await client.query(
      `select has_schema_privilege($1::text, 'USAGE') as ok`,
      [requested],
    )
    if (ok.rows[0]?.ok) return requested
    throw new Error(`SCENARIO_SCHEMA=${requested} is not usable`)
  }
  const { rows } = await client.query(
    `select nspname
       from pg_namespace
      where nspname like '%\\_scenario' escape '\\'
        and has_schema_privilege(nspname, 'USAGE')
      order by nspname`,
  )
  if (!rows.length) throw new Error('No usable *_scenario schema')
  return rows[0].nspname
}

function captureDb() {
  const captured = []
  return {
    captured,
    query: async (queryConfig, values) => {
      const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text
      captured.push({ text, values })
      return { rows: [] }
    },
  }
}

async function captureQualificationFlightSegments(sourceFactory, applySchemas) {
  const db = captureDb()
  await sourceFactory(db).qualificationFlightSegments()
  const stmt = db.captured.at(-1)
  if (!stmt?.text) throw new Error('qualificationFlightSegments issued no statement')
  return { text: applySchemas(stmt.text), values: stmt.values ?? [] }
}

function assertMaterializedPlan(planText, loaderName) {
  for (const name of MATERIALIZED_CTES) {
    if (!new RegExp(`CTE Scan on ${name}\\b`).test(planText)) {
      throw new Error(`FAIL ${loaderName}: EXPLAIN missing CTE Scan on ${name}`)
    }
  }
}

const client = new pg.Client({ connectionString: databaseUrl })
let shapes = 0

try {
  await client.connect()
  const scenarioSchema = await resolveScenarioSchema(client)
  process.env.SCENARIO_SCHEMA = scenarioSchema
  console.log(`Using SCENARIO_SCHEMA=${scenarioSchema}`)

  const { liveSource, applySchemas: applyLiveSchemas } = await import('./live-legality.mjs')
  const { scenarioSource, applySchemas: applyScenarioSchemas } = await import('./scenario-legality.mjs')
  const { buildSeedSource } = await import('./scenario-legality-source.mjs')

  const loaders = [
    {
      name: 'live',
      applySchemas: applyLiveSchemas,
      factory: (db) => liveSource(db, '2026-08-01', '2026-08-02'),
    },
    {
      name: 'scenario',
      applySchemas: applyScenarioSchemas,
      factory: (db) => scenarioSource(db, 0, {}),
    },
    {
      name: 'scenario-source',
      applySchemas: applyLiveSchemas,
      factory: (db) => buildSeedSource(db, 0, { seedCrewIds: ['0'], seedPairingIds: [0] }),
    },
  ]

  await client.query('begin read only')
  for (const loader of loaders) {
    const { text, values } = await captureQualificationFlightSegments(loader.factory, loader.applySchemas)
    try {
      const plan = await client.query({ text: `explain ${text}`, values })
      const planText = plan.rows.map((row) => String(row['QUERY PLAN'] ?? '')).join('\n')
      assertMaterializedPlan(planText, loader.name)
      shapes += 1
      console.log(`PASS ${loader.name} qualificationFlightSegments — ${planText.split('\n')[0].split('(')[0].trim()}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`FAIL ${loader.name}: ${message}`)
    }
  }
  await client.query('rollback')
  if (shapes !== loaders.length) throw new Error(`expected ${loaders.length} SQL shapes, explained ${shapes}`)
  console.log(`PASS live-server qualificationFlightSegments SQL preflight (${shapes} shapes).`)
} catch (error) {
  try {
    await client.query('rollback')
  } catch {
    // connection may have failed before a transaction existed
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error(`qualificationFlightSegments SQL preflight failed: ${message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
