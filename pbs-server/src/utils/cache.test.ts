import assert from "node:assert/strict";
import test from "node:test";
import { register } from "prom-client";
import { buildPbsCacheKey, createPbsCache } from "./cache.js";

type FakeRedis = {
  store: Map<string, string>;
  getCalls: number;
  setCalls: number;
  delCalls: number;
  evalCalls: number;
  lockSetCalls: number;
  failGet: boolean;
  failSet: boolean;
  failEval: boolean;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options: { EX?: number; PX?: number; NX?: true }) => Promise<string | null>;
  del: (keys: string | string[]) => Promise<number>;
  scan: (cursor: number, options: { MATCH: string; COUNT: number }) => Promise<{ cursor: number; keys: string[] }>;
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<number>;
};

const createFakeRedis = (): FakeRedis => {
  const redis: FakeRedis = {
    store: new Map(),
    getCalls: 0,
    setCalls: 0,
    delCalls: 0,
    evalCalls: 0,
    lockSetCalls: 0,
    failGet: false,
    failSet: false,
    failEval: false,
    async get(key) {
      redis.getCalls += 1;

      if (redis.failGet) {
        throw new Error("get failed");
      }

      // Mock receives the prefixed key from the production code; strip the
      // "dev:" / "uat:" / etc. prefix so the fixture map (which stores raw
      // keys) still hits.
      const raw = key.replace(/^[a-z][a-z0-9_]*:/, "");
      return redis.store.get(raw) ?? null;
    },
    async set(key, value, options) {
      redis.setCalls += 1;
      if (options.NX) {
        redis.lockSetCalls += 1;
      }

      if (redis.failSet) {
        throw new Error("set failed");
      }

      if (options.NX && redis.store.has(key.replace(/^[a-z][a-z0-9_]*:/, ""))) {
        return null;
      }

      redis.store.set(key.replace(/^[a-z][a-z0-9_]*:/, ""), value);
      return "OK";
    },
    async del(keys) {
      redis.delCalls += 1;
      const targets = Array.isArray(keys) ? keys : [keys];

      for (const key of targets) {
        redis.store.delete(key.replace(/^[a-z][a-z0-9_]*:/, ""));
      }

      return targets.length;
    },
    async scan(_cursor, options) {
      const prefix = options.MATCH.replace(/\*$/, "");
      return {
        cursor: 0,
        keys: Array.from(redis.store.keys()).filter((key) => key.startsWith(prefix)),
      };
    },
    async eval(_script, options) {
      redis.evalCalls += 1;

      if (redis.failEval) {
        throw new Error("eval failed");
      }

      const [key] = options.keys;
      const [token] = options.arguments;

      if (key && redis.store.get(key.replace(/^[a-z][a-z0-9_]*:/, "")) === token) {
        redis.store.delete(key);
        return 1;
      }

      return 0;
    },
  };

  return redis;
};

const waitForTurn = () => new Promise<void>((resolve) => {
  setImmediate(resolve);
});

test("buildPbsCacheKey namespaces PBS cache keys and escapes colons", () => {
  assert.equal(
    buildPbsCacheKey("f8_pbs", "period", "current", "v1", "crew:247"),
    "pbs:f8_pbs:period:current:v1:crew%3A247",
  );
});

test("createPbsCache reuses the global current-period v2 cache across callers", async () => {
  register.clear();
  const redis = createFakeRedis();
  const cache = createPbsCache({ redis, schema: "f8_pbs" });
  const key = cache.key("period", "current", "v2", "global");
  assert.equal(key, "pbs:f8_pbs:period:current:v2:global");
  let loadCount = 0;

  const load = async () => {
    loadCount += 1;
    return { periodCode: "Jul 2026" };
  };

  assert.deepEqual(await cache.getOrSet(key, 60, load), { periodCode: "Jul 2026" });
  assert.deepEqual(await cache.getOrSet(key, 60, load), { periodCode: "Jul 2026" });
  assert.equal(loadCount, 1);
  assert.equal(redis.getCalls, 2);
  assert.equal(redis.setCalls, 1);
  assert.match(
    await register.metrics(),
    /rois_pbs_server_cache_resource_hit_total\{cache_group="period",cache_resource="current",mode="single"\} 1/,
  );
});

test("createPbsCache deletes invalid JSON and falls back to loader", async () => {
  register.clear();
  const redis = createFakeRedis();
  const cache = createPbsCache({ redis, schema: "f8_pbs" });
  const key = cache.key("line", "property-catalog", "v1");

  redis.store.set(key, "{broken");

  assert.deepEqual(await cache.getOrSet(key, 60, async () => ({ ok: true })), { ok: true });
  assert.equal(redis.delCalls, 1);
  assert.equal(redis.setCalls, 1);
});

test("createPbsCache returns loader value when Redis get or set fails", async () => {
  register.clear();
  const redis = createFakeRedis();
  const cache = createPbsCache({ redis, schema: "f8_pbs" });
  const key = cache.key("reserve", "property-catalog", "v1");

  redis.failGet = true;
  redis.failSet = true;

  assert.deepEqual(await cache.getOrSet(key, 60, async () => ({ source: "db" })), { source: "db" });
  assert.equal(redis.getCalls, 1);
  assert.equal(redis.setCalls, 1);
});

