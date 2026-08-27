import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { Counter, register } from "prom-client";
import { withPrefix } from "./redis-key-prefix.js";

type PbsCacheSetOptions = {
  EX?: number;
  PX?: number;
  NX?: true;
};

export type PbsCacheRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options: PbsCacheSetOptions) => Promise<unknown>;
  del: (keys: string | string[]) => Promise<unknown>;
  scan: (cursor: number, options: { MATCH: string; COUNT: number }) => Promise<{ cursor: number; keys: string[] }>;
  eval?: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
};

type PbsCacheLogger = Pick<FastifyBaseLogger, "debug" | "warn">;

type PbsCacheStampedeProtectionOptions = {
  enabled: true;
  lockTtlMs?: number;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
};

type PbsCacheGetOrSetOptions<TValue> = {
  serialize?: (value: TValue) => unknown;
  deserialize?: (value: unknown) => TValue;
  stampedeProtection?: PbsCacheStampedeProtectionOptions;
};

export type PbsCache = {
  key: (group: string, resource: string, version: string, ...dimensions: Array<string | number | null | undefined>) => string;
  getOrSet: <TValue>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<TValue>,
    options?: PbsCacheGetOrSetOptions<TValue>,
  ) => Promise<TValue>;
  invalidate: (...keys: string[]) => Promise<void>;
  invalidatePattern: (pattern: string) => Promise<void>;
};

type CreatePbsCacheOptions = {
  redis: PbsCacheRedis;
  schema: string;
  logger?: PbsCacheLogger;
};

const CACHE_HIT_METRIC = "rois_pbs_server_cache_hit_total";
const CACHE_MISS_METRIC = "rois_pbs_server_cache_miss_total";
const CACHE_ERROR_METRIC = "rois_pbs_server_cache_error_total";
const CACHE_RESOURCE_HIT_METRIC = "rois_pbs_server_cache_resource_hit_total";
const CACHE_RESOURCE_MISS_METRIC = "rois_pbs_server_cache_resource_miss_total";
const CACHE_STAMPEDE_METRIC = "rois_pbs_server_cache_stampede_total";
const DEFAULT_LOCK_TTL_MS = 10_000;
const DEFAULT_WAIT_TIMEOUT_MS = 3_000;
const DEFAULT_POLL_INTERVAL_MS = 75;
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const getOrCreateCounter = (
  name: string,
  help: string,
  labelNames: string[],
): Counter<string> =>
  (register.getSingleMetric(name) as Counter<string> | undefined)
  ?? new Counter({
    name,
    help,
    labelNames,
    registers: [register],
  });

const cacheHitTotal = () => getOrCreateCounter(
  CACHE_HIT_METRIC,
  "PBS Redis cache hits by cache group and mode.",
  ["cache_group", "mode"],
);

const cacheMissTotal = () => getOrCreateCounter(
  CACHE_MISS_METRIC,
  "PBS Redis cache misses by cache group and mode.",
  ["cache_group", "mode"],
);

const cacheErrorTotal = () => getOrCreateCounter(
  CACHE_ERROR_METRIC,
  "PBS Redis cache errors by cache group and operation.",
  ["cache_group", "operation"],
);

const cacheResourceHitTotal = () => getOrCreateCounter(
  CACHE_RESOURCE_HIT_METRIC,
  "PBS Redis cache hits by cache group, resource, and mode.",
  ["cache_group", "cache_resource", "mode"],
);

const cacheResourceMissTotal = () => getOrCreateCounter(
  CACHE_RESOURCE_MISS_METRIC,
  "PBS Redis cache misses by cache group, resource, and mode.",
  ["cache_group", "cache_resource", "mode"],
);

const cacheStampedeTotal = () => getOrCreateCounter(
  CACHE_STAMPEDE_METRIC,
  "PBS Redis cache stampede protection outcomes by cache group and resource.",
  ["cache_group", "cache_resource", "outcome"],
);

const cacheMetadata = (key: string): { group: string; resource: string } => {
  const parts = key.split(":");

  if (parts[0] === "pbs") {
    return {
      group: parts[2] || "unknown",
      resource: parts[3] || "unknown",
    };
  }

  return {
    group: parts[0] || "unknown",
    resource: parts[1] || "unknown",
  };
};

const normalizeKeyPart = (value: string | number | null | undefined): string => {
  const raw = value === null || value === undefined ? "-" : String(value).trim();
  return raw ? raw.replaceAll(":", "%3A") : "-";
};

export const buildPbsCacheKey = (
  schema: string,
  group: string,
  resource: string,
  version: string,
  ...dimensions: Array<string | number | null | undefined>
): string => [
  "pbs",
  normalizeKeyPart(schema),
  normalizeKeyPart(group),
  normalizeKeyPart(resource),
  normalizeKeyPart(version),
  ...dimensions.map(normalizeKeyPart),
].join(":");

type StampedeProtectionConfig = {
  lockTtlMs: number;
  waitTimeoutMs: number;
  pollIntervalMs: number;
};

