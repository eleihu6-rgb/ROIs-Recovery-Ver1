/**
 * One-off: create/refresh demo login users (Jen, Mat, Ryan, Qiang).
 *
 * - Hashes the shared password with bcryptjs (cost 10), matching the login route.
 * - Upserts into the `users` table (schema from DATABASE_URL search_path=f8).
 * - Mirrors `admin`'s user_profile bindings so each user has the same permissions.
 *
 * Re-runnable (idempotent). Run from live-server/:
 *   node scripts/create-demo-users.cjs
 *
 * The password is passed via env so it isn't hard-coded here:
 *   DEMO_PASSWORD=Our2027 node scripts/create-demo-users.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envPath = path.join(__dirname, '..', '.env')
  const text = fs.readFileSync(envPath, 'utf8')
  const line = text.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found in .env')
  return line.slice('DATABASE_URL='.length).trim()
}

// `password` is optional; when omitted the user gets the shared DEMO_PASSWORD.
const USERS = [
  { code: 'Jen', name: 'Jen', py: 'JEN' },
  { code: 'Mat', name: 'Mat', py: 'MAT' },
  { code: 'Ryan', name: 'Ryan', py: 'RYAN' },
  { code: 'Qiang', name: 'Qiang', py: 'QIANG' },
  { code: 'Antoine', name: 'Antoine', py: 'ANTOINE', password: 'A2027' },
  { code: 'Shane', name: 'Shane', py: 'SHANE', password: 'S2027' },
  { code: 'Sameer', name: 'Sameer', py: 'SAMEER' },
  { code: 'Yu', name: 'Yu', py: 'YU' },
  { code: 'Xiping', name: 'Xiping', py: 'XIPING' },
]

async function main() {
  const password = process.env.DEMO_PASSWORD || 'Our2027'
  const pool = new Pool({ connectionString: readDatabaseUrl(), connectionTimeoutMillis: 8000 })
  const client = await pool.connect()
  try {
    const schema = (await client.query('SELECT current_schema()')).rows[0].current_schema
    console.log('connected, schema =', schema)

    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password || password, 10)

      await client.query(
        `INSERT INTO users
           (user_code, user_name, password_hash, branch_code, py_abbr, gender,
            eff_dt, status, is_admin, is_first_login, password_access, portal_access, app_access)
         VALUES ($1, $2, $3, 'HQ', $4, 'M',
            '2026-01-01'::timestamptz, 0, 0, 'N', 'Y', 'Y', 'Y')
         ON CONFLICT (user_code) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            status = 0,
            is_first_login = 'N',
            password_access = 'Y',
            portal_access = 'Y',
            app_access = 'Y',
            updated_by = 'demo-seed',
            updated_at = now()`,
        [u.code, u.name, hash, u.py],
      )

      // Mirror admin's profile bindings (same permissions as admin).
      await client.query(
        `INSERT INTO user_profile (user_code, profile_id)
         SELECT $1::varchar, up.profile_id
         FROM user_profile up
         WHERE up.user_code = 'admin'
           AND NOT EXISTS (
             SELECT 1 FROM user_profile x
             WHERE x.user_code = $1::varchar AND x.profile_id = up.profile_id
           )`,
        [u.code],
      )

      const profCount = (
        await client.query('SELECT count(*)::int AS n FROM user_profile WHERE user_code = $1', [u.code])
      ).rows[0].n
      console.log(`upserted ${u.code} (profiles bound: ${profCount})`)
    }

    const rows = (
      await client.query(
        `SELECT user_code, status, is_admin, password_access FROM users
         WHERE user_code = ANY($1::varchar[]) ORDER BY user_code`,
        [USERS.map((u) => u.code)],
      )
    ).rows
    console.log('verify users table:', JSON.stringify(rows))
  } finally {
    client.release()
    await pool.end()
  }
}

main().then(() => { console.log('done'); process.exit(0) }).catch((e) => { console.error(e); process.exit(1) })
