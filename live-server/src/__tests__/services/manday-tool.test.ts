import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute } from '../../services/manday/manday-tool.js'

const CONN = process.env.DATABASE_URL
let pool: pg.Pool | null = null
let reachable = false

beforeAll(async () => {
  if (!CONN) return
  try {
    pool = new pg.Pool({ connectionString: CONN, max: 2, connectionTimeoutMillis: 3000 })
    await pool.query('SELECT 1')
    reachable = true
  } catch {
    if (pool) await pool.end().catch(() => {})
    pool = null
  }
})
afterAll(async () => {
  if (pool) await pool.end().catch(() => {})
})

// A single pinned client wrapped as a "pool" so the driver's every query runs in ONE
// rolled-back transaction (shared dev data is never mutated). The driver MUST issue all
// queries through the passed object's .query() and never open its own connection.
const wrap = (c: pg.PoolClient): pg.Pool =>
  ({ query: (q: string, p?: unknown[]) => c.query(q, p) }) as unknown as pg.Pool

describe('manday-tool recompute (real DB, rolled back)', () => {
  it('scoped recompute writes monthly credit matching the crew roster', async () => {
    if (!reachable || !pool) {
      console.warn('[manday-tool.test] DB unreachable — skipping')
      return
    }
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      await c.query('SET LOCAL search_path TO f8')
      // crew 386: roster has only VAC (2×240) + DO in June → credit must become 480
      await recompute(wrap(c), {
        schema: 'f8', crewIds: ['386'], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST',
      })
      const r = await c.query(`SELECT credit FROM crew_manday_fd_period WHERE crew_id='386' AND roster_period='2026-06'`)
      expect(Number(r.rows[0]?.credit)).toBe(480)
    } finally {
      await c.query('ROLLBACK')
      c.release()
    }
  }, 30000)

  it('golden (scoped): FD crew 73 June recompute = the values the retired SQL engine produced', async () => {
    if (!reachable || !pool) {
      console.warn('[manday-tool.test golden] DB unreachable — skipping')
      return
    }
    // Golden values for crew 73's June (all ground/VAC — no flying legs → blh stays 0).
    const GOLDEN = { credit: 2640, blh: 0, do: 6, al: 10 }
    const c = await pool.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      await recompute(wrap(c), { schema: 'f8', crewIds: ['73'], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'P' })
      const r = await c.query(`SELECT credit::int credit, blh::int blh, is_day_off, is_al FROM crew_manday_fd_period WHERE crew_id='73' AND roster_period='2026-06'`)
      expect({ credit: Number(r.rows[0]?.credit), blh: Number(r.rows[0]?.blh), do: Number(r.rows[0]?.is_day_off), al: Number(r.rows[0]?.is_al) }).toEqual(GOLDEN)
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)

  it('full mode (imports): no crewIds recomputes blh for active days, preserves import-fed columns', async () => {
    if (!reachable || !pool) {
      console.warn('[manday-tool.test full] DB unreachable — skipping')
      return
    }
    // Import workers call the driver with NO crewIds. blh is now always recomputed from
    // flight.blk_min for active crew-days, while ~60 import-fed columns (fdp, etc.) survive.
    const c = await pool.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      const pick = await c.query(`SELECT crew_id, fdp, blh FROM crew_manday_fd_period WHERE roster_period='2026-06' AND fdp>0 AND blh>0 ORDER BY fdp DESC LIMIT 1`)
      if (!pick.rows[0]) { console.warn('[manday-tool.test full] no fdp/blh row — skipping'); await c.query('ROLLBACK'); c.release(); return }
      const { crew_id: crew, fdp: fdp0 } = pick.rows[0]
      const res = await recompute(wrap(c), { schema: 'f8', startDt: '2026-06-01', endDt: '2026-06-02', updatedBy: 'ROSTER_IMPORT' })
      expect(res.crews).toBeGreaterThan(0)
      const after = await c.query(`SELECT fdp, blh FROM crew_manday_fd_period WHERE crew_id=$1 AND roster_period='2026-06'`, [crew])
      expect(Number(after.rows[0]?.fdp)).toBe(Number(fdp0)) // import column untouched
      expect(Number(after.rows[0]?.blh)).toBeGreaterThan(0)  // blh always recomputed
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 60000)

  it('column-preserving: a scoped recompute does NOT wipe import-fed columns (fdp)', async () => {
    if (!reachable || !pool) {
      console.warn('[manday-tool.test fdp] DB unreachable — skipping')
      return
    }
    // Pick a crew whose June monthly row has fdp populated — the column the old DELETE+INSERT
    // driver would have erased. After a scoped recompute it MUST be byte-identical.
    const c = await pool.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      const pick = await c.query(`SELECT crew_id, fdp FROM crew_manday_fd_period WHERE roster_period='2026-06' AND fdp > 0 ORDER BY fdp DESC LIMIT 1`)
      if (!pick.rows[0]) { console.warn('[manday-tool.test fdp] no fdp>0 row — skipping'); await c.query('ROLLBACK'); c.release(); return }
      const crew = pick.rows[0].crew_id as string
      const before = Number(pick.rows[0].fdp)
      await recompute(wrap(c), { schema: 'f8', crewIds: [crew], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST' })
      const after = await c.query(`SELECT fdp FROM crew_manday_fd_period WHERE crew_id=$1 AND roster_period='2026-06'`, [crew])
      expect(Number(after.rows[0]?.fdp)).toBe(before)
      expect(before).toBeGreaterThan(0)
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)
})
