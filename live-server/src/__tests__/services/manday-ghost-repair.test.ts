import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute, findStaleFdCrews } from '../../services/manday/manday-tool.js'

// The admin ghost-repair path: find FD crews whose June monthly credit is stale (>0) with NO
// flying duty, then scoped-recompute them. Crew 386 is the canonical ghost (84:25 on an empty
// roster → must repair to 8:00 = 480 min, its 2 VAC days).
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

describe('manday ghost repair (real DB, rolled back)', () => {
  it('detects stale FD crews and repairs 386 to its true credit', async () => {
    if (!reachable || !pool) { console.warn('[manday-ghost-repair] DB unreachable — skipping'); return }
    const c = await pool.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      const ghosts = await findStaleFdCrews(wrap(c), { startDt: '2026-06-01', endDt: '2026-06-30', minCreditMin: 0 })
      expect(ghosts).toContain('386') // the known ghost is detected
      await recompute(wrap(c), { schema: 'f8', crewIds: ['386'], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST' })
      const r = await c.query(`SELECT credit FROM crew_manday_fd_period WHERE crew_id='386' AND roster_period='2026-06'`)
      expect(Number(r.rows[0]?.credit)).toBe(480)
      // After repair 386 is no longer a ghost (still credit>0 but that's its real VAC credit;
      // the finder keys on "no flying", so a VAC-only crew stays listed — repair is idempotent).
      const after = await recompute(wrap(c), { schema: 'f8', crewIds: ['386'], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST' })
      expect(after.crews).toBe(1)
      const r2 = await c.query(`SELECT credit FROM crew_manday_fd_period WHERE crew_id='386' AND roster_period='2026-06'`)
      expect(Number(r2.rows[0]?.credit)).toBe(480) // idempotent
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)
})
