import { buildPbsCacheKey, type PbsCacheRedis } from "../../utils/cache.js";
import { withPrefix } from "../../utils/redis-key-prefix.js";

export type SimulatedLoginReplayGuard = {
  consume: (jti: string, ttlSeconds: number) => Promise<boolean>;
};

export const createSimulatedLoginReplayGuard = (input: {
  redis: PbsCacheRedis;
  schema: string;
}): SimulatedLoginReplayGuard => ({
  async consume(jti, ttlSeconds) {
    const key = buildPbsCacheKey(
      input.schema,
      "auth",
      "simulated-login",
      "v1",
      "used",
      jti,
    );
    const result = await input.redis.set(withPrefix(key), "1", {
      EX: Math.max(1, ttlSeconds),
      NX: true,
    });

    return result === "OK";
  },
});