type CacheReadResult<TValue> =
  | { hit: true; value: TValue; redisAvailable: true }
  | { hit: false; redisAvailable: boolean };

const normalizeStampedeProtection = (
  options?: PbsCacheStampedeProtectionOptions,
): StampedeProtectionConfig | null => {
  if (!options?.enabled) return null;

  return {
    lockTtlMs: options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS,
    waitTimeoutMs: options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  };
};

const observeCacheHit = (group: string, resource: string, mode: string): void => {
  cacheHitTotal().inc({ cache_group: group, mode });
  cacheResourceHitTotal().inc({ cache_group: group, cache_resource: resource, mode });
};

const observeCacheMiss = (group: string, resource: string, mode: string): void => {
  cacheMissTotal().inc({ cache_group: group, mode });
  cacheResourceMissTotal().inc({ cache_group: group, cache_resource: resource, mode });
};

const observeStampede = (group: string, resource: string, outcome: string): void => {
  cacheStampedeTotal().inc({ cache_group: group, cache_resource: resource, outcome });
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, Math.max(0, ms));
});

export const createPbsCache = ({
  redis,
  schema,
  logger,
}: CreatePbsCacheOptions): PbsCache => {
  const inFlightLoads = new Map<string, Promise<unknown>>();

  const key = (
    group: string,
    resource: string,
    version: string,
    ...dimensions: Array<string | number | null | undefined>
  ) => buildPbsCacheKey(schema, group, resource, version, ...dimensions);

  const readCachedValue = async <TValue>(
    cacheKey: string,
    options: PbsCacheGetOrSetOptions<TValue>,
    input: {
      group: string;
      resource: string;
      mode: string;
      recordHit: boolean;
      recordMiss: boolean;
    },
  ): Promise<CacheReadResult<TValue>> => {
    const { group, resource, mode, recordHit, recordMiss } = input;

    try {
      const cached = await redis.get(withPrefix(cacheKey));

      if (cached !== null) {
        try {
          const parsed = JSON.parse(cached) as unknown;
          if (recordHit) {
            observeCacheHit(group, resource, mode);
          }

          return {
            hit: true,
            value: options.deserialize ? options.deserialize(parsed) : parsed as TValue,
            redisAvailable: true,
          };
        } catch (error) {
          cacheErrorTotal().inc({ cache_group: group, operation: "parse" });
          logger?.warn({ err: error, cacheGroup: group, cacheResource: resource }, "Invalid PBS Redis cache entry");
          await redis.del(withPrefix(cacheKey)).catch(() => undefined);
        }
      }
    } catch (error) {
      cacheErrorTotal().inc({ cache_group: group, operation: "get" });
      logger?.debug({ err: error, cacheGroup: group, cacheResource: resource }, "PBS Redis cache get failed");

      if (recordMiss) {
        observeCacheMiss(group, resource, mode);
      }

      return { hit: false, redisAvailable: false };
    }

    if (recordMiss) {
      observeCacheMiss(group, resource, mode);
    }

    return { hit: false, redisAvailable: true };
  };

  const writeCachedValue = async <TValue>(
    cacheKey: string,
    ttlSeconds: number,
    value: TValue,
    options: PbsCacheGetOrSetOptions<TValue>,
    group: string,
    resource: string,
  ): Promise<void> => {
    try {
      const payload = options.serialize ? options.serialize(value) : value;
      await redis.set(withPrefix(cacheKey), JSON.stringify(payload), { EX: ttlSeconds });
    } catch (error) {
      cacheErrorTotal().inc({ cache_group: group, operation: "set" });
      logger?.debug({ err: error, cacheGroup: group, cacheResource: resource }, "PBS Redis cache set failed");
    }
  };

  const loadAndSet = async <TValue>(
    cacheKey: string,
    ttlSeconds: number,
    load: () => Promise<TValue>,
    options: PbsCacheGetOrSetOptions<TValue>,
    group: string,
    resource: string,
  ): Promise<TValue> => {
    const value = await load();
    await writeCachedValue(cacheKey, ttlSeconds, value, options, group, resource);

    return value;
  };

  const releaseLock = async (lockKey: string, token: string, group: string, resource: string): Promise<void> => {
    if (!redis.eval) {
      return;
    }

    try {
      await redis.eval(RELEASE_LOCK_SCRIPT, { keys: [withPrefix(lockKey)], arguments: [token] });
    } catch (error) {
      cacheErrorTotal().inc({ cache_group: group, operation: "release" });
      observeStampede(group, resource, "release_error");
      logger?.debug({ err: error, cacheGroup: group, cacheResource: resource }, "PBS Redis cache lock release failed");
    }
  };

  const waitForCachedValue = async <TValue>(
    cacheKey: string,
    options: PbsCacheGetOrSetOptions<TValue>,
    stampedeConfig: StampedeProtectionConfig,
    group: string,
    resource: string,
    mode: string,
  ): Promise<CacheReadResult<TValue>> => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < stampedeConfig.waitTimeoutMs) {
      await sleep(stampedeConfig.pollIntervalMs);

      const cached = await readCachedValue<TValue>(cacheKey, options, {
        group,
        resource,
        mode,
        recordHit: true,
        recordMiss: false,
      });

      if (cached.hit || !cached.redisAvailable) {
        return cached;
      }
    }

    return { hit: false, redisAvailable: true };
  };

  const loadWithDistributedLock = async <TValue>(
    cacheKey: string,
    ttlSeconds: number,
    load: () => Promise<TValue>,
    options: PbsCacheGetOrSetOptions<TValue>,
    stampedeConfig: StampedeProtectionConfig,
    group: string,
    resource: string,
    mode: string,
  ): Promise<TValue> => {
    const lockKey = `${cacheKey}:lock`;
    const lockToken = randomUUID();
    let lockAcquired = false;

    try {
      const lockResult = await redis.set(withPrefix(lockKey), lockToken, {
        PX: stampedeConfig.lockTtlMs,
        NX: true,
      });
      lockAcquired = lockResult === "OK";
    } catch (error) {
      cacheErrorTotal().inc({ cache_group: group, operation: "lock" });
      observeStampede(group, resource, "lock_error");
      observeStampede(group, resource, "fallback_load");
      logger?.debug({ err: error, cacheGroup: group, cacheResource: resource }, "PBS Redis cache lock failed");

      return loadAndSet(cacheKey, ttlSeconds, load, options, group, resource);
    }

    if (lockAcquired) {
      observeStampede(group, resource, "lock_acquired");

      try {
        const cached = await readCachedValue<TValue>(cacheKey, options, {
          group,
          resource,
          mode,
          recordHit: true,
          recordMiss: false,
        });

        if (cached.hit) {
          return cached.value;
        }

        return await loadAndSet(cacheKey, ttlSeconds, load, options, group, resource);
      } finally {
        await releaseLock(lockKey, lockToken, group, resource);
      }
    }

    observeStampede(group, resource, "lock_contended");

    const waited = await waitForCachedValue<TValue>(cacheKey, options, stampedeConfig, group, resource, mode);

    if (waited.hit) {
      observeStampede(group, resource, "wait_hit");
      return waited.value;
    }

    if (waited.redisAvailable) {
      observeStampede(group, resource, "wait_timeout");
    }

    observeStampede(group, resource, "fallback_load");
    return loadAndSet(cacheKey, ttlSeconds, load, options, group, resource);
  };

  const getOrSetWithStampedeProtection = async <TValue>(
    cacheKey: string,
    ttlSeconds: number,
    load: () => Promise<TValue>,
    options: PbsCacheGetOrSetOptions<TValue>,
    stampedeConfig: StampedeProtectionConfig,
    group: string,
    resource: string,
    mode: string,
  ): Promise<TValue> => {
    const existing = inFlightLoads.get(cacheKey) as Promise<TValue> | undefined;

    if (existing) {
      observeStampede(group, resource, "local_join");
      return existing;
    }

    let promise: Promise<TValue>;
    promise = loadWithDistributedLock(
      cacheKey,
      ttlSeconds,
      load,
      options,
      stampedeConfig,
      group,
      resource,
      mode,
    ).finally(() => {
      if (inFlightLoads.get(cacheKey) === promise) {
        inFlightLoads.delete(cacheKey);
      }
    });

    inFlightLoads.set(cacheKey, promise);
    return promise;
  };

  const getOrSet = async <TValue>(
    cacheKey: string,
    ttlSeconds: number,
    load: () => Promise<TValue>,
    options: PbsCacheGetOrSetOptions<TValue> = {},
  ): Promise<TValue> => {
    const { group, resource } = cacheMetadata(cacheKey);
    const stampedeConfig = normalizeStampedeProtection(options.stampedeProtection);
    const mode = stampedeConfig ? "singleflight" : "single";
    const cached = await readCachedValue<TValue>(cacheKey, options, {
      group,
      resource,
      mode,
      recordHit: true,
      recordMiss: true,
    });

    if (cached.hit) {
      return cached.value;
    }

    if (!stampedeConfig) {
      return loadAndSet(cacheKey, ttlSeconds, load, options, group, resource);
    }

    return getOrSetWithStampedeProtection(
      cacheKey,
      ttlSeconds,
      load,
      options,
      stampedeConfig,
      group,
      resource,
      mode,
    );
  };

  const invalidate = async (...keys: string[]): Promise<void> => {
    if (keys.length === 0) return;
    await redis.del(keys.map((k) => withPrefix(k)));
  };

  const invalidatePattern = async (pattern: string): Promise<void> => {
    // pattern is the caller-supplied raw key glob; apply the env prefix here
    // so every cache entry point has one consistent contract.
    const prefixed = withPrefix(pattern);
    let cursor = 0;

    do {
      const result = await redis.scan(cursor, { MATCH: prefixed, COUNT: 200 });
      cursor = result.cursor;

      if (result.keys.length > 0) {
        await redis.del(result.keys);
      }
    } while (cursor !== 0);
  };

  return {
    key,
    getOrSet,
    invalidate,
    invalidatePattern,
  };
};
