import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute } from '../../services/manday/manday-tool.js'

// The /api/roster/* handlers now recompute manday SYNCHRONOUSLY via the unified driver
// (recomputeForMutation), replacing the silently-dropping async queue. This locks the
// contract that helper relies on: a scoped window recompute reflects the crew's roster.
const CONN = process.env.DATABASE_URL
let pool: pg.Pool | null = null
let reachable = false
beforeAll(async () => {
  if (!CONN) return
  try { pool = new pg.Pool({ connectionString: CONN, max: 2, connectionTimeoutMillis: 3000 }); await pool.query('SELECT 1'); reachable = true }
  catch { if (pool) await pool.end().catch(() => {}); pool = null }
})
afterAll(async () => { if (pool) await pool.end().catch(() => {}) })

const wrap = (c: pg.PoolClient): pg.Pool => ({ query: (q: string, p?: unknown[]) => c.query(q, p) }) as unknown as pg.Pool

describe('roster mutation manday recompute (real DB, rolled back)', () => {
  it('synchronous scoped recompute reflects the crew roster', async () => {
    if (!reachable || !pool) { console.warn('[roster-mutation-manday] DB unreachable — skipping'); return }
    const c = await pool.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      await recompute(wrap(c), { schema: 'f8', crewIds: ['386'], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST' })
      const r = await c.query(`SELECT credit FROM crew_manday_fd_period WHERE crew_id='386' AND roster_period='2026-06'`)
      expect(Number(r.rows[0]?.credit)).toBe(480)
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)
})