test("createPbsCache default getOrSet does not collapse concurrent global-period cold misses", async () => {
  register.clear();
  const redis = createFakeRedis();
  const cache = createPbsCache({ redis, schema: "f8_pbs" });
  const key = cache.key("period", "current", "v2", "global");
  let loadCount = 0;
  let releaseLoad!: () => void;
  const loadBlocker = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });

  const promises = Array.from({ length: 5 }, (_, index) => cache.getOrSet(key, 60, async () => {
    loadCount += 1;
    await loadBlocker;
    return { index };
  }));

  await waitForTurn();

  assert.equal(loadCount, 5);
  releaseLoad();
  await Promise.all(promises);
});

test("createPbsCache stampede protection joins same-process cold misses", async () => {
  register.clear();
  const redis = createFakeRedis();
  const cache = createPbsCache({ redis, schema: "f8_pbs" });
  const key = cache.key("pairing-search", "preview", "v1", "f8", "YYZ");
  let loadCount = 0;

  const results = await Promise.all(Array.from({ length: 20 }, () => cache.getOrSet(
    key,
    60,
    async () => {
      loadCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { source: "db" };
    },
    {
      stampedeProtection: {
        enabled: true,
        waitTimeoutMs: 100,
        pollIntervalMs: 1,
      },
    },
  )));

  assert.equal(loadCount, 1);
  assert.equal(redis.lockSetCalls, 1);
  assert.deepEqual(new Set(results.map((result) => result.source)), new Set(["db"]));
  const metrics = await register.metrics();
  assert.match(
    metrics,
    /rois_pbs_server_cache_stampede_total\{cache_group="pairing-search",cache_resource="preview",outcome="lock_acquired"\} 1/,
  );
  assert.match(
    metrics,
    /rois_pbs_server_cache_stampede_total\{cache_group="pairing-search",cache_resource="preview",outcome="local_join"\} 19/,
  );
});

test("createPbsCache stampede protection waits for another cache instance to fill Redis", async () => {
  register.clear();
  const redis = createFakeRedis();
  const firstCache = createPbsCache({ redis, schema: "f8_pbs" });
  const secondCache = createPbsCache({ redis, schema: "f8_pbs" });
  const key = firstCache.key("pairing-search", "preview", "v1", "f8", "YYZ");
  let loadCount = 0;
  const options = {
    stampedeProtection: {
      enabled: true as const,
      waitTimeoutMs: 100,
      pollIntervalMs: 1,
    },
  };
  const load = async () => {
    loadCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { source: "db" };
  };

  const [first, second] = await Promise.all([
    firstCache.getOrSet(key, 60, load, options),
    secondCache.getOrSet(key, 60, load, options),
  ]);

  assert.equal(loadCount, 1);
  assert.equal(redis.lockSetCalls, 2);
  assert.deepEqual(first, { source: "db" });
  assert.deepEqual(second, { source: "db" });
  assert.match(
    await register.metrics(),
    /rois_pbs_server_cache_stampede_total\{cache_group="pairing-search",cache_resource="preview",outcome="wait_hit"\} 1/,
  );
});

test("createPbsCache stampede protection falls back to loader after wait timeout", async () => {
  register.clear();
  const redis = createFakeRedis();
  const cache = createPbsCache({ redis, schema: "f8_pbs" });
  const key = cache.key("pairing-search", "preview", "v1", "f8", "YYZ");
  redis.store.set(`${key}:lock`, "other-process");
  let loadCount = 0;

  assert.deepEqual(
    await cache.getOrSet(
      key,
      60,
      async () => {
        loadCount += 1;
        return { source: "fallback" };
      },
      {
        stampedeProtection: {
          enabled: true,
          waitTimeoutMs: 5,
          pollIntervalMs: 1,
        },
      },
    ),
    { source: "fallback" },
  );

  assert.equal(loadCount, 1);
  const metrics = await register.metrics();
  assert.match(
    metrics,
    /rois_pbs_server_cache_stampede_total\{cache_group="pairing-search",cache_resource="preview",outcome="wait_timeout"\} 1/,
  );
  assert.match(
    metrics,
    /rois_pbs_server_cache_stampede_total\{cache_group="pairing-search",cache_resource="preview",outcome="fallback_load"\} 1/,
  );
});

test("createPbsCache stampede protection falls back when Redis lock or release fails", async () => {
  register.clear();
  const lockFailingRedis = createFakeRedis();
  lockFailingRedis.failSet = true;
  const lockFailingCache = createPbsCache({ redis: lockFailingRedis, schema: "f8_pbs" });
  const lockFailingKey = lockFailingCache.key("pairing-search", "preview", "v1", "f8", "YYZ");

  assert.deepEqual(
    await lockFailingCache.getOrSet(
      lockFailingKey,
      60,
      async () => ({ source: "db" }),
      { stampedeProtection: { enabled: true, waitTimeoutMs: 5, pollIntervalMs: 1 } },
    ),
    { source: "db" },
  );

  const releaseFailingRedis = createFakeRedis();
  releaseFailingRedis.failEval = true;
  const releaseFailingCache = createPbsCache({ redis: releaseFailingRedis, schema: "f8_pbs" });
  const releaseFailingKey = releaseFailingCache.key("pairing-search", "preview", "v1", "f8", "YYZ");

  assert.deepEqual(
    await releaseFailingCache.getOrSet(
      releaseFailingKey,
      60,
      async () => ({ source: "db" }),
      { stampedeProtection: { enabled: true, waitTimeoutMs: 5, pollIntervalMs: 1 } },
    ),
    { source: "db" },
  );

  const metrics = await register.metrics();
  assert.match(metrics, /outcome="lock_error"/);
  assert.match(metrics, /outcome="release_error"/);
});
