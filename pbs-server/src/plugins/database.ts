import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../models/index.js";
import { env } from "../config/index.js";

const { Pool } = pg;
const DB_POOL_MAX_CONNECTIONS = 20;
const DB_POOL_WARM_CONNECTIONS = 6;

declare module "fastify" {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle>;
    pgPool: pg.Pool;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: DB_POOL_MAX_CONNECTIONS,
    min: 1,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  });

  pool.on("error", (error: Error) => {
    fastify.log.warn({ err: error }, "PBS database idle client error");
  });

  const client = await pool.connect();

  try {
    const result = await client.query("select current_user, current_schema(), current_setting('search_path') as search_path");
    fastify.log.info({
      databaseUser: result.rows[0]?.current_user,
      databaseSchema: result.rows[0]?.current_schema,
      searchPath: result.rows[0]?.search_path,
    }, "PBS database connected");
  } finally {
    client.release();
  }

  const warmResults = await Promise.allSettled(
    Array.from({ length: DB_POOL_WARM_CONNECTIONS }, () => pool.connect()),
  );
  let warmedConnections = 0;

  for (const result of warmResults) {
    if (result.status === "fulfilled") {
      warmedConnections += 1;
      result.value.release();
    }
  }

  if (warmedConnections < DB_POOL_WARM_CONNECTIONS) {
    fastify.log.warn({
      warmedConnections,
      requestedConnections: DB_POOL_WARM_CONNECTIONS,
    }, "PBS database pool warmup partially completed");
  } else {
    fastify.log.info({
      warmedConnections,
    }, "PBS database pool warmed");
  }

  const db = drizzle(pool, { schema });

  fastify.decorate("db", db);
  fastify.decorate("pgPool", pool);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
