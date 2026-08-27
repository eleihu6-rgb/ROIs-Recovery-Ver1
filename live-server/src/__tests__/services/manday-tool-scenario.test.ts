import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute } from '../../services/manday/manday-tool.js'

// Proves the unified driver reproduces the scenario manday that the gz loader
// (scenario-result-loader.ts) already wrote for scenario 6 — so the loader can safely
// delegate its manday step to the driver. Read existing per-crew monthly credit, run the
// driver in a rolled-back tx (reads scenario.roster_flight), compare.
const CONN = process.env.DATABASE_URL
const SCEN = 6
let pool: pg.Pool | null = null
let reachable = false
beforeAll(async () => {
  if (!CONN) return
  try { pool = new pg.Pool({ connectionString: CONN, max: 2, connectionTimeoutMillis: 3000 }); await pool.query('SELECT 1'); reachable = true }
  catch { if (pool) await pool.end().catch(() => {}); pool = null }
})
afterAll(async () => { if (pool) await pool.end().catch(() => {}) })

const wrap = (c: pg.PoolClient): pg.Pool => ({ query: (q: string, p?: unknown[]) => c.query(q, p) }) as unknown as pg.Pool

describe('manday-tool scenario parity (real DB, rolled back)', () => {
  it('driver reproduces the loader-written scenario-6 monthly FD credit per crew', async () => {
    if (!reachable || !pool) { console.warn('[manday-tool-scenario] DB unreachable — skipping'); return }
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      const SEL = `SELECT crew_id, roster_period, credit::int credit, blh::int blh, is_day_off, is_al
                     FROM scenario.crew_manday_fd_period WHERE scenario_id=$1 ORDER BY crew_id, roster_period`
      type Row = { crew_id: string; roster_period: string; credit: number; blh: number; is_day_off: number; is_al: number }
      const key = (r: Row): string => `${r.crew_id}|${r.roster_period}`
      const snap = (rows: Row[]): Map<string, string> =>
        new Map(rows.map((r) => [key(r), `${Number(r.credit)}|${Number(r.blh)}|${Number(r.is_day_off)}|${Number(r.is_al)}`]))

      const before = snap((await c.query(SEL, [SCEN])).rows as Row[])
      await recompute(wrap(c), { schema: 'scenario', scenarioId: SCEN, updatedBy: 'TEST' })
      const after = snap((await c.query(SEL, [SCEN])).rows as Row[])
      // Same (crew, month) keys and same credit + blh + flags on each.
      expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
      for (const [k, v] of before) expect(after.get(k)).toBe(v)
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 60000)
})
