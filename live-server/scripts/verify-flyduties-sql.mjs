// verify-flyduties-sql.mjs — remote PostgreSQL parse gate for the flyDuties loaders.
//
//   npm run verify:flyduties-sql
//   SCENARIO_SCHEMA=<schema> npm run verify:flyduties-sql   # optional override
//
// LIVE_SCHEMA / SCENARIO_SCHEMA resolve as the loaders do. The bare `scenario` schema is often
// unreadable to the SIT role; when SCENARIO_SCHEMA is unset this gate picks the first usable
// `*_scenario` schema (typically `f8_sit_scenario`) BEFORE importing the loaders (their
// applySchemas bake the schema idents at module load).
//
// flyDuties builds its SQL dynamically (duty bound coalesce exprs + the shared
// pairingEndRestSecsSql fragment), so a TypeScript/string test cannot prove the text parses:
// alias scope, aggregate nesting and correlated subqueries only fail inside PostgreSQL.
// docs/modules/database/generated-sql-safety-standard.md §2 requires a real EXPLAIN over
// EVERY registered SQL shape, so this gate captures the exact statement each of the three
// loaders would run for byDutySeq = false | true (6 shapes) and EXPLAINs it read-only.
//
// Any connection failure or EXPLAIN failure exits non-zero — never a silent skip.

import process from 'node:process'

import pg from 'pg'

// §Remote-DB-Only: the local f8 schema holds no business data, so the gate must hit the
// remote authority. DATABASE_URL_F8 wins; live-server's own DATABASE_URL is the fallback.
const databaseUrl = (process.env.DATABASE_URL_F8 || process.env.DATABASE_URL || '').trim()
if (!databaseUrl) throw new Error('Missing DATABASE_URL_F8 (or DATABASE_URL) for the remote PostgreSQL gate.')
if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl)) {
  throw new Error('Refusing to verify against a local database (§Remote-DB-Only).')
}

/** Prefer an explicitly set SCENARIO_SCHEMA; otherwise pick a USAGE-granted *_scenario schema. */
async function resolveScenarioSchema(client) {
  const requested = (process.env.SCENARIO_SCHEMA || '').trim()
  if (requested) {
    const ok = await client.query(
      `select has_schema_privilege($1::text, 'USAGE') as ok`,
      [requested],
    )
    if (ok.rows[0]?.ok) return requested
    console.warn(`SCENARIO_SCHEMA=${requested} is not USAGE-granted; auto-detecting *_scenario`)
  }
  const { rows } = await client.query(
    `select nspname
       from pg_namespace
      where nspname like '%\\_scenario' escape '\\'
        and has_schema_privilege(nspname, 'USAGE')
      order by case when nspname = 'f8_sit_scenario' then 0 else 1 end, nspname
      limit 1`,
  )
  if (!rows[0]?.nspname) {
    throw new Error('No USAGE-granted *_scenario schema found; set SCENARIO_SCHEMA explicitly')
  }
  return String(rows[0].nspname)
}

/** Stand-in db that records the statement a source accessor would run instead of running it. */
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

/** Capture the single statement `flyDuties(byDutySeq)` issues for one loader. */
async function captureFlyDuties(sourceFactory, applySchemas, byDutySeq) {
  const db = captureDb()
  await sourceFactory(db).flyDuties(byDutySeq)
  const stmt = db.captured.at(-1)
  if (!stmt?.text) throw new Error('flyDuties issued no statement')
  return { text: applySchemas(stmt.text), values: stmt.values ?? [] }
}

const client = new pg.Client({ connectionString: databaseUrl })
let shapes = 0

try {
  await client.connect()
  const scenarioSchema = await resolveScenarioSchema(client)
  // Must set BEFORE importing loaders — applySchemas bakes schema idents at module load.
  process.env.SCENARIO_SCHEMA = scenarioSchema
  console.log(`Using SCENARIO_SCHEMA=${scenarioSchema}`)

  const { liveSource, applySchemas: applyLiveSchemas } = await import('./live-legality.mjs')
  const { scenarioSource, applySchemas: applyScenarioSchemas } = await import('./scenario-legality.mjs')
  const { buildSeedSource } = await import('./scenario-legality-source.mjs')

  // Bound params only shape the plan — EXPLAIN never executes, and no row is read.
  const loaders = [
    {
      name: 'live',
      applySchemas: applyLiveSchemas,
      factory: (db) => liveSource(db, '2026-07-01', '2026-07-02'),
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
    for (const byDutySeq of [false, true]) {
      const id = `${loader.name} byDutySeq=${byDutySeq}`
      const { text, values } = await captureFlyDuties(loader.factory, loader.applySchemas, byDutySeq)
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
  if (shapes !== loaders.length * 2) throw new Error(`expected ${loaders.length * 2} SQL shapes, explained ${shapes}`)
  console.log(`PASS live-server flyDuties SQL preflight (${shapes} shapes).`)
} catch (error) {
  try {
    await client.query('rollback')
  } catch {
    // The connection may have failed before a transaction existed.
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error(`flyDuties SQL preflight failed: ${message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
