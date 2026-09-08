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
  // Connection pool sizing & timeouts.
  //
  // The remote PG (47.237.67.15) is reachable but each new TCP/TLS/handshake
  // round-trip costs ~2-3s. With `max: 20` and `connectionTimeoutMillis: 5000`
  // the first incoming request can fan out into 4 concurrent queries
  // (data + count + compositions + segments) before the pool finishes
  // building its first clients, and the 5s budget gets blown — producing the
  // "timeout exceeded when trying to connect" burst we saw right after a
  // fresh restart.
  //
  // To absorb that cold-start window we:
  //   1) bump `max` so there is real headroom for parallel queries,
  //   2) widen `connectionTimeoutMillis` to ride out a slow handshake, and
  //   3) eagerly warm the pool after the boot probe so HTTP listeners only
  //      open once clients are already cached.
  const poolMax = Number.parseInt(process.env.PG_POOL_MAX ?? '40', 10) || 40
  const connectionTimeoutMillis = Number.parseInt(
    process.env.PG_CONNECTION_TIMEOUT_MS ?? '15000',
    10,
  ) || 15000

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis,
    // Keep idle sockets alive across the NAT/firewall so we don't pay the
    // handshake cost on every page refresh.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  })

  // Verify connectivity before we start accepting traffic.
  const client = await pool.connect()
  const result = await client.query('SELECT current_schema()')
  fastify.log.info(
    { schema: result.rows[0].current_schema, max: poolMax, connectionTimeoutMillis },
    'Database connected',
  )
  client.release()

  // Eager warm-up: pre-create a handful of clients so the first real
  // request doesn't have to pay the handshake tax. We intentionally cap the
  // warm-up at half the pool (max 8) to keep the cold start cheap and
  // bounded; the remaining slots fill naturally on first use.
  const warmupCount = Math.min(Math.ceil(poolMax / 2), 8)
  const warmupClients: pg.PoolClient[] = []
  try {
    // Parallel warm-up: serial `await` of 8 handshakes to a slow remote PG
    // can take 9-10s and trip the fastify plugin timeout. `Promise.all` keeps
    // the cold-start budget at ~1s.
    const warmupTasks: Array<Promise<void>> = []
    for (let i = 0; i < warmupCount; i += 1) {
      warmupTasks.push((async () => {
        const c = await pool.connect()
        await c.query('SELECT 1')
        warmupClients.push(c)
      })())
    }
    await Promise.all(warmupTasks)
    fastify.log.info(
      { warmup: warmupClients.length, max: poolMax },
      'Database pool warmed',
    )
  } catch (err) {
    // Warm-up is best-effort. A single bad handshake here must not block
    // the server from starting — the pool will keep trying on real traffic.
    fastify.log.warn({ err: (err as Error).message }, 'Database pool warm-up failed')
  } finally {
    while (warmupClients.length > 0) {
      const c = warmupClients.pop()
      try {
        c?.release()
      } catch {
        /* ignore double-release */
      }
    }
  }

  const db = drizzle(pool)

  fastify.decorate('db', db)
  fastify.decorate('pgPool', pool)

  fastify.addHook('onClose', async () => {
    await pool.end()
    fastify.log.info('Database pool closed')
  })
})
