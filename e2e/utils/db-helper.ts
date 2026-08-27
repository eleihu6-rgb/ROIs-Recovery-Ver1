/**
 * Database Helper for PostgreSQL.
 *
 * Connects to the ROIS database to seed/verify test data.
 * Uses the `pg` module via raw SQL — no ORM dependency.
 *
 * Usage:
 *   const db = await createDbHelper()
 *   await db.query('SELECT ...')
 *   await db.cleanup()
 *
 * Note: This requires the `pg` npm package.
 * Install with: npm install --save-dev pg
 */

export interface DbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  schema: string  // e.g., 'f8' or 'tg'
}

const DEFAULT_CONFIG: DbConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME ?? 'rois',
  user: process.env.DB_USER ?? 'f8',
  password: process.env.DB_PASSWORD ?? 'Pier2026AIf8',
  schema: process.env.DB_SCHEMA ?? 'f8',
}

export async function createDbHelper(config: Partial<DbConfig> = {}): Promise<DbHelper> {
  const merged = { ...DEFAULT_CONFIG, ...config }

  let pg: typeof import('pg')
  try {
    pg = await import('pg')
  } catch {
    throw new Error(
      'pg package not found. Install with: npm install --save-dev pg\n' +
      'Alternatively, use API-based test data setup instead of direct DB access.',
    )
  }

  const pool = new pg.Pool({
    host: merged.host,
    port: merged.port,
    database: merged.database,
    user: merged.user,
    password: merged.password,
  })

  return new DbHelper(pool, merged.schema)
}

export class DbHelper {
  private pool: import('pg').Pool
  private schema: string

  constructor(pool: import('pg').Pool, schema: string) {
    this.pool = pool
    this.schema = schema
  }

  /** Execute a raw SQL query with optional parameters */
  async query<T = Record<string, unknown>[]>(
    sql: string,
    params?: unknown[],
  ): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query(`SET search_path TO ${this.schema}`)
      const result = await client.query(sql, params)
      return result.rows as T
    } finally {
      client.release()
    }
  }

  /** Run SQL within a transaction (auto rollback) */
  async transaction<T>(fn: (helper: DbHelper) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query(`SET search_path TO ${this.schema}`)
      await client.query('BEGIN')
      const result = await fn(this)
      await client.query('ROLLBACK') // auto-rollback for test isolation
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  /** Clean up test-created data by ID */
  async cleanup(table: string, id: number | string): Promise<void> {
    await this.query(`DELETE FROM ${table} WHERE id = $1`, [id])
  }

  /** Close the connection pool */
  async close(): Promise<void> {
    await this.pool.end()
  }
}

/**
 * Simpler DB helper using direct HTTP call to a DB proxy endpoint.
 * Use this if the `pg` package is not available.
 * Set up a simple SQL endpoint on your backend: POST /api/test/db-query
 */
export async function runDbQueryViaApi(
  baseUrl: string,
  sql: string,
  params?: unknown[],
  schema = 'f8',
  token?: string,
): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${baseUrl}/api/test/db-query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql, params, schema }),
  })

  if (!response.ok) {
    throw new Error(`DB query failed: ${response.status} ${response.statusText}`)
  }

  const body = await response.json() as { data: Record<string, unknown>[] }
  return body.data
}
