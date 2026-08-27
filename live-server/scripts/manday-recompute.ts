// Unified scenario manday recompute CLI (dev tool).
//
// Recomputes scenario.crew_manday_* for a scenario from scenario.roster_flight using the
// SAME driver Live uses (src/services/manday/manday-tool.ts → Rust ruletool). This is the
// "roster" path of the old scripts/ruletool.mjs, now delegated to the one tool so the dev
// CLI and the production loader (scenario-result-loader.ts) never drift.
//
// Usage:  tsx scripts/manday-recompute.ts <scenarioId>
//   DB:   reads DATABASE_URL.
import 'dotenv/config'
import pg from 'pg'
import { recompute } from '../src/services/manday/manday-tool.js'

const scenarioId = Number(process.argv[2])
if (!Number.isInteger(scenarioId) || scenarioId <= 0) {
  console.error('usage: tsx scripts/manday-recompute.ts <scenarioId>')
  process.exit(1)
}

const connectionString =
  process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

// Wrapped in an async IIFE: the package is commonjs, and top-level await is not supported
// under the CJS transform (tsx/esbuild) — it would fail to start otherwise.
void (async () => {
  const pool = new pg.Pool({ connectionString, max: 2 })
  try {
    const r = await recompute(pool, { schema: 'scenario', scenarioId, updatedBy: 'manday-recompute-cli' })
    console.log(`scenario ${scenarioId}: ${r.crews} crew → ${r.daily} daily, ${r.monthly} monthly, ${r.yearly} yearly rows`)
  } catch (e) {
    console.error('manday-recompute failed:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
})()
