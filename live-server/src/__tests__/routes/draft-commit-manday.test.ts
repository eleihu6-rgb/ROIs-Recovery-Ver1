import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute } from '../../services/manday/manday-tool.js'

// Proves the commit-path contract the route relies on: after a multi-crew scoped
// recompute, EVERY affected crew's monthly credit is (re)written — none silently
// skipped. That silent skip is exactly what produced the 386 ghost via the old
// jobId-deduped async queue.
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

describe('commit-path manday recompute (real DB, rolled back)', () => {
  it('recomputes all crews in one scoped call', async () => {
    if (!reachable || !pool) { console.warn('[draft-commit-manday] DB unreachable — skipping'); return }
    const c = await pool.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      const crews = ['73', '386']
      const res = await recompute(wrap(c), { schema: 'f8', crewIds: crews, startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST' })
      expect(res.crews).toBe(2)
      const r = await c.query(`SELECT crew_id FROM crew_manday_fd_period WHERE crew_id = ANY($1) AND roster_period='2026-06'`, [crews])
      expect(r.rows.length).toBe(2) // both crews written, none skipped
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)
})
