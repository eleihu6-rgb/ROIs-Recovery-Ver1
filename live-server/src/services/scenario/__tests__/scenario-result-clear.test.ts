// Integration (live DB): clearScenarioResult must remove a scenario's result rows
// from every scenario-schema result table. Seeds a throwaway partition by copying a
// few real rows (so all NOT NULL / FK constraints are satisfied without hardcoding
// each table's columns), then asserts the clear empties them. Skips if no DB.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { clearScenarioResult, SCENARIO_RESULT_TABLES } from '../scenario-result-loader.js'

const DB =
  process.env.LIVE_TEST_DB ??
  'postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
const THROWAWAY = 999991

let pool: pg.Pool
let dbOk = false

const countFor = async (table: string, id: number): Promise<number> => {
  const r = await pool.query(`select count(*)::int n from scenario.${table} where scenario_id=$1`, [id])
  return r.rows[0].n as number
}

// Copy up to `n` real rows of `table` into scenario_id=toId, letting identity/generated
// columns regenerate. Returns rows inserted (0 if no source data exists for the table).
const copyInto = async (table: string, toId: number, n = 3): Promise<number> => {
  const { rows: colRows } = await pool.query(
    `select column_name from information_schema.columns
       where table_schema='scenario' and table_name=$1
         and is_identity='NO' and is_generated='NEVER'
       order by ordinal_position`,
    [table],
  )
  const cols = colRows.map((r) => r.column_name as string)
  if (!cols.includes('scenario_id')) return 0
  const { rows: src } = await pool.query(
    `select scenario_id from scenario.${table} where scenario_id <> $1 and scenario_id <> 0 limit 1`,
    [toId],
  )
  if (!src.length) return 0
  const quoted = cols.map((c) => `"${c}"`).join(',')
  const selectExpr = cols.map((c) => (c === 'scenario_id' ? `${toId}::bigint` : `"${c}"`)).join(',')
  const res = await pool.query(
    `insert into scenario.${table} (${quoted})
       select ${selectExpr} from scenario.${table} where scenario_id=$1 limit ${n}`,
    [src[0].scenario_id],
  )
  return res.rowCount ?? 0
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB })
  try {
    await pool.query('select 1')
    dbOk = true
    await clearScenarioResult(pool, THROWAWAY)
  } catch {
    dbOk = false
  }
})

afterAll(async () => {
  if (dbOk) await clearScenarioResult(pool, THROWAWAY)
  await pool?.end()
})

describe('clearScenarioResult (live DB)', () => {
  it('deletes the result partition from every scenario result table', async () => {
    if (!dbOk) {
      console.warn('[skip] scenario DB unavailable — set LIVE_TEST_DB to run')
      return
    }

    let seeded = 0
    for (const t of SCENARIO_RESULT_TABLES) {
      const c = await copyInto(t, THROWAWAY)
      if (c > 0) {
        seeded++
        expect(await countFor(t, THROWAWAY), `${t} should be seeded`).toBeGreaterThan(0)
      }
    }
    expect(seeded, 'expected at least one result table to seed (no source data?)').toBeGreaterThan(0)

    await clearScenarioResult(pool, THROWAWAY)

    for (const t of SCENARIO_RESULT_TABLES) {
      expect(await countFor(t, THROWAWAY), `${t} must be empty after clear`).toBe(0)
    }
  })
})
