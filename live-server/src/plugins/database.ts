import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../config/index.js'

const { Pool } = pg

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle>
    pgPool: pg.Pool
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })

  // 验证连接
  const client = await pool.connect()
  const result = await client.query('SELECT current_schema()')
  fastify.log.info(`Database connected, schema: ${result.rows[0].current_schema}`)
  client.release()

  const db = drizzle(pool)

  fastify.decorate('db', db)
  fastify.decorate('pgPool', pool)

  fastify.addHook('onClose', async () => {
    await pool.end()
    fastify.log.info('Database pool closed')
  })
})
