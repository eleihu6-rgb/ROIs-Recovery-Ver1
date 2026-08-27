import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import type { PoolClient } from 'pg'
import { liveSchemaName, scenarioSchemaName } from '../../utils/db-schema.js'

const queryBodySchema = z.object({
  schema:   z.string().min(1).max(100),
  table:    z.string().min(1).max(100),
  filters:  z.record(z.string()).optional().default({}),
  page:     z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(1000).optional().default(200),
})

const allowedSchemas = (): string[] => [liveSchemaName(), scenarioSchemaName()]

async function assertTableExists(
  client: PoolClient,
  schema: string,
  table: string,
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
    [schema, table],
  )
  return r.rows.length > 0
}

export default async function metadataRoutes(fastify: FastifyInstance) {
  // ── GET /api/metadata/tables?schema=f8 ──────────────────────────────────
  fastify.get<{ Querystring: { schema?: string } }>('/tables', async (req, reply) => {
    const { schema } = req.query
    const allowed = allowedSchemas()
    if (!schema || !allowed.includes(schema)) {
      return fail(reply, 400, `schema must be one of: ${allowed.join(', ')}`)
    }
    const userSchema = req.authUser?.schema as string | undefined
    if (schema !== scenarioSchemaName() && userSchema && userSchema !== schema) {
      return reply.code(403).send(fail(reply, 403, 'Schema access denied'))
    }
    const client = await fastify.pgPool.connect()
    try {
      const result = await client.query(
        `SELECT t.table_name,
                GREATEST(COALESCE(c.reltuples::bigint, 0), 0) AS row_estimate
         FROM information_schema.tables t
         LEFT JOIN pg_class c ON c.relname = t.table_name
           AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
         WHERE t.table_schema = $1
           AND t.table_type = 'BASE TABLE'
         ORDER BY t.table_name`,
        [schema],
      )
      return success(reply, {
        schema,
        tables: result.rows.map((r) => ({
          name:        r.table_name as string,
          rowEstimate: Number(r.row_estimate),
        })),
      })
    } finally {
      client.release()
    }
  })

  // ── GET /api/metadata/columns?schema=f8&table=crew ──────────────────────
  fastify.get<{ Querystring: { schema?: string; table?: string } }>('/columns', async (req, reply) => {
    const { schema, table } = req.query
    const allowed = allowedSchemas()
    if (!schema || !allowed.includes(schema)) {
      return fail(reply, 400, `schema must be one of: ${allowed.join(', ')}`)
    }
    const userSchemaC = req.authUser?.schema as string | undefined
    if (schema !== scenarioSchemaName() && userSchemaC && userSchemaC !== schema) {
      return reply.code(403).send(fail(reply, 403, 'Schema access denied'))
    }
    if (!table) return fail(reply, 400, 'table is required')

    const client = await fastify.pgPool.connect()
    try {
      if (!(await assertTableExists(client, schema, table))) {
        return fail(reply, 400, 'Table not found')
      }
      const result = await client.query(
        `SELECT column_name, data_type, ordinal_position
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table],
      )
      return success(reply, {
        schema,
        table,
        columns: result.rows.map((r) => ({
          name:    r.column_name as string,
          type:    r.data_type as string,
          ordinal: r.ordinal_position as number,
        })),
      })
    } finally {
      client.release()
    }
  })

  // ── POST /api/metadata/query ─────────────────────────────────────────────
  fastify.post('/query', async (req, reply) => {
    const parsed = queryBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.issues[0]?.message ?? 'Invalid request')
    }
    const { schema, table, filters, page, pageSize } = parsed.data
    const allowed = allowedSchemas()
    if (!allowed.includes(schema)) {
      return fail(reply, 400, `schema must be one of: ${allowed.join(', ')}`)
    }

    const userSchemaQ = req.authUser?.schema as string | undefined
    if (schema !== scenarioSchemaName() && userSchemaQ && userSchemaQ !== schema) {
      return reply.code(403).send(fail(reply, 403, 'Schema access denied'))
    }

    const client = await fastify.pgPool.connect()
    try {
      if (!(await assertTableExists(client, schema, table))) {
        return fail(reply, 400, 'Table not found')
      }

      // Fetch valid column names for this table to prevent column injection
      const colResult = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [schema, table],
      )
      const validCols = new Set<string>(colResult.rows.map((r) => r.column_name as string))

      // Build parameterized WHERE clause
      const conditions: string[] = []
      const values: string[] = []
      for (const [col, val] of Object.entries(filters)) {
        if (!val || !validCols.has(col)) continue
        values.push(val)
        conditions.push(`"${col}" = $${values.length}`)
      }

      const where  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const offset = (page - 1) * pageSize

      const [dataResult, countResult] = await Promise.all([
        client.query(
          `SELECT * FROM "${schema}"."${table}" ${where} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, pageSize, offset],
        ),
        client.query(
          `SELECT COUNT(*)::bigint AS total FROM "${schema}"."${table}" ${where}`,
          values,
        ),
      ])

      return success(reply, {
        rows:     dataResult.rows,
        total:    Number(countResult.rows[0].total),
        page,
        pageSize,
      })
    } finally {
      client.release()
    }
  })
}
