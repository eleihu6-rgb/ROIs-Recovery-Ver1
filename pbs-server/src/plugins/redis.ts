import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createClient, type RedisClientType } from "redis";
import { env } from "../config/index.js";
import { createPrefixedRedis } from "../utils/prefixed-redis.js";

declare module "fastify" {
  interface FastifyInstance {
    redis: RedisClientType;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const raw = createClient({ url: env.REDIS_PBS_URL }) as RedisClientType;

  raw.on("error", (error) => {
    fastify.log.error({ err: error }, "PBS Redis connection error");
  });

  await raw.connect();
  fastify.log.info("PBS Redis connected");

  // Wrap the raw client with key-prefix injection. See
  // utils/prefixed-redis.ts for details.
  const redis = createPrefixedRedis(raw);
  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await raw.quit();
    fastify.log.info("PBS Redis connection closed");
  });
});
