// verify-assignment-overlap-sql.mjs — remote PostgreSQL parse gate for 1001 / 8056 loaders.
//
//   npm run verify:assignment-overlap-sql
//
// assignmentOverlapRosters and flyByPairing build SQL from dutyStart/dutyEnd helpers +
// pairingEndRestSecsSql, so a string test cannot prove PostgreSQL accepts the text.
// EXPLAIN each of the three loader shapes for both methods, read-only.
// docs/modules/database/generated-sql-safety-standard.md §2.

import process from 'node:process'
import pg from 'pg'

const databaseUrl = (process.env.DATABASE_URL_F8 || process.env.DATABASE_URL || '').trim()
if (!databaseUrl) throw new Error('Missing DATABASE_URL_F8 (or DATABASE_URL) for the remote PostgreSQL gate.')
if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl)) {
  throw new Error('Refusing to verify against a local database (§Remote-DB-Only).')
}

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

async function captureOverlap(sourceFactory, applySchemas) {
  const db = captureDb()
  await sourceFactory(db).assignmentOverlapRosters()
  const stmt = db.captured.at(-1)
  if (!stmt?.text) throw new Error('assignmentOverlapRosters issued no statement')
  return { text: applySchemas(stmt.text), values: stmt.values ?? [] }
}

async function captureFlyByPairing(sourceFactory, applySchemas) {
  const db = captureDb()
  await sourceFactory(db).flyByPairing([], [])
  const stmt = db.captured.at(-1)
  if (!stmt?.text) throw new Error('flyByPairing issued no statement')
  return { text: applySchemas(stmt.text), values: stmt.values ?? [] }
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
      factory: (db) =>
        buildSeedSource(db, 0, {
          seedCrewIds: ['0'],
          seedPairingIds: [0],
          dateFrom: '2026-08-01',
          dateTo: '2026-08-02',
        }),
    },
  ]

  const methods = [
    { name: 'assignmentOverlapRosters', capture: captureOverlap },
    { name: 'flyByPairing', capture: captureFlyByPairing },
  ]
  const expectedShapes = loaders.length * methods.length

  await client.query('begin read only')
  for (const method of methods) {
    for (const loader of loaders) {
      const id = `${loader.name} ${method.name}`
      const { text, values } = await method.capture(loader.factory, loader.applySchemas)
      try {
        const plan = await client.query({ text: `explain ${text}`, values })
        shapes += 1
        console.log(`PASS ${id} — ${String(plan.rows[0]?.['QUERY PLAN'] ?? '').split('(')[0].trim()}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`FAIL ${id}: ${message}`)
      }
    }
  }
  await client.query('rollback')
  if (shapes !== expectedShapes) throw new Error(`expected ${expectedShapes} SQL shapes, explained ${shapes}`)
  console.log(`PASS live-server assignmentOverlapRosters + flyByPairing SQL preflight (${shapes} shapes).`)
} catch (error) {
  try {
    await client.query('rollback')
  } catch {
    // connection may have failed before a transaction existed
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error(`assignmentOverlapRosters + flyByPairing SQL preflight failed: ${message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
