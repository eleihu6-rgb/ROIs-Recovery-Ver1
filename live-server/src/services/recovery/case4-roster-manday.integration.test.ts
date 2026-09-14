import 'dotenv/config'
import { expect, it } from 'vitest'
import pg from 'pg'
import { recompute } from '../manday/manday-tool.js'
import { liveSchema, liveSchemaName } from '../../utils/db-schema.js'

// Explicitly opt in to the prepared Case 4 fixture. Every query is pinned to one
// rolled-back transaction; never repoint historical f8 golden fixtures at Live.
it.skipIf(process.env.CASE4_GH_INTEGRATION !== '1')('all seven Case 4 saved credits reproduce from real roster through Rust manday', async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  const client = await pool.connect()
  const crewIds = ['C4002', 'C4003', 'C4004', 'C4005', 'C4006', 'C4007', 'C4008']
  const sql = `SELECT crew_id, SUM(credit)::int AS credit FROM ${liveSchema()}.crew_manday_fd_daily
    WHERE crew_id=ANY($1::text[]) AND crew_base_dt >= '2026-09-01' AND crew_base_dt < '2026-10-01'
    GROUP BY crew_id ORDER BY crew_id`
  try {
    await client.query('BEGIN')
    const before = (await client.query(sql, [crewIds])).rows
    expect(before.map(row => row.credit)).toEqual([1290, 3075, 5000, 5055, 5365, 1765, 1795])
    const rosterBefore = (await client.query(`SELECT * FROM ${liveSchema()}.roster_flight WHERE crew_id=ANY($1::text[]) ORDER BY id`, [crewIds])).rows
    const pinned = { query: (query: string, params?: unknown[]) => client.query(query, params) } as unknown as pg.Pool
    const result = await recompute(pinned, { schema: liveSchemaName(), crewIds, startDt: '2026-09-01', endDt: '2026-09-30', updatedBy: 'C4_GH_VERIFY_ROLLBACK' })
    expect(result.crews).toBe(7)
    expect((await client.query(sql, [crewIds])).rows).toEqual(before)
    expect((await client.query(`SELECT * FROM ${liveSchema()}.roster_flight WHERE crew_id=ANY($1::text[]) ORDER BY id`, [crewIds])).rows).toEqual(rosterBefore)
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await pool.end()
  }
}, 120_000)
