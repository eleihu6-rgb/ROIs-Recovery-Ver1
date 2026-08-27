import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { createPbsPairingSearchService } from "./pairing-search-service.js";
import { DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS } from "./pairing-airport-options-query.js";
import {
  PAIRING_SEARCH_ACTOR_BASE_REQUIRED_MESSAGE,
  PAIRING_SEARCH_ACTOR_RANK_REQUIRED_MESSAGE,
  PAIRING_SEARCH_EFFECTIVE_BASE_REQUIRED_MESSAGE,
  resolvePairingSearchActorBase,
  resolveSinglePropertyPreviewActorContext,
} from "./actor-base.js";
import { createPbsCache, type PbsCache, type PbsCacheRedis } from "../../utils/cache.js";

const actor = {
  crewId: "F8030",
  userCode: "casey.crew",
  isAdmin: false,
};

const withRosterPeriodContext = (pgPool: Pool): Pool => ({
  async query(text: string, values?: unknown[]) {
    if (/from f8\.roster_period/i.test(text)) {
      const rosterPeriodId = Number(values?.[0] ?? 4);
      return {
        rows: [{
          roster_period_id: String(rosterPeriodId),
          roster_period_key: `2026RP${String(rosterPeriodId).padStart(2, "0")}`,
          period_code: rosterPeriodId === 6 ? "Jun 2026" : rosterPeriodId === 7 ? "Jul 2026" : "Apr 2026",
          rp_start_local: rosterPeriodId === 6 ? "2026-06-01" : rosterPeriodId === 7 ? "2026-06-30" : "2026-04-01",
          rp_end_local: rosterPeriodId === 6 ? "2026-06-30" : rosterPeriodId === 7 ? "2026-07-30" : "2026-04-30",
        }],
      };
    }

    const result = await pgPool.query(text, values);
    if (isActorBaseLookupQuery(text) || isSinglePropertyActorContextLookupQuery(text)) {
      return {
        ...result,
        rows: result.rows.map((row) => ({
          ...row,
          zone_id: (row as { zone_id?: string | null }).zone_id ?? "America/Toronto",
        })),
      };
    }

    return result;
  },
}) as unknown as Pool;

const createService = (pgPool: Pool, cache?: PbsCache) => createPbsPairingSearchService({
  pgPool: withRosterPeriodContext(pgPool),
  liveSchema: "f8",
  pbsSchema: "f8_pbs",
  cache,
});

const ACTOR_BASE = "YYZ";
const EMPTY_PREVIEW_ROW = {
  total_items: "0",
  pairing_id_count: "0",
  id: null,
  pairing_label: null,
  base: null,
  division: null,
  duration_days: null,
  duty_count: null,
  fleet: null,
  active_start_date: null,
  report_start_utc: null,
  release_end_utc: null,
};

type FakeRedis = PbsCacheRedis & {
  store: Map<string, string>;
  getCalls: number;
  setCalls: number;
  evalCalls: number;
  lockSetCalls: number;
  failGet: boolean;
  failSet: boolean;
  failEval: boolean;
};

const createFakeRedis = (): FakeRedis => {
  const redis: FakeRedis = {
    store: new Map(),
    getCalls: 0,
    setCalls: 0,
    evalCalls: 0,
    lockSetCalls: 0,
    failGet: false,
    failSet: false,
    failEval: false,
    async get(key) {
      redis.getCalls += 1;

      if (redis.failGet) {
        throw new Error("redis get failed");
      }

      return redis.store.get(key) ?? null;
    },
    async set(key, value, options) {
      redis.setCalls += 1;
      if (options.NX) {
        redis.lockSetCalls += 1;
      }

      if (redis.failSet) {
        throw new Error("redis set failed");
      }

      if (options.NX && redis.store.has(key)) {
        return null;
      }

      redis.store.set(key, value);
      return "OK";
    },
    async del(keys) {
      const targets = Array.isArray(keys) ? keys : [keys];

      for (const key of targets) {
        redis.store.delete(key);
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
        throw new Error("redis eval failed");
      }

      const [key] = options.keys;
      const [token] = options.arguments;

      if (key && redis.store.get(key) === token) {
        redis.store.delete(key);
        return 1;
      }

      return 0;
    },
  };

  return redis;
};

const createPairingSearchCache = (redis = createFakeRedis()) => ({
  redis,
  cache: createPbsCache({ redis, schema: "f8_pbs" }),
});

const delay = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isActorBaseLookupQuery = (text: string) =>
  /from actor_identity actor/i.test(text)
  && /from f8\.crew_base crew_base/i.test(text);

const isSinglePropertyActorContextLookupQuery = (text: string) =>
  isActorBaseLookupQuery(text)
  && /has_usable_base/i.test(text);

const createPairingSearchPgPool = (
  handler: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> | { rows: Array<Record<string, unknown>> },
  actorBase = ACTOR_BASE,
  actorRank: string | null = null,
) => ({
  async query(text: string, values?: unknown[]) {
    if (/from f8\.roster_period/i.test(text)) {
      const rosterPeriodId = Number(values?.[0] ?? 4);
      return {
        rows: [{
          roster_period_id: String(rosterPeriodId),
          roster_period_key: `2026RP${String(rosterPeriodId).padStart(2, "0")}`,
          period_code: rosterPeriodId === 6 ? "Jun 2026" : rosterPeriodId === 7 ? "Jul 2026" : "Apr 2026",
          rp_start_local: rosterPeriodId === 6 ? "2026-06-01" : rosterPeriodId === 7 ? "2026-06-30" : "2026-04-01",
          rp_end_local: rosterPeriodId === 6 ? "2026-06-30" : rosterPeriodId === 7 ? "2026-07-30" : "2026-04-30",
        }],
      };
    }

    if (isSinglePropertyActorContextLookupQuery(text)) {
      return {
        rows: [{ rank: actorRank ?? "CA", has_usable_base: true, zone_id: "America/Toronto", bases: [actorBase] }],
      };
    }

    if (isActorBaseLookupQuery(text)) {
      return {
        rows: [{ base: actorBase, rank: actorRank, zone_id: "America/Toronto" }],
      };
    }

    return handler(text, values);
  },
}) as unknown as Pool;

test("Bid Feedback keeps occurrence bids scoped to the exact pairing and base-local date", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text, values) => {
    queries.push({ text, values });
    return { rows: [] };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  await service.matchFeedbackPairings(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    properties: [{
      key: "current:pairing-occurrence",
      property: {
        propertyGroupKey: "pairing-occurrence",
        rowSeq: 1,
        propertyCode: 102,
        name: "Pairing Number",
        action: "award",
        bid: {
          type: "pairing-occurrence-list",
          occurrences: [{
            pairingId: "10722",
            pairingNumber: "T4101",
            originDate: "2026-06-08",
            occurrenceId: "10722:2026-06-08",
          }],
        },
        tiers: ["T1"],
      },
    }],
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /p\.id::text = \$\d+::text/i);
  assert.match(queries[0]!.text, /candidate\.local_origin_date = \$\d+::date/i);
  assert.ok(queries[0]!.values?.includes("10722"));
  assert.ok(queries[0]!.values?.includes("2026-06-08"));
});

test("Bid Feedback matching reuses resolved period and actor context", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      if (/from f8\.roster_period/i.test(text)) {
        return {
          rows: [{
            roster_period_id: "6",
            roster_period_key: "2026RP06",
            period_code: "Jun 2026",
            rp_start_local: "2026-06-01",
            rp_end_local: "2026-06-30",
          }],
        };
      }
      if (isActorBaseLookupQuery(text)) {
        return { rows: [{ base: ACTOR_BASE, rank: "CA", zone_id: "America/Toronto" }] };
      }
      return { rows: [] };
    },
  } as unknown as Pool;
  const service = createPbsPairingSearchService({
    pgPool,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  await service.matchFeedbackPairings(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    resolvedContext: {
      period: {
        rosterPeriodId: 6,
        rosterPeriodKey: "2026RP06",
        periodCode: "Jun 2026",
        rpStartLocal: "2026-06-01",
        rpEndLocal: "2026-06-30",
      },
      actor: {
        base: ACTOR_BASE,
        rank: "CA",
        zoneId: "America/Toronto",
      },
    },
    properties: [{
      key: "current:length",
      property: {
        propertyGroupKey: "length",
        rowSeq: 1,
        propertyCode: 131,
        name: "Pairing Length",
        action: "award",
        bid: { type: "stepper", value: 1 },
        tiers: ["T1"],
      },
    }],
  } as never);

  assert.equal(queries.filter((query) => /from f8\.roster_period/i.test(query.text)).length, 0);
  assert.equal(queries.filter((query) => /from actor_identity actor/i.test(query.text)).length, 0);
  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /candidate_pairings as materialized/i);
});

test("pairing search actor base resolver uses live crew_base", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      return {
        rows: [{ base: " yyz " }],
      };
    },
  } as unknown as Pool;

  const base = await resolvePairingSearchActorBase({
    pgPool,
    schema: "f8",
    pbsSchema: "f8_pbs",
    actor,
  });

  assert.equal(base, ACTOR_BASE);
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0]!.text, /f8_pbs\.pbs_user/i);
  assert.match(queries[0]!.text, /from f8\.crew_base crew_base/i);
  assert.match(queries[0]!.text, /order by crew_base\.is_prime_base desc, crew_base\.eff_dt desc, crew_base\.id desc/i);
  assert.deepEqual(queries[0]!.values, [actor.crewId]);
});

test("pairing search actor base resolver rejects missing actor base", async () => {
  const pgPool = {
    async query() {
      return {
        rows: [{ base: null }],
      };
    },
  } as unknown as Pool;

  await assert.rejects(
    () => resolvePairingSearchActorBase({
      pgPool,
      schema: "f8",
      pbsSchema: "f8_pbs",
      actor,
    }),
    (error) => error instanceof Error && error.message === PAIRING_SEARCH_ACTOR_BASE_REQUIRED_MESSAGE,
  );
});

test("single-property preview actor context requires live crew_rank and a zoned crew base overlapping the bid period", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      return {
        rows: [{
          rank: " ca ",
          has_usable_base: true,
          zone_id: "America/Toronto",
          bases: ["YYZ", "YUL", "YYZ"],
        }],
      };
    },
  } as unknown as Pool;

  const context = await resolveSinglePropertyPreviewActorContext({
    pgPool,
    schema: "f8",
    pbsSchema: "f8_pbs",
    actor,
    periodStartDate: "2026-04-01",
    periodEndDate: "2026-04-30",
  });

  assert.deepEqual(context, {
    rank: "CA",
    zoneId: "America/Toronto",
    bases: ["YUL", "YYZ"],
  });
  assert.doesNotMatch(queries[0]!.text, /f8_pbs\.pbs_user/i);
  assert.match(queries[0]!.text, /from f8\.crew_rank crew_rank/i);
  assert.match(queries[0]!.text, /nullif\(btrim\(cr\.rank\), ''\) as rank/i);
  assert.match(queries[0]!.text, /join pg_timezone_names crew_base_tz/i);
  assert.match(queries[0]!.text, /crew_base\.eff_dt < \(\(\$3::date \+ 1\)::timestamp at time zone crew_base_tz\.name\)/i);
  assert.match(queries[0]!.text, /crew_base\.exp_dt >= \(\$2::date::timestamp at time zone crew_base_tz\.name\)/i);
  assert.deepEqual(queries[0]!.values, [actor.crewId, "2026-04-01", "2026-04-30"]);
});

test("single-property preview actor context rejects missing live crew_rank", async () => {
  const pgPool = {
    async query() {
      return { rows: [{ rank: null, has_usable_base: true }] };
    },
  } as unknown as Pool;

  await assert.rejects(
    () => resolveSinglePropertyPreviewActorContext({
      pgPool,
      schema: "f8",
      pbsSchema: "f8_pbs",
      actor,
      periodStartDate: "2026-04-01",
      periodEndDate: "2026-04-30",
    }),
    (error) => error instanceof Error && error.message === PAIRING_SEARCH_ACTOR_RANK_REQUIRED_MESSAGE,
  );
});

test("single-property preview actor context rejects a period with no usable zoned crew base", async () => {
  const pgPool = {
    async query() {
      return { rows: [{ rank: "CA", has_usable_base: false }] };
    },
  } as unknown as Pool;

  await assert.rejects(
    () => resolveSinglePropertyPreviewActorContext({
      pgPool,
      schema: "f8",
      pbsSchema: "f8_pbs",
      actor,
      periodStartDate: "2026-04-01",
      periodEndDate: "2026-04-30",
    }),
    (error) => error instanceof Error && error.message === PAIRING_SEARCH_EFFECTIVE_BASE_REQUIRED_MESSAGE,
  );
});

test("single-property preview requires an explicit bid period before querying actor context", async () => {
  let queryCount = 0;
  const pgPool = {
    async query() {
      queryCount += 1;
      return { rows: [] };
    },
  } as unknown as Pool;
  const service = createService(pgPool);

  await assert.rejects(
    () => service.previewPairings(actor, {
      preview: {
        property: {
          propertyCode: 102,
          name: "Pairing Preference",
          action: "award",
          quantifier: null,
          bid: { type: "pairing-preference", pairingIds: ["11"] },
        },
        page: 1,
        pageSize: 30,
      },
    } as never),
    (error) => error instanceof Error
      && error.message === "A valid roster period is required for Pairing Search.",
  );
  assert.equal(queryCount, 0);
});

test("pairing search preview caches identical requests and actor context", async () => {
  const { redis, cache } = createPairingSearchCache();
  let actorLookupCount = 0;
  let previewQueryCount = 0;
  const pgPool = {
    async query(query: string | { text: string }) {
      const text = typeof query === "string" ? query : query.text;

      if (isActorBaseLookupQuery(text)) {
        actorLookupCount += 1;
        return {
          rows: [{ base: ACTOR_BASE, rank: "CA" }],
        };
      }

      previewQueryCount += 1;
      return {
        rows: [EMPTY_PREVIEW_ROW],
      };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings" as const,
      page: 1,
      pageSize: 30,
    },
  };

  await service.previewPairings(actor, request);
  await service.previewPairings(actor, request);
  await service.previewPairings(actor, {
    ...request,
    preview: {
      ...request.preview,
      page: 2,
    },
  });

  assert.equal(actorLookupCount, 1);
  assert.equal(previewQueryCount, 2);
  const cacheKeys = Array.from(redis.store.keys()).join("\n");
  assert.match(cacheKeys, /pbs:f8_pbs:pairing-search:actor-context:v3:f8:/);
  assert.match(cacheKeys, /pbs:f8_pbs:pairing-search:preview:v3:f8:YYZ:CA:/);
  assert.doesNotMatch(cacheKeys, /F8030|casey\.crew/);
});

test("single-property preview uses the v4 crew-scoped cache contract", async () => {
  const { redis, cache } = createPairingSearchCache();
  let actorContextLookupCount = 0;
  let previewQueryCount = 0;
  const pgPool = {
    async query(text: string) {
      if (isSinglePropertyActorContextLookupQuery(text)) {
        actorContextLookupCount += 1;
        return { rows: [{ rank: "CA", has_usable_base: true }] };
      }

      previewQueryCount += 1;
      return { rows: [EMPTY_PREVIEW_ROW] };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      property: {
        propertyCode: 102,
        name: "Pairing Preference",
        action: "award" as const,
        quantifier: null,
        bid: { type: "pairing-preference" as const, pairingIds: ["11"] },
      },
      page: 1,
      pageSize: 30,
    },
  };

  await service.previewPairings(actor, request);
  await service.previewPairings(actor, request);

  assert.equal(actorContextLookupCount, 2);
  assert.equal(previewQueryCount, 1);
  const cacheKeys = Array.from(redis.store.keys()).join("\n");
  assert.match(cacheKeys, /pbs:f8_pbs:pairing-search:preview-single-property:v4:f8:F8030:CA:/);
  assert.doesNotMatch(cacheKeys, /casey\.crew/);
});

test("Efficient Flying preview caches dictionary config before the final result cache lookup", async () => {
  const { redis, cache } = createPairingSearchCache();
  let configQueryCount = 0;
  let previewQueryCount = 0;
  const pgPool = {
    async query(text: string) {
      if (isActorBaseLookupQuery(text)) {
        return { rows: [{ base: ACTOR_BASE, rank: "CA" }] };
      }

      if (/from f8\.dictionary/i.test(text)) {
        configQueryCount += 1;
        return { rows: [{ code_value: "20" }] };
      }

      previewQueryCount += 1;
      return { rows: [EMPTY_PREVIEW_ROW] };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 7,
    periodCode: "Jul 2026",
    preview: {
      mode: "criteria" as const,
      properties: [{
        rowSeq: 1,
        propertyCode: 428,
        name: "Efficient Flying First",
        action: "award" as const,
        quantifier: null,
        tiers: ["T1"],
        bid: {
          type: "efficient-flying-preference" as const,
          mode: "efficient" as const,
        },
      }],
      page: 1,
      pageSize: 30,
    },
  };

  await service.previewPairings(actor, request);
  await service.previewPairings(actor, request);

  assert.equal(configQueryCount, 1);
  assert.equal(previewQueryCount, 1);
  const cacheKeys = Array.from(redis.store.keys()).join("\n");
  assert.match(cacheKeys, /pairing-search:efficient-flying-config:v1:f8/);
  assert.match(cacheKeys, /pairing-search:preview:v3:f8:YYZ:CA/);
});

test("Redeye preview cache changes when the dictionary definition version changes", async () => {
  const { redis, cache } = createPairingSearchCache();
  let configQueryCount = 0;
  let previewQueryCount = 0;
  const pgPool = {
    async query(query: string | { text: string }) {
      const text = typeof query === "string" ? query : query.text;

      if (isActorBaseLookupQuery(text)) {
        return { rows: [{ base: ACTOR_BASE, rank: "CA" }] };
      }

      if (/dictionary/i.test(text)) {
        configQueryCount += 1;
        const startTime = configQueryCount === 1 ? "23:00" : "22:00";
        return {
          rows: [
            ["PBS_PAIRING_REDEYE_CONFIG", "START_TIME", startTime],
            ["PBS_PAIRING_REDEYE_CONFIG", "END_TIME", "05:00"],
          ],
        };
      }

      previewQueryCount += 1;
      return { rows: [EMPTY_PREVIEW_ROW] };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 7,
    periodCode: "Jul 2026",
    preview: {
      mode: "criteria" as const,
      properties: [{
        rowSeq: 1,
        propertyCode: 117,
        name: "Redeye Preference",
        action: "award" as const,
        quantifier: null,
        tiers: ["T1"],
        bid: { type: "redeye-preference" as const, dateScope: null },
      }],
      page: 1,
      pageSize: 30,
    },
  };

  await service.previewPairings(actor, request);
  await service.previewPairings(actor, request);

  assert.equal(configQueryCount, 2);
  assert.equal(previewQueryCount, 2);
  assert.equal(
    Array.from(redis.store.keys()).filter((key) => key.includes("pairing-search:preview:v3")).length,
    2,
  );
});

test("pairing search preview stampede protection collapses concurrent identical requests", async () => {
  const { cache } = createPairingSearchCache();
  let actorLookupCount = 0;
  let previewQueryCount = 0;
  const pgPool = {
    async query(text: string) {
      if (isActorBaseLookupQuery(text)) {
        actorLookupCount += 1;
        await delay(10);
        return {
          rows: [{ base: ACTOR_BASE, rank: "CA" }],
        };
      }

      previewQueryCount += 1;
      await delay(10);
      return {
        rows: [EMPTY_PREVIEW_ROW],
      };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings" as const,
      page: 1,
      pageSize: 30,
    },
  };

  const results = await Promise.all(Array.from({ length: 20 }, () => service.previewPairings(actor, request)));

  assert.equal(actorLookupCount, 1);
  assert.equal(previewQueryCount, 1);
  assert.equal(results.every((result) => result.summary.totalItems === 0), true);
});

test("pairing search preview cache is scoped by actor base and rank", async () => {
  const { cache } = createPairingSearchCache();
  let actorLookupCount = 0;
  let previewQueryCount = 0;
  const secondActor = {
    crewId: "F8031",
    userCode: "second.crew",
  };
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      if (isActorBaseLookupQuery(text)) {
        actorLookupCount += 1;
        const crewId = values?.[0];

        return {
          rows: [
            crewId === secondActor.crewId
              ? { base: "YYC", rank: "FO" }
              : { base: ACTOR_BASE, rank: "CA" },
          ],
        };
      }

      previewQueryCount += 1;
      return {
        rows: [EMPTY_PREVIEW_ROW],
      };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings" as const,
      page: 1,
      pageSize: 30,
    },
  };

  await service.previewPairings(actor, request);
  await service.previewPairings(actor, request);
  await service.previewPairings(secondActor, request);

  assert.equal(actorLookupCount, 2);
  assert.equal(previewQueryCount, 2);
});

test("current pairing rule counts and tier pools cache final JSON responses", async () => {
  const { cache } = createPairingSearchCache();
  let countQueryCount = 0;
  const pgPool = createPairingSearchPgPool(async (_text: string, values?: unknown[]) => {
    countQueryCount += 1;
    const countKeys = (values ?? []).filter(
      (value): value is string => typeof value === "string" && (
        value === "package" || /^(rule|funnel|tx|total|by):/.test(value)
      ),
    );

    return {
      rows: countKeys.map((key, index) => ({
        count_key: key,
        total_items: String(100 - index),
        pairing_id_count: String(50 - index),
      })),
    };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool, cache);
  const properties = [
    {
      propertyGroupKey: "property-1",
      rowSeq: 1,
      propertyCode: 131,
      name: "Prefer Pairing Length",
      action: "award" as const,
      quantifier: null,
      bid: { type: "stepper" as const, value: 3, min: 1, max: 7 },
      tiers: ["T1"],
    },
  ];
  const countsRequest = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tier: "T1",
    properties,
  };
  const tierPoolsRequest = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tiers: ["T1"],
    properties,
  };

  const firstCounts = await service.countCurrentRules(actor, countsRequest);
  const secondCounts = await service.countCurrentRules(actor, countsRequest);
  const firstTierPools = await service.countCurrentRuleTierPools(actor, tierPoolsRequest);
  const secondTierPools = await service.countCurrentRuleTierPools(actor, tierPoolsRequest);

  assert.equal(countQueryCount, 2);
  assert.deepEqual(secondCounts, firstCounts);
  assert.deepEqual(secondTierPools, firstTierPools);
  assert.equal(secondCounts.rows[0]?.rule.totalItems, 100);
  assert.equal(secondTierPools.packageTotal.totalItems, 100);
});

test("current pairing rule counts stampede protection collapses concurrent identical requests", async () => {
  const { cache } = createPairingSearchCache();
  let countQueryCount = 0;
  const pgPool = createPairingSearchPgPool(async (_text: string, values?: unknown[]) => {
    countQueryCount += 1;
    await delay(10);
    const countKeys = (values ?? []).filter(
      (value): value is string => typeof value === "string" && /^(rule|funnel):/.test(value),
    );

    return {
      rows: countKeys.map((key, index) => ({
        count_key: key,
        total_items: String(100 - index),
        pairing_id_count: String(50 - index),
      })),
    };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tier: "T1",
    properties: [
      {
        propertyGroupKey: "property-1",
        rowSeq: 1,
        propertyCode: 131,
        name: "Prefer Pairing Length",
        action: "award" as const,
        quantifier: null,
        bid: { type: "stepper" as const, value: 3, min: 1, max: 7 },
        tiers: ["T1"],
      },
    ],
  };

  const results = await Promise.all(Array.from({ length: 20 }, () => service.countCurrentRules(actor, request)));

  assert.equal(countQueryCount, 1);
  assert.equal(results.every((result) => result.summary.activePropertyCount === 1), true);
});

test("current pairing rule tier pools stampede protection collapses concurrent identical requests", async () => {
  const { cache } = createPairingSearchCache();
  let countQueryCount = 0;
  const pgPool = createPairingSearchPgPool(async (_text: string, values?: unknown[]) => {
    countQueryCount += 1;
    await delay(10);
    const countKeys = (values ?? []).filter(
      (value): value is string => typeof value === "string" && (
        value === "package" || /^(tx|total|by):/.test(value)
      ),
    );

    return {
      rows: countKeys.map((key, index) => ({
        count_key: key,
        total_items: String(100 - index),
        pairing_id_count: String(50 - index),
      })),
    };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tiers: ["T1"],
    properties: [
      {
        propertyGroupKey: "property-1",
        rowSeq: 1,
        propertyCode: 131,
        name: "Prefer Pairing Length",
        action: "award" as const,
        quantifier: null,
        bid: { type: "stepper" as const, value: 3, min: 1, max: 7 },
        tiers: ["T1"],
      },
    ],
  };

  const results = await Promise.all(Array.from({ length: 20 }, () => service.countCurrentRuleTierPools(actor, request)));

  assert.equal(countQueryCount, 1);
  assert.equal(results.every((result) => result.packageTotal.totalItems === 100), true);
});

test("pairing airport options cache identical base and period lookups", async () => {
  const { cache } = createPairingSearchCache();
  let airportQueryCount = 0;
  const pgPool = createPairingSearchPgPool(async (text: string) => {
    if (/from f8\.dictionary/i.test(text)) {
      return {
        rows: [{ code_value: '{"min":13,"max":18,"step":1,"default":13}' }],
      };
    }

    airportQueryCount += 1;

    return {
      rows: [
        {
          role: "landing",
          airport: "YVR",
          airport_preference_landing: true,
          airport_name: "Vancouver",
          city: "YVR",
        },
        { role: "layover", airport: "YUL", airport_name: "Montréal", city: "YMQ" },
        { role: "work_start", airport: "YYZ" },
        { role: "filter", airport: "YEG" },
      ],
    };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool, cache);
  const request = { rosterPeriodId: 6, periodCode: "Jun 2026" };

  assert.deepEqual(await service.getAirportOptions(actor, request), {
    airportPreferenceLayoverHours: DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS,
    airportPreferenceOptions: [
      { code: "YUL", kind: "airport", label: "YUL · Montréal", events: ["layover"] },
      { code: "YVR", kind: "airport", label: "YVR · Vancouver", events: ["landing"] },
      { code: "YMQ", kind: "city", label: "YMQ", events: ["layover"] },
      { code: "YVR", kind: "city", label: "YVR", events: ["landing"] },
    ],
    filterAirports: ["YEG"],
    landingAirports: ["YVR"],
    layoverAirports: ["YUL"],
    workStartStations: ["YYZ"],
  });
  assert.deepEqual(await service.getAirportOptions(actor, request), {
    airportPreferenceLayoverHours: DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS,
    airportPreferenceOptions: [
      { code: "YUL", kind: "airport", label: "YUL · Montréal", events: ["layover"] },
      { code: "YVR", kind: "airport", label: "YVR · Vancouver", events: ["landing"] },
      { code: "YMQ", kind: "city", label: "YMQ", events: ["layover"] },
      { code: "YVR", kind: "city", label: "YVR", events: ["landing"] },
    ],
    filterAirports: ["YEG"],
    landingAirports: ["YVR"],
    layoverAirports: ["YUL"],
    workStartStations: ["YYZ"],
  });
  assert.equal(airportQueryCount, 1);
});

test("pairing airport options stampede protection collapses concurrent identical requests", async () => {
  const { cache } = createPairingSearchCache();
  let airportQueryCount = 0;
  const pgPool = createPairingSearchPgPool(async (text: string) => {
    if (/from f8\.dictionary/i.test(text)) {
      return { rows: [] };
    }

    airportQueryCount += 1;
    await delay(10);

    return {
      rows: [
        { role: "landing", airport: "YVR" },
        { role: "layover", airport: "YUL" },
        { role: "work_start", airport: "YYZ" },
        { role: "filter", airport: "YEG" },
      ],
    };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool, cache);
  const request = { rosterPeriodId: 6, periodCode: "Jun 2026" };

  const results = await Promise.all(Array.from({ length: 20 }, () => service.getAirportOptions(actor, request)));

  assert.equal(airportQueryCount, 1);
  assert.equal(results.every((result) => result.landingAirports[0] === "YVR"), true);
});

test("pairing airport preference options exclude final landing while generic landing airports stay unchanged", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });

    if (/from f8\.dictionary/i.test(text)) {
      return { rows: [] };
    }

    return {
      rows: [
        {
          role: "landing",
          airport: "YVR",
          airport_preference_landing: false,
          airport_name: "Vancouver",
          city: "YVR",
        },
        {
          role: "landing",
          airport: "YYC",
          airport_preference_landing: true,
          airport_name: "Calgary",
          city: "YYC",
        },
        {
          role: "layover",
          airport: "YVR",
          airport_preference_landing: false,
          airport_name: "Vancouver",
          city: "YVR",
        },
      ],
    };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const result = await service.getAirportOptions(actor, { rosterPeriodId: 6, periodCode: "Jun 2026" });
  const airportQuery = queries.find((query) => /with\s+actor_zone as/i.test(query.text));

  assert.ok(airportQuery);
  assert.match(airportQuery.text, /bool_or\(exists \(/i);
  assert.match(airportQuery.text, /later_s\.pairing_id = s\.pairing_id/i);
  assert.match(airportQuery.text, /later_s\.is_deleted = 0/i);
  assert.match(airportQuery.text, /later_s\.duty_seq > s\.duty_seq/i);
  assert.deepEqual(result.landingAirports, ["YVR", "YYC"]);
  assert.deepEqual(result.airportPreferenceOptions, [
    { code: "YVR", kind: "airport", label: "YVR · Vancouver", events: ["layover"] },
    { code: "YYC", kind: "airport", label: "YYC · Calgary", events: ["landing"] },
    { code: "YVR", kind: "city", label: "YVR", events: ["layover"] },
    { code: "YYC", kind: "city", label: "YYC", events: ["landing"] },
  ]);
});

test("pairing search cache falls back to DB when Redis get or set fails", async () => {
  const redis = createFakeRedis();
  redis.failGet = true;
  redis.failSet = true;
  const { cache } = createPairingSearchCache(redis);
  let actorLookupCount = 0;
  let previewQueryCount = 0;
  const pgPool = {
    async query(text: string) {
      if (isActorBaseLookupQuery(text)) {
        actorLookupCount += 1;
        return {
          rows: [{ base: ACTOR_BASE, rank: "CA" }],
        };
      }

      previewQueryCount += 1;
      return {
        rows: [EMPTY_PREVIEW_ROW],
      };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings" as const,
      page: 1,
      pageSize: 30,
    },
  };

  await service.previewPairings(actor, request);
  await service.previewPairings(actor, request);

  assert.equal(actorLookupCount, 2);
  assert.equal(previewQueryCount, 2);
});

test("pairing search preview fetches summary and page rows in one query before loading segments", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      if (queries.length === 1) {
        return {
          rows: [
            {
              total_items: "2",
              pairing_id_count: "2",
              id: "11",
              pairing_label: "M4959",
              base: "YYZ",
              base_zone_id: "UTC",
              pairing_start_utc: "2026-04-04T00:30:00.000Z",
              composition_label: "CA(1)FO(1)",
              division: "AA",
              duration_days: 3,
              duty_count: 2,
              fleet: "320",
              active_start_date: "2026-04-03",
              report_start_utc: "2026-04-03T06:30:00.000Z",
              release_end_utc: "2026-04-05T15:30:00.000Z",
            },
          ],
        };
      }

      if (queries.length === 2) {
        return {
          rows: [
            {
              pairing_id: "11",
              duty_seq: 1,
              seg_seq: 1,
              flt_num: "1993",
              airline: "AA",
              dep_arp: "CLT",
              arv_arp: "LAX",
              duty_start_utc: "2026-04-03T06:30:00.000Z",
              duty_end_utc: "2026-04-03T10:20:00.000Z",
              duty_assignment: "FLT",
              duty_acc_state: "D",
              duty_ref_tz: -240,
              duty_etr_tz: null,
              duty_layover_nits: 1,
              duty_sch_dp_min: "570",
              duty_act_dp_min: "580",
              duty_sch_rest_min: "600",
              duty_act_rest_min: "600",
              pickup_start_utc: "2026-04-03T06:00:00.000Z",
              pickup_end_utc: "2026-04-03T06:15:00.000Z",
              brief_start_utc: "2026-04-03T06:30:00.000Z",
              brief_end_utc: "2026-04-03T07:00:00.000Z",
              debrief_start_utc: null,
              debrief_end_utc: null,
              dropoff_start_utc: null,
              dropoff_end_utc: null,
              sch_str_dt_utc: "2026-04-03T07:30:00.000Z",
              sch_end_dt_utc: "2026-04-03T10:20:00.000Z",
              act_str_dt_utc: "2026-04-03T07:35:00.000Z",
              act_end_dt_utc: "2026-04-03T10:25:00.000Z",
              fleet_seg: "320",
              seg_assignment: "FLY",
              duty_sch_fdp_min: "510",
              duty_act_fdp_min: "520",
              duty_sch_flt_min: "350",
              duty_act_flt_min: "360",
              duty_sch_duty_min: "570",
              duty_act_duty_min: "580",
              duty_sch_credited_minutes: "450",
              duty_act_credited_minutes: "77",
              act_credited_minutes_seg: "77",
            },
            {
              pairing_id: "11",
              duty_seq: 1,
              seg_seq: 2,
              flt_num: "2001",
              airline: "AA",
              dep_arp: "LAX",
              arv_arp: "YYZ",
              duty_start_utc: "2026-04-03T06:30:00.000Z",
              duty_end_utc: "2026-04-03T14:00:00.000Z",
              duty_assignment: "FLT",
              duty_acc_state: "D",
              duty_ref_tz: -240,
              duty_etr_tz: null,
              duty_layover_nits: 1,
              duty_sch_dp_min: "570",
              duty_act_dp_min: "580",
              duty_sch_rest_min: "600",
              duty_act_rest_min: "600",
              pickup_start_utc: null,
              pickup_end_utc: null,
              brief_start_utc: null,
              brief_end_utc: null,
              debrief_start_utc: "2026-04-03T14:10:00.000Z",
              debrief_end_utc: "2026-04-03T14:20:00.000Z",
              dropoff_start_utc: "2026-04-03T14:25:00.000Z",
              dropoff_end_utc: "2026-04-03T14:40:00.000Z",
              sch_str_dt_utc: "2026-04-03T11:30:00.000Z",
              sch_end_dt_utc: "2026-04-03T14:00:00.000Z",
              act_str_dt_utc: "2026-04-03T11:35:00.000Z",
              act_end_dt_utc: "2026-04-03T14:05:00.000Z",
              fleet_seg: "320",
              seg_assignment: "FLY",
              duty_sch_fdp_min: "510",
              duty_act_fdp_min: "520",
              duty_sch_flt_min: "350",
              duty_act_flt_min: "360",
              duty_sch_duty_min: "570",
              duty_act_duty_min: "580",
              duty_sch_credited_minutes: "450",
              duty_act_credited_minutes: "77",
              act_credited_minutes_seg: "77",
            },
          ],
        };
      }

      throw new Error("Unexpected pairing search query");
  });
  const service = createService(pgPool);

  const result = await service.previewPairings(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      property: {
        propertyCode: 102,
        name: "Pairing Preference",
        action: "award",
        quantifier: null,
        bid: { type: "pairing-preference", pairingIds: ["11"] },
      },
      page: 1,
      pageSize: 30,
    },
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]!.text, /with filtered_pairings as/i);
  assert.match(queries[0]!.text, /left join paged_pairings on true/i);
  assert.match(queries[0]!.text, /from f8\.pairing_composition pc/i);
  assert.match(queries[0]!.text, /upper\(btrim\(p\.base\)\) = \(/i);
  assert.match(queries[0]!.text, /order by crew_base\.is_prime_base desc, crew_base\.eff_dt desc, crew_base\.id desc/i);
  assert.deepEqual(queries[0]!.values, [["11"], "CA", "2026-04-01", "2026-04-30", actor.crewId, 30, 0]);
  assert.deepEqual(queries[1]!.values, [[11]]);
  assert.equal(result.summary.totalItems, 2);
  assert.equal(result.pagination.totalPages, 1);
  assert.equal(result.results[0]?.pairingId, "11");
  assert.equal(result.results[0]?.pairingNumber, "M4959");
  assert.equal(result.results[0]?.originDate, "2026-04-03");
  assert.equal(result.results[0]?.endDate, "2026-04-03");
  assert.equal(result.results[0]?.startDateLabel, "Apr 3, 2026");
  assert.equal(result.results[0]?.endDateLabel, "Apr 3, 2026");
  assert.equal(result.results[0]?.releaseTime, "1530");
  assert.equal(result.results[0]?.durationDays, 3);
  assert.equal(result.results[0]?.routeLabel, "CLT-LAX-YYZ");
  assert.equal(result.results[0]?.compositionLabel, "CA(1)FO(1)");
  assert.equal(result.results[0]?.totalBlock, "5:20");
  assert.equal(result.results[0]?.totalCredit, "1:17");
  assert.equal(result.results[0]?.totalDp, "9:30");
  assert.equal(result.results[0]?.legs[0]?.flightNumber, "1993");
  assert.equal(result.results[0]?.legs[0]?.ganttQual, "FLY");
  assert.equal(result.results[0]?.legs[0]?.ganttAirline, "AA");
  assert.equal(result.results[0]?.legs[0]?.ganttAcc, "D");
  assert.equal(result.results[0]?.legs[0]?.ganttRef, "-240");
  assert.equal(result.results[0]?.legs[0]?.ganttPickup, "06:00");
  assert.equal(result.results[0]?.legs[0]?.ganttReport, "06:30");
  assert.equal(result.results[0]?.legs[0]?.ganttStd, "07:30");
  assert.equal(result.results[0]?.legs[0]?.ganttAtd, "07:35");
  assert.equal(result.results[0]?.legs[0]?.ganttGroundTime, "1:10");
  assert.equal(result.results[0]?.legs[0]?.ganttBlockHour, "2:50");
  assert.equal(result.results[0]?.legs[0]?.ganttFlightTime, "2:50");
  assert.equal(result.results[0]?.legs[0]?.ganttDuty, "");
  assert.equal(result.results[0]?.legs[1]?.ganttDropoff, "14:40");
  assert.equal(result.results[0]?.legs[1]?.ganttMinimumRest, "10:00|10:00");
  assert.equal(result.results[0]?.legs[1]?.ganttDuty, "LO 1 · FDP 8:30 · DP 9:30");
  assert.equal(result.results[0]?.legs[0]?.dutyDate, "0403");
  assert.equal(result.results[0]?.legs[0]?.dutyFdp, "0830");
  assert.equal(result.results[0]?.legs[0]?.dutyFlyingHour, "0550");
  assert.equal(result.results[0]?.legs[0]?.dutyHour, "0930");
  assert.equal(result.results[0]?.legs[0]?.dutyCredit, "0730");
  assert.equal(result.results[0]?.legs[1]?.dutyFdp, "");
  assert.equal(result.results[0]?.legs[1]?.dutyDate, "");
  assert.equal(result.results[0]?.legs[1]?.dutyCredit, "");
  assert.deepEqual(result.results[0]?.activeDates, ["2026-04-03"]);
});

test("pairing search all-pairings preview uses actor base local period visibility filters", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      if (queries.length === 1) {
        return {
          rows: [
            {
              total_items: "2",
              pairing_id_count: "2",
              id: "11",
              pairing_label: "M4959",
              base: "YYZ",
              base_zone_id: "UTC",
              division: "AA",
              duration_days: 3,
              duty_count: 2,
              fleet: "320",
              active_start_date: "2026-04-03",
              report_start_utc: "2026-04-03T06:30:00.000Z",
              release_end_utc: "2026-04-05T15:30:00.000Z",
            },
          ],
        };
      }

      if (queries.length === 2) {
        return {
          rows: [],
        };
      }

      throw new Error("Unexpected pairing search query");
  });
  const service = createService(pgPool);

  const result = await service.previewPairings(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings",
      page: 1,
      pageSize: 30,
    },
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]!.text, /with filtered_pairings as/i);
  assert.match(queries[0]!.text, /p\.base = \$3/i);
  assert.match(queries[0]!.text, /left join pg_timezone_names base_tz/i);
  assert.match(queries[0]!.text, /min\(coalesce\(period_segment\.duty_sch_str_dt_utc, period_segment\.brief_start_utc, period_segment\.sch_str_dt_utc\)\)/i);
  assert.match(queries[0]!.text, /at time zone 'UTC'\) at time zone base_tz\.name\)::date between \$1::date and \$2::date/i);
  assert.match(queries[0]!.text, /and true/i);
  assert.match(queries[0]!.text, /upper\(btrim\(p\.assignment_group\)\) = 'FLY'/i);
  assert.match(queries[0]!.text, /from f8\.pairing_segment eligibility_segment/i);
  assert.match(queries[0]!.text, /eligibility_segment\.is_deleted = 0/i);
  assert.deepEqual(queries[0]!.values, ["2026-04-01", "2026-04-30", ACTOR_BASE, 30, 0]);
  assert.equal(result.mode, "all_pairings_preview");
  assert.equal(result.summary.totalItems, 2);
  assert.equal(result.results[0]?.pairingNumber, "M4959");
});

test("pairing search all-pairings preview applies result filters before pagination", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      if (queries.length === 1) {
        return {
          rows: [
            {
              total_items: "1",
              pairing_id_count: "1",
              id: "11",
              pairing_label: "M4959",
              base: "YYZ",
              base_zone_id: "UTC",
              division: "AA",
              duration_days: 3,
              duty_count: 2,
              fleet: "320",
              active_start_date: "2026-04-03",
              report_start_utc: "2026-04-03T06:30:00.000Z",
              release_end_utc: "2026-04-05T15:30:00.000Z",
            },
          ],
        };
      }

      if (queries.length === 2) {
        return {
          rows: [],
        };
      }

      throw new Error("Unexpected pairing search query");
  });
  const service = createService(pgPool);

  await service.previewPairings(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings",
      page: 1,
      pageSize: 30,
      filters: {
        pairingScope: "fly",
        pairingNumber: "m49",
        query: "ca yvr-yyz",
        originDateFrom: "2026-04-03",
        originDateTo: "2026-04-05",
        airport: "yvr",
        timeFrom: "06:00",
        timeTo: "12:00",
        releaseTimeFrom: "14:00",
        releaseTimeTo: "22:00",
        durationDaysMin: 2,
        durationDaysMax: 4,
        creditMinutesMin: 300,
        creditMinutesMax: 720,
      },
    },
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]!.text, /upper\(btrim\(p\.assignment_group\)\) = 'FLY'/i);
  assert.match(queries[0]!.text, /upper\(\s*coalesce/i);
  assert.match(queries[0]!.text, /like \$3 escape/i);
  assert.match(queries[0]!.text, /local_origin_date/i);
  assert.match(queries[0]!.text, />= \$4::date/i);
  assert.match(queries[0]!.text, /<= \$5::date/i);
  assert.match(queries[0]!.text, /from f8\.pairing_segment filter_segment/i);
  assert.match(queries[0]!.text, /upper\(filter_segment\.arv_arp\) in \(\$6\)/i);
  assert.match(queries[0]!.text, /min\(report_segment\.brief_start_utc\)/i);
  assert.match(queries[0]!.text, />= \$7::time/i);
  assert.match(queries[0]!.text, /<= \$8::time/i);
  assert.match(queries[0]!.text, /p\.duration_days >= \$11::integer/i);
  assert.match(queries[0]!.text, /p\.duration_days <= \$12::integer/i);
  assert.match(queries[0]!.text, /duty_act_credited_minutes/i);
  assert.match(queries[0]!.text, /upper\(query_composition\.acting_rank\) = \$17/i);
  assert.match(queries[0]!.text, /route_from_segment/i);
  assert.match(queries[0]!.text, /p\.base = \$20/i);
  assert.deepEqual(queries[0]!.values, [
    "2026-04-01",
    "2026-04-30",
    "%M49%",
    "2026-04-03",
    "2026-04-05",
    "YVR",
    "06:00",
    "12:00",
    "14:00",
    "22:00",
    2,
    4,
    300,
    720,
    "%CA%",
    "CA",
    "CA",
    "YVR",
    "YYZ",
    ACTOR_BASE,
    30,
    0,
  ]);
});

test("pairing search all-pairings preview applies layover and deadhead result filters", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });
    return { rows: [EMPTY_PREVIEW_ROW] };
  });
  const service = createService(pgPool);

  await service.previewPairings(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings",
      filters: {
        layoverAirports: [" yhz ", "YHZ", "YYC"],
        layoverCountMin: 1,
        layoverCountMax: 2,
        hasDeadhead: true,
      },
    },
  });

  assert.equal(queries.length, 1);
  const normalizedSql = queries[0]!.text.replace(/\s+/g, " ");
  assert.match(normalizedSql, /from f8\.pairing_segment layover_airport_segment/i);
  assert.match(normalizedSql, /layover_airport_segment\.duty_layover_nits > 0/i);
  assert.match(normalizedSql, /upper\(layover_airport_segment\.duty_end_arp\) in \(\$3, \$4\)/i);
  assert.match(normalizedSql, /count\(distinct layover_segment\.duty_seq\)/i);
  assert.match(normalizedSql, />= \$5::integer/i);
  assert.match(normalizedSql, /<= \$6::integer/i);
  assert.match(normalizedSql, /from f8\.pairing_segment deadhead_segment/i);
  assert.match(normalizedSql, /upper\(btrim\(coalesce\(deadhead_segment\.seg_assignment, ''\)\)\) = 'DHD'/i);
  assert.deepEqual(queries[0]!.values, [
    "2026-04-01",
    "2026-04-30",
    "YHZ",
    "YYC",
    1,
    2,
    ACTOR_BASE,
    30,
    0,
  ]);
});

test("pairing search all-pairings Redeye filter uses dictionary config and the shared window SQL", async () => {
  const { redis, cache } = createPairingSearchCache();
  let configQueryCount = 0;
  let previewQueryCount = 0;
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = {
    async query(query: string | { text: string; values?: unknown[] }, values?: unknown[]) {
      const text = typeof query === "string" ? query : query.text;
      const queryValues = typeof query === "string" ? values : query.values;

      if (/from f8\.roster_period/i.test(text)) {
        return {
          rows: [{
            roster_period_id: "4",
            roster_period_key: "2026RP04",
            period_code: "Apr 2026",
            rp_start_local: "2026-04-01",
            rp_end_local: "2026-04-30",
          }],
        };
      }

      if (isActorBaseLookupQuery(text)) {
        return {
          rows: [{ base: ACTOR_BASE, rank: "CA", zone_id: "America/Toronto" }],
        };
      }

      if (/dictionary/i.test(text)) {
        configQueryCount += 1;
        return {
          rows: [
            ["PBS_PAIRING_REDEYE_CONFIG", "START_TIME", "23:00"],
            ["PBS_PAIRING_REDEYE_CONFIG", "END_TIME", "05:00"],
          ],
        };
      }

      previewQueryCount += 1;
      queries.push({ text, values: queryValues });
      return { rows: [EMPTY_PREVIEW_ROW] };
    },
  } as unknown as Pool;
  const service = createService(pgPool, cache);
  const request = {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings" as const,
      filters: { hasRedeye: true as const },
      page: 1,
      pageSize: 30,
    },
  };

  await service.previewPairings(actor, request);
  await service.previewPairings(actor, request);

  assert.equal(configQueryCount, 2);
  assert.equal(previewQueryCount, 1);
  assert.equal(queries.length, 1);
  const normalizedSql = queries[0]!.text.replace(/\s+/g, " ");
  assert.match(normalizedSql, /redeye_windows\.redeye_date \+ \$4::time/i);
  assert.match(normalizedSql, /redeye_windows\.redeye_date \+ \$5::time\) \+ interval '1 day'/i);
  assert.deepEqual(queries[0]!.values, [
    "CA",
    "2026-04-01",
    "2026-04-30",
    "23:00",
    "05:00",
    ACTOR_BASE,
    30,
    0,
  ]);
  assert.equal(
    Array.from(redis.store.keys()).filter((key) => key.includes("pairing-search:preview:v3")).length,
    1,
  );
});

test("pairing search all-pairings preview wraps an overnight report-time window before other filters", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });
    return { rows: [EMPTY_PREVIEW_ROW] };
  });
  const service = createService(pgPool);

  await service.previewPairings(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings",
      filters: {
        originDateFrom: "2026-04-03",
        originDateTo: "2026-04-05",
        airports: ["YVR"],
        timeFrom: "15:53",
        timeTo: "08:59",
      },
    },
  });

  assert.equal(queries.length, 1);
  const normalizedSql = queries[0]!.text.replace(/\s+/g, " ");
  assert.match(normalizedSql, /and \( .* >= \$6::time or .* <= \$7::time \) and true/i);
  assert.deepEqual(queries[0]!.values, [
    "2026-04-01",
    "2026-04-30",
    "2026-04-03",
    "2026-04-05",
    "YVR",
    "15:53",
    "08:59",
    ACTOR_BASE,
    30,
    0,
  ]);
});

test("pairing search all-pairings preview preserves report-time single boundaries and equal times", async () => {
  const cases = [
    {
      filters: { timeFrom: "15:53" },
      expected: />= \$3::time/i,
      unexpected: /<= \$4::time/i,
      values: ["15:53"],
    },
    {
      filters: { timeTo: "08:59" },
      expected: /<= \$3::time/i,
      unexpected: />= \$4::time/i,
      values: ["08:59"],
    },
    {
      filters: { timeFrom: "08:59", timeTo: "08:59" },
      expected: />= \$3::time.*<= \$4::time/is,
      unexpected: /\bor\b.*<= \$4::time/is,
      values: ["08:59", "08:59"],
    },
  ];

  for (const testCase of cases) {
    const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
    const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return { rows: [EMPTY_PREVIEW_ROW] };
    });
    const service = createService(pgPool);

    await service.previewPairings(actor, {
      rosterPeriodId: 4,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: testCase.filters,
      },
    });

    assert.match(queries[0]!.text, testCase.expected);
    assert.doesNotMatch(queries[0]!.text, testCase.unexpected);
    assert.deepEqual(queries[0]!.values, [
      "2026-04-01",
      "2026-04-30",
      ...testCase.values,
      ACTOR_BASE,
      30,
      0,
    ]);
  }
});

test("pairing search multi-select filters are deduplicated, exact, and take priority over legacy values", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });

    return queries.length === 1
      ? { rows: [EMPTY_PREVIEW_ROW] }
      : { rows: [] };
  });
  const service = createService(pgPool);

  await service.previewPairings(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      mode: "all_pairings",
      filters: {
        pairingNumber: "LEGACY",
        pairingNumbers: [" M4959 ", "m4959", "V4146"],
        airport: "LAX",
        airports: [" yvr ", "YVR", "YYC"],
      },
    },
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /when upper\(coalesce\(p\.interface_id, ''\)\)/i);
  assert.match(queries[0]!.text, /nullif\(trim\(p\.pairing_label\), ''\)/i);
  assert.doesNotMatch(queries[0]!.text, /p\.id::text\s*\)\s*in/i);
  assert.match(queries[0]!.text, /in \(\$3, \$4\)/i);
  assert.match(queries[0]!.text, /upper\(filter_segment\.dep_arp\) in \(\$5, \$6\)/i);
  assert.match(queries[0]!.text, /upper\(filter_segment\.duty_str_arp\) in \(\$5, \$6\)/i);
  assert.doesNotMatch(queries[0]!.text, /%LEGACY%/i);
  assert.deepEqual(queries[0]!.values, [
    "2026-04-01",
    "2026-04-30",
    "M4959",
    "V4146",
    "YVR",
    "YYC",
    ACTOR_BASE,
    30,
    0,
  ]);
});

test("pairing search preview maps duty coverage dates in the pairing base timezone", async () => {
  const pgPool = createPairingSearchPgPool(async (text: string) => {
      if (/with filtered_pairings as/i.test(text)) {
        return {
          rows: [
            {
              total_items: "1",
              pairing_id_count: "1",
              id: "11",
              pairing_label: "M4959",
              base: "YYC",
              base_zone_id: "America/Edmonton",
              division: "AA",
              duration_days: 3,
              duty_count: 2,
              fleet: "320",
              active_start_date: null,
              report_start_utc: "2026-06-28 05:05:00",
              release_end_utc: "2026-07-02 10:10:00",
            },
          ],
        };
      }

      return {
        rows: [
          {
            pairing_id: "11",
            duty_seq: 1,
            seg_seq: 1,
            flt_num: "1993",
            dep_arp: "YYC",
            arv_arp: "YVR",
            duty_start_utc: "2026-06-28 05:05:00",
            duty_end_utc: "2026-06-28 09:30:00",
            sch_str_dt_utc: "2026-06-28 07:24:00",
            sch_end_dt_utc: "2026-06-28 08:30:00",
            fleet_seg: "320",
            duty_sch_fdp_min: "510",
            duty_act_fdp_min: "520",
            duty_sch_flt_min: "350",
            duty_act_flt_min: "360",
            duty_sch_duty_min: "570",
            duty_act_duty_min: "580",
            duty_sch_credited_minutes: "450",
            duty_act_credited_minutes: "77",
            act_credited_minutes_seg: "77",
          },
          {
            pairing_id: "11",
            duty_seq: 2,
            seg_seq: 1,
            flt_num: "2001",
            dep_arp: "YVR",
            arv_arp: "YYC",
            duty_start_utc: "2026-07-02 02:50:00",
            duty_end_utc: "2026-07-02 10:10:00",
            sch_str_dt_utc: "2026-07-02 04:00:00",
            sch_end_dt_utc: "2026-07-02 09:00:00",
            fleet_seg: "320",
            duty_sch_fdp_min: "440",
            duty_act_fdp_min: null,
            duty_sch_flt_min: "300",
            duty_act_flt_min: null,
            duty_sch_duty_min: "500",
            duty_act_duty_min: null,
            duty_sch_credited_minutes: "300",
            duty_act_credited_minutes: null,
            act_credited_minutes_seg: "300",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.previewPairings(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    preview: {
      property: {
        propertyCode: 102,
        name: "Pairing Preference",
        action: "award",
        quantifier: null,
        bid: { type: "pairing-preference", pairingIds: ["11"] },
      },
      page: 1,
      pageSize: 30,
    },
  });

  assert.equal(result.results[0]?.reportTime, "2305");
  assert.equal(result.results[0]?.originDate, "2026-06-27");
  assert.equal(result.results[0]?.startDateLabel, "Jun 27, 2026");
  assert.equal(result.results[0]?.totalCredit, "1:17");
  assert.equal(result.results[0]?.legs[0]?.dutyDate, "0627");
  assert.equal(result.results[0]?.legs[0]?.departureTime, "0124");
  assert.equal(result.results[0]?.legs[1]?.dutyDate, "0701");
  assert.equal(result.results[0]?.legs[1]?.arrivalTime, "0300");
  assert.deepEqual(result.results[0]?.activeDates, [
    "2026-06-27",
    "2026-06-28",
    "2026-07-01",
    "2026-07-02",
  ]);
});

test("current pairing rule counts still return row counts when tier has no active properties", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      const countKeys = (values ?? []).filter(
        (value): value is string => typeof value === "string" && /^(rule|funnel):/.test(value),
      );

      return {
        rows: countKeys.map((key) => ({
          count_key: key,
          total_items: "30",
          pairing_id_count: "20",
        })),
      };
  });
  const service = createService(pgPool);

  const result = await service.countCurrentRules(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tier: "T4",
    properties: [
      {
        propertyGroupKey: "property-1",
        rowSeq: 1,
        propertyCode: 131,
        name: "Prefer Pairing Length",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 3, min: 1, max: 7 },
        tiers: ["T1"],
      },
    ],
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /p\.base = \$\d+/i);
  assert.ok((queries[0]!.values ?? []).includes(ACTOR_BASE));
  assert.deepEqual(
    (queries[0]!.values ?? []).filter(
      (value): value is string => typeof value === "string" && /^(rule|funnel):/.test(value),
    ),
    ["rule:property-1"],
  );
  assert.equal(result.mode, "current_rules_counts");
  assert.equal(result.tier, "T4");
  assert.equal(result.periodCode, "Apr 2026");
  assert.deepEqual(result.summary, {
    activePropertyCount: 0,
    allRules: null,
  });
  assert.deepEqual(result.rows.map((row) => row.propertyGroupKey), ["property-1"]);
  assert.deepEqual(result.rows[0]?.rule, {
    pairingIdCount: 20,
    totalItems: 30,
  });
  assert.deepEqual(result.rows[0]?.funnel, {
    pairingIdCount: 0,
    totalItems: 0,
  });
});

test("current pairing rule counts calculate tier-independent rows and current-tier summary in one lightweight query", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      const countKeys = (values ?? []).filter(
        (value): value is string => typeof value === "string" && /^(rule|funnel):/.test(value),
      );

      return {
        rows: countKeys.map((key, index) => ({
          count_key: key,
          total_items: String(100 - index * 10),
          pairing_id_count: String(50 - index * 5),
        })),
      };
  });
  const service = createService(pgPool);

  const result = await service.countCurrentRules(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tier: "T4",
    properties: [
      {
        propertyGroupKey: "property-1",
        rowSeq: 1,
        propertyCode: 131,
        name: "Prefer Pairing Length",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 3, min: 1, max: 7 },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "property-2",
        rowSeq: 2,
        propertyCode: 112,
        name: "Avoid Pairing Length",
        action: "avoid",
        quantifier: null,
        bid: { type: "stepper", value: 5, min: 1, max: 7 },
        tiers: ["T4", "T5"],
      },
      {
        propertyGroupKey: "property-3",
        rowSeq: 3,
        propertyCode: 133,
        name: "Any/Every Duty Period",
        action: "award",
        quantifier: "every",
        bid: { type: "stepper", value: 8, min: 1, max: 24 },
        tiers: ["T4"],
      },
    ],
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /candidate_pairings as materialized/i);
  assert.match(queries[0]!.text, /evaluated_pairings as materialized/i);
  assert.match(queries[0]!.text, /from evaluated_pairings evaluated/i);
  assert.match(queries[0]!.text, /p\.base = \$\d+/i);
  assert.ok((queries[0]!.values ?? []).includes(ACTOR_BASE));
  assert.match(queries[0]!.text, /left join pg_timezone_names base_tz/i);
  assert.match(queries[0]!.text, /at time zone 'UTC'\) at time zone base_tz\.name\)::date/i);
  assert.equal((queries[0]!.text.match(/from f8\.pairing_segment period_segment/gi) ?? []).length, 1);
  assert.match(queries[0]!.text, /count\(distinct evaluated\.id::text\)::bigint as pairing_id_count/i);
  assert.doesNotMatch(queries[0]!.text, /paged_pairings/i);
  assert.equal(result.summary.activePropertyCount, 2);
  assert.deepEqual(result.rows.map((row) => row.propertyGroupKey), ["property-1", "property-2", "property-3"]);
  assert.deepEqual(result.rows[0]?.rule, {
    pairingIdCount: 50,
    totalItems: 100,
  });
  assert.deepEqual(result.rows[0]?.funnel, {
    pairingIdCount: 0,
    totalItems: 0,
  });
  assert.deepEqual(result.rows[1]?.rule, {
    pairingIdCount: 45,
    totalItems: 90,
  });
  assert.deepEqual(result.rows[1]?.funnel, {
    pairingIdCount: 35,
    totalItems: 70,
  });
  assert.deepEqual(result.rows[2]?.rule, {
    pairingIdCount: 40,
    totalItems: 80,
  });
  assert.deepEqual(result.rows[2]?.funnel, result.summary.allRules);
  assert.deepEqual(result.summary.allRules, {
    pairingIdCount: 30,
    totalItems: 60,
  });
});

test("current pairing rule counts evaluate twenty property leaves once each", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });

    const countKeys = (values ?? []).filter(
      (value): value is string => typeof value === "string" && /^(rule|funnel):/.test(value),
    );

    return {
      rows: countKeys.map((key) => ({
        count_key: key,
        total_items: "10",
        pairing_id_count: "10",
      })),
    };
  });
  const service = createService(pgPool);
  const properties = Array.from({ length: 20 }, (_, index) => ({
    propertyGroupKey: `property-${index + 1}`,
    rowSeq: index + 1,
    propertyCode: 102,
    name: "Pairing Preference",
    action: "award" as const,
    quantifier: null,
    bid: {
      type: "pairing-preference" as const,
      pairingIds: [String(10_000 + index)],
    },
    tiers: ["T1"],
  }));

  const result = await service.countCurrentRules(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tier: "T1",
    properties,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /candidate_pairings as materialized/i);
  assert.match(queries[0]!.text, /evaluated_pairings as materialized/i);
  assert.equal((queries[0]!.text.match(/p\.id = any\(/gi) ?? []).length, 20);
  assert.equal((queries[0]!.text.match(/f8\.pairing p/gi) ?? []).length, 2);
  assert.equal(
    (queries[0]!.values ?? []).filter(
      (value): value is string => typeof value === "string" && /^rule:/.test(value),
    ).length,
    20,
  );
  assert.equal(
    (queries[0]!.values ?? []).filter(
      (value): value is string => typeof value === "string" && /^funnel:/.test(value),
    ).length,
    20,
  );
  assert.equal(result.rows.length, 20);
  assert.equal(result.summary.activePropertyCount, 20);
});

test("current pairing rule counts materialize reusable facts for segment-heavy properties", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });

    return {
      rows: (values ?? [])
        .filter((value): value is string => typeof value === "string" && /^(rule|funnel):/.test(value))
        .map((key) => ({ count_key: key, total_items: "1", pairing_id_count: "1" })),
    };
  });
  const service = createService(pgPool);

  await service.countCurrentRules(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    tier: "T1",
    properties: [
      {
        propertyGroupKey: "check-time",
        rowSeq: 1,
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        action: "award",
        quantifier: null,
        bid: {
          type: "pairing-check-time",
          timeType: "check_in",
          operator: "Between",
          from: "03:00",
          to: "11:00",
          dateScope: { mode: "date_range", from: "2026-06-08", to: "2026-06-11" },
        },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "duty-legs",
        rowSeq: 2,
        propertyCode: 107,
        name: "Flight Legs per Duty",
        action: "award",
        quantifier: "any",
        bid: {
          type: "flight-legs-per-duty",
          operator: "=",
          legs: 3,
          dateScope: { mode: "specific_dates", dates: ["2026-06-10"] },
        },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "airport",
        rowSeq: 3,
        propertyCode: 168,
        name: "Airport Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "airport-preference",
          event: "landing_or_layover",
          locations: [{ code: "YEG", kind: "airport" }],
          dateScope: { mode: "specific_dates", dates: ["2026-06-16"] },
          minimumLayoverDuration: "14:00",
        },
        tiers: ["T1"],
      },
    ],
  });

  assert.equal(queries.length, 1);
  const query = queries[0]!.text;
  assert.match(query, /current_rules_segments as materialized/i);
  assert.match(query, /current_rules_facts as materialized/i);
  assert.equal((query.match(/join f8\.pairing_segment s/gi) ?? []).length, 1);
  assert.match(query, /jsonb_to_recordset\(facts\.duty_counts\)/i);
  assert.match(query, /jsonb_to_recordset\(facts\.airport_events\)/i);
  assert.doesNotMatch(query, /event_segment\.pairing_id = p\.id/i);
});

test("current pairing rule tier pools calculate package, cumulative, and by-Tx counts in one lightweight query", async () => {
  const countValuesByKey = new Map([
    ["package", { total_items: "120", pairing_id_count: "100" }],
    ["tx:T1", { total_items: "25", pairing_id_count: "20" }],
    ["total:T1", { total_items: "25", pairing_id_count: "20" }],
    ["by:T1", { total_items: "25", pairing_id_count: "20" }],
    ["tx:T2", { total_items: "40", pairing_id_count: "30" }],
    ["total:T2", { total_items: "55", pairing_id_count: "45" }],
    ["by:T2", { total_items: "30", pairing_id_count: "25" }],
  ]);
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      const countKeys = (values ?? []).filter(
        (value): value is string => typeof value === "string" && (
          value === "package" || /^(tx|total|by):/.test(value)
        ),
      );

      return {
        rows: countKeys.map((key) => ({
          count_key: key,
          ...(countValuesByKey.get(key) ?? { total_items: "0", pairing_id_count: "0" }),
        })),
      };
  });
  const service = createService(pgPool);

  const result = await service.countCurrentRuleTierPools(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    tiers: ["T1", "T2", "T3"],
    properties: [
      {
        propertyGroupKey: "property-1",
        rowSeq: 1,
        propertyCode: 131,
        name: "Prefer Pairing Length",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 3, min: 1, max: 7 },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "property-2",
        rowSeq: 2,
        propertyCode: 133,
        name: "Any/Every Duty Period",
        action: "award",
        quantifier: "every",
        bid: { type: "stepper", value: 8, min: 1, max: 24 },
        tiers: ["T2"],
      },
    ],
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /union all/i);
  assert.match(queries[0]!.text, /p\.base = \$\d+/i);
  assert.match(queries[0]!.text, /left join pg_timezone_names base_tz/i);
  assert.match(queries[0]!.text, /at time zone 'UTC'\) at time zone base_tz\.name\)::date/i);
  assert.match(queries[0]!.text, /is not true/i);
  assert.doesNotMatch(queries[0]!.text, /paged_pairings/i);
  assert.deepEqual(
    (queries[0]!.values ?? []).filter(
      (value): value is string => typeof value === "string" && (
        value === "package" || /^(tx|total|by):/.test(value)
      ),
    ),
    ["package", "tx:T1", "total:T1", "by:T1", "tx:T2", "total:T2", "by:T2"],
  );
  assert.equal(result.mode, "current_rules_tier_pools");
  assert.deepEqual(result.packageTotal, {
    pairingIdCount: 100,
    totalItems: 120,
  });
  assert.deepEqual(result.rows[0], {
    tier: "T1",
    activePropertyCount: 1,
    txSet: {
      pairingIdCount: 20,
      totalItems: 25,
    },
    totalPairings: {
      pairingIdCount: 20,
      totalItems: 25,
    },
    pairingsByTx: {
      pairingIdCount: 20,
      totalItems: 25,
    },
    status: "success",
  });
  assert.deepEqual(result.rows[1], {
    tier: "T2",
    activePropertyCount: 1,
    txSet: {
      pairingIdCount: 30,
      totalItems: 40,
    },
    totalPairings: {
      pairingIdCount: 45,
      totalItems: 55,
    },
    pairingsByTx: {
      pairingIdCount: 25,
      totalItems: 30,
    },
    status: "success",
  });
  assert.deepEqual(result.rows[2], {
    tier: "T3",
    activePropertyCount: 0,
    txSet: null,
    totalPairings: {
      pairingIdCount: 45,
      totalItems: 55,
    },
    pairingsByTx: null,
    status: "no_pairing_rules",
  });
});

test("pairing number autocomplete trims query, clamps limit, and returns lightweight options", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [
          {
            pairing_id: "4959",
            pairing_label: "M4959",
            start_date: "2026-02-24",
            end_date: "2026-03-02",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchPairingIds(actor, {
    rosterPeriodId: 2,
    query: " m49 ",
    limit: 200,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8\.pairing p/i);
  assert.match(queries[0]!.text, /p\.interface_id/i);
  assert.doesNotMatch(queries[0]!.text, /p\.id::text\s*=\s*\$2/i);
  assert.doesNotMatch(queries[0]!.text, /p\.id::text\s+like/i);
  assert.match(queries[0]!.text, /p\.base = \$4/i);
  assert.match(queries[0]!.text, /limit \$7/i);
  assert.deepEqual(queries[0]!.values, ["%M49%", "M49", "M49%", ACTOR_BASE, "2026-04-01", "2026-04-30", 50]);
  assert.equal(result.query, "M49");
  assert.equal(result.limit, 50);
  assert.deepEqual(result.options, [
    {
      value: "M4959",
      label: "M4959 (2026-02-24 - 2026-03-02)",
      pairingId: "4959",
      pairingLabel: "M4959",
      startDate: "2026-02-24",
      endDate: "2026-03-02",
    },
  ]);
});

test("pairing number autocomplete filters candidates to the logged-in actor rank", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [],
      };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const result = await service.searchPairingIds(actor, {
    rosterPeriodId: 4,
    query: "t41",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8\.pairing_composition pc/i);
  assert.match(queries[0]!.text, /pc\.pairing_id = p\.id/i);
  assert.match(queries[0]!.text, /pc\.acting_rank = \$5::varchar/i);
  assert.match(queries[0]!.text, /pc\.is_deleted = 0/i);
  assert.match(queries[0]!.text, /limit \$8/i);
  assert.deepEqual(queries[0]!.values, ["%T41%", "T41", "T41%", ACTOR_BASE, "CA", "2026-04-01", "2026-04-30", 20]);
  assert.deepEqual(result.options, []);
});

test("pairing number autocomplete prefers external pairing number labels over route labels", async () => {
  const pgPool = createPairingSearchPgPool(async () => {
      return {
        rows: [
          {
            pairing_id: "12484",
            pairing_label: "TB7930",
            start_date: "2026-06-29",
            end_date: "2026-06-30",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchPairingIds(actor, {
    query: "tb793",
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
  });

  assert.deepEqual(result.options, [
    {
      value: "TB7930",
      label: "TB7930 (2026-06-29 - 2026-06-30)",
      pairingId: "12484",
      pairingLabel: "TB7930",
      startDate: "2026-06-29",
      endDate: "2026-06-30",
    },
  ]);
});

test("pairing number autocomplete filters options to the requested bid period", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [
          {
            pairing_id: "4959",
            pairing_label: "M4959",
            start_date: "2026-06-24",
            end_date: "2026-06-26",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchPairingIds(actor, {
    query: " m49 ",
    limit: 200,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /p\.base = \$4/i);
  assert.match(queries[0]!.text, /left join pg_timezone_names base_tz/i);
  assert.match(queries[0]!.text, /min\(coalesce\(period_segment\.duty_sch_str_dt_utc, period_segment\.brief_start_utc, period_segment\.sch_str_dt_utc\)\)/i);
  assert.match(queries[0]!.text, /min\(coalesce\(s\.duty_sch_str_dt_utc, s\.brief_start_utc, s\.sch_str_dt_utc\)\)/i);
  assert.match(queries[0]!.text, /at time zone 'UTC'\) at time zone base_tz\.name\)::date between \$5::date and \$6::date/i);
  assert.match(queries[0]!.text, /between \$5::date and \$6::date/i);
  assert.match(queries[0]!.text, /limit \$7/i);
  assert.deepEqual(queries[0]!.values, ["%M49%", "M49", "M49%", ACTOR_BASE, "2026-06-01", "2026-06-30", 50]);
  assert.equal(result.periodCode, "Jun 2026");
  assert.deepEqual(result.options, [
    {
      value: "M4959",
      label: "M4959 (2026-06-24 - 2026-06-26)",
      pairingId: "4959",
      pairingLabel: "M4959",
      startDate: "2026-06-24",
      endDate: "2026-06-26",
    },
  ]);
});

test("pairing number autocomplete does not search by live internal pairing ids", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchPairingIds(actor, {
    rosterPeriodId: 4,
    query: "4501",
    limit: 20,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /upper\(/i);
  assert.match(queries[0]!.text, /p\.interface_id/i);
  assert.doesNotMatch(queries[0]!.text, /p\.id::text\s*=\s*\$2/i);
  assert.doesNotMatch(queries[0]!.text, /p\.id::text\s+like/i);
  assert.match(queries[0]!.text, /p\.base = \$4/i);
  assert.deepEqual(queries[0]!.values, ["%4501%", "4501", "4501%", ACTOR_BASE, "2026-04-01", "2026-04-30", 20]);
  assert.deepEqual(result.options, []);
});

test("pairing number autocomplete returns empty options without scanning for an empty query", async () => {
  const pgPool = createPairingSearchPgPool(async () => {
      throw new Error("Unexpected pairing number search query");
  });
  const service = createService(pgPool);

  const result = await service.searchPairingIds(actor, {
    rosterPeriodId: 4,
    query: " ",
  });

  assert.deepEqual(result, {
    query: "",
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    limit: 20,
    options: [],
  });
});

test("pairing number result filter options use stable cursor pages for an empty query", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });

    return values?.includes("M4960")
      ? {
        rows: [
          { pairing_number: "V4146", total_count: 3 },
        ],
      }
      : {
        rows: [
          { pairing_number: "M4959", total_count: 3 },
          { pairing_number: "M4960", total_count: 3 },
          { pairing_number: "V4146", total_count: 3 },
        ],
      };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const firstPage = await service.getPairingNumberFilterOptions(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    limit: 2,
  });
  const secondPage = await service.getPairingNumberFilterOptions(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    limit: 2,
    cursor: firstPage.nextCursor ?? undefined,
  });

  assert.deepEqual(firstPage.options, [
    { value: "M4959", label: "M4959" },
    { value: "M4960", label: "M4960" },
  ]);
  assert.equal(firstPage.totalCount, 3);
  assert.ok(firstPage.nextCursor);
  assert.deepEqual(secondPage.options, [{ value: "V4146", label: "V4146" }]);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(queries.length, 2);
  assert.match(queries[0]!.text, /select distinct upper\(btrim\(/i);
  assert.match(queries[0]!.text, /from f8\.pairing_composition pc/i);
  assert.match(queries[0]!.text, /between \$2::date and \$3::date/i);
  assert.doesNotMatch(queries[0]!.text, /offset/i);
  assert.deepEqual(queries[0]!.values, [ACTOR_BASE, "2026-06-01", "2026-06-30", "CA", 3]);
  assert.match(queries[1]!.text, /where pairing_number > \$5::varchar/i);
  assert.deepEqual(queries[1]!.values, [ACTOR_BASE, "2026-06-01", "2026-06-30", "CA", "M4960", 3]);
});

test("pairing number result filter cursor rejects changed query and actor scope before option SQL", async () => {
  const firstPool = createPairingSearchPgPool(async () => ({
    rows: [
      { pairing_number: "M4959", total_count: 2 },
      { pairing_number: "M4960", total_count: 2 },
    ],
  }), ACTOR_BASE, "CA");
  const firstService = createService(firstPool);
  const firstPage = await firstService.getPairingNumberFilterOptions(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    limit: 1,
  });

  await assert.rejects(
    () => firstService.getPairingNumberFilterOptions(actor, {
      rosterPeriodId: 6,
      periodCode: "Jun 2026",
      query: "M49",
      cursor: firstPage.nextCursor ?? undefined,
    }),
    /Pairing Number list changed/i,
  );

  let changedScopeOptionQueries = 0;
  const changedScopePool = createPairingSearchPgPool(async () => {
    changedScopeOptionQueries += 1;
    return { rows: [] };
  }, ACTOR_BASE, "FO");
  const changedScopeService = createService(changedScopePool);

  await assert.rejects(
    () => changedScopeService.getPairingNumberFilterOptions(actor, {
      rosterPeriodId: 6,
      periodCode: "Jun 2026",
      cursor: firstPage.nextCursor ?? undefined,
    }),
    /Pairing Number list changed/i,
  );
  assert.equal(changedScopeOptionQueries, 0);
});

test("crew id autocomplete searches crew ids and names without using employee_no", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [
          {
            crew_id: "5510",
            first_name: "Peter",
            last_name: "Adams",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchCrewIds(actor, {
    query: " pet ",
    limit: 200,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8\.crew c/i);
  assert.match(queries[0]!.text, /actor_search_scope as/i);
  assert.match(queries[0]!.text, /from f8_pbs\.pbs_user pu/i);
  assert.match(queries[0]!.text, /left join lateral \(\s*select crew_base\.base\s*from f8\.crew_base crew_base/is);
  assert.match(queries[0]!.text, /upper\(c\.crew_id\) like \$1/i);
  assert.match(queries[0]!.text, /upper\(coalesce\(c\.first_name, ''\)\) like \$1/i);
  assert.match(queries[0]!.text, /upper\(coalesce\(c\.last_name, ''\)\) like \$1/i);
  assert.match(queries[0]!.text, /nullif\(upper\(btrim\(c\.crew_id\)\), ''\)\s*=\s*nullif\(upper\(btrim\(\$6::varchar\)\), ''\)/i);
  assert.match(queries[0]!.text, /nullif\(upper\(btrim\(cb\.base\)\), ''\) = actor_scope\.base/i);
  assert.match(queries[0]!.text, /nullif\(upper\(btrim\(c\.division\)\), ''\) = actor_scope\.division/i);
  assert.doesNotMatch(queries[0]!.text, /employee_no/i);
  assert.deepEqual(queries[0]!.values, ["%PET%", "PET", "PET%", 50, false, "F8030", "casey.crew"]);
  assert.deepEqual(result, {
    query: "PET",
    limit: 50,
    options: [
      {
        value: "5510",
        label: "5510 - Peter Adams",
        crewId: "5510",
        firstName: "Peter",
        lastName: "Adams",
      },
    ],
  });
});

test("crew id autocomplete passes admin scope through SQL parameters", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });

    return {
      rows: [],
    };
  });
  const service = createService(pgPool);

  await service.searchCrewIds({
    crewId: "admin",
    userCode: "admin",
    isAdmin: true,
  }, {
    query: " pet ",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /\$5::boolean/i);
  assert.deepEqual(queries[0]!.values, ["%PET%", "PET", "PET%", 20, true, "admin", "admin"]);
});

test("crew id autocomplete returns empty options without scanning for an empty query", async () => {
  const pgPool = createPairingSearchPgPool(async () => {
      throw new Error("Unexpected crew id search query");
  });
  const service = createService(pgPool);

  const result = await service.searchCrewIds(actor, {
    query: " ",
  });

  assert.deepEqual(result, {
    query: "",
    limit: 20,
    options: [],
  });
});

test("flight number autocomplete searches pairing segment flight numbers", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [
          {
            flt_num: "1993",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchFlightNumbers(actor, {
    query: " 19 ",
    limit: 200,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8\.pairing_segment s/i);
  assert.match(queries[0]!.text, /join f8\.pairing p/i);
  assert.match(queries[0]!.text, /p\.base = \$4/i);
  assert.match(queries[0]!.text, /s\.is_deleted = 0/i);
  assert.match(queries[0]!.text, /seg_assignment.*in \('FLT', 'FLY'\)/i);
  assert.match(queries[0]!.text, /upper\(s\.flt_num\) like \$1/i);
  assert.doesNotMatch(queries[0]!.text, /from f8\.flight/i);
  assert.deepEqual(queries[0]!.values, ["%19%", "19", "19%", ACTOR_BASE, 50]);
  assert.deepEqual(result, {
    query: "19",
    limit: 50,
    options: [
      {
        value: "1993",
        label: "1993",
      },
    ],
  });
});

test("flight number autocomplete filters candidates by the selected configured type range", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      if (/from f8\.dictionary/i.test(text)) {
        assert.deepEqual(values, ["PBS_FLIGHT_NUMBER_CATEGORY_RANGE", "CHARTER_POSITIONING_NETWORK"]);

        return {
          rows: [
            { code: "CHARTER_POSITIONING_NETWORK", code_value: "9900-9949" },
          ],
        };
      }

      return {
        rows: [
          {
            flt_num: "9900",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchFlightNumbers(actor, {
    query: " 99 ",
    limit: 20,
    type: "positioning-charter-network",
  });

  assert.equal(queries.length, 2);
  assert.match(queries[1]!.text, /regexp_replace\(upper\(btrim\(s\.flt_num\)\), '\[\^0-9\]', '', 'g'\)/i);
  assert.match(queries[1]!.text, /between \$4::integer and \$5::integer/i);
  assert.doesNotMatch(queries[1]!.text, /between \$6::integer and \$7::integer/i);
  assert.match(queries[1]!.text, /p\.base = \$6/i);
  assert.deepEqual(queries[1]!.values, [
    "%99%",
    "99",
    "99%",
    9900,
    9949,
    ACTOR_BASE,
    20,
  ]);
  assert.deepEqual(result, {
    query: "99",
    limit: 20,
    options: [
      {
        value: "9900",
        label: "9900",
      },
    ],
  });
});

test("flight number autocomplete returns empty options without scanning for an empty query", async () => {
  const pgPool = createPairingSearchPgPool(async () => {
      throw new Error("Unexpected flight number search query");
  });
  const service = createService(pgPool);

  const result = await service.searchFlightNumbers(actor, {
    query: " ",
  });

  assert.deepEqual(result, {
    query: "",
    limit: 20,
    options: [],
  });
});

test("pairing airport options use the actor base local period filter", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      if (/from f8\.dictionary/i.test(text)) {
        return {
          rows: [{ code_value: '{"min":14,"max":20,"step":2,"default":16}' }],
        };
      }

      return {
          rows: [
          {
            role: "landing",
            airport: "YVR",
            airport_preference_landing: true,
            airport_name: "Vancouver",
            city: "YVR",
          },
          { role: "layover", airport: "YUL", airport_name: "Montréal", city: "YMQ" },
          { role: "work_start", airport: "YYZ" },
          { role: "filter", airport: "YEG" },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.getAirportOptions(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
  });

  assert.equal(queries.length, 2);
  const configQuery = queries.find((query) => /from f8\.dictionary/i.test(query.text));
  assert.ok(configQuery);
  assert.deepEqual(configQuery.values, ["PBS_AIRPORT_PREFERENCE_LAYOVER_HOURS_RANGE"]);
  const airportQuery = queries.find((query) => /with\s+actor_zone as/i.test(query.text));
  assert.ok(airportQuery);
  assert.match(airportQuery.text, /from \(select \$1::varchar as base\) actor_base/i);
  assert.match(airportQuery.text, /min\(coalesce\(period_segment\.duty_sch_str_dt_utc, period_segment\.brief_start_utc, period_segment\.sch_str_dt_utc\)\)/i);
  assert.match(airportQuery.text, /at time zone 'UTC'\) at time zone actor_zone\.zone_id\)::date between \$3::date and \$4::date/i);
  assert.match(airportQuery.text, /cross join lateral \(values\s*\(s\.dep_arp\),\s*\(s\.arv_arp\),\s*\(s\.duty_str_arp\),\s*\(s\.duty_end_arp\)/i);
  assert.match(airportQuery.text, /select 'filter'::text, upper\(filter_airport\.airport\)/i);
  assert.deepEqual(airportQuery.values, [ACTOR_BASE, "UTC", "2026-06-01", "2026-06-30"]);
  assert.deepEqual(result, {
    airportPreferenceLayoverHours: { minHours: 14, maxHours: 20, stepHours: 2, defaultHours: 16 },
    airportPreferenceOptions: [
      { code: "YUL", kind: "airport", label: "YUL · Montréal", events: ["layover"] },
      { code: "YVR", kind: "airport", label: "YVR · Vancouver", events: ["landing"] },
      { code: "YMQ", kind: "city", label: "YMQ", events: ["layover"] },
      { code: "YVR", kind: "city", label: "YVR", events: ["landing"] },
    ],
    filterAirports: ["YEG"],
    landingAirports: ["YVR"],
    layoverAirports: ["YUL"],
    workStartStations: ["YYZ"],
  });
});

test("pairing occurrences query returns current-period runs for one pairing id", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [
          {
            pairing_id: "11",
            pairing_label: "M4959",
            origin_date: "2026-04-03",
            start_date: "2026-04-03",
            end_date: "2026-04-05",
          },
          {
            pairing_id: "12",
            pairing_label: "M4959",
            origin_date: "2026-04-10",
            start_date: "2026-04-10",
            end_date: "2026-04-12",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchPairingOccurrences(actor, {
    pairingId: "11",
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8\.pairing p/i);
  assert.match(queries[0]!.text, /p\.id = any\(\$1::bigint\[\]\)/i);
  assert.doesNotMatch(queries[0]!.text, /pairing_label\s*=\s*any/i);
  assert.match(queries[0]!.text, /p\.base = \$2/i);
  assert.match(queries[0]!.text, /min\(coalesce\(s\.duty_sch_str_dt_utc, s\.brief_start_utc, s\.sch_str_dt_utc\)\)/i);
  assert.match(queries[0]!.text, /start_utc at time zone 'UTC'\) at time zone zone_id/i);
  assert.match(queries[0]!.text, /between \$3::date and \$4::date/i);
  assert.deepEqual(queries[0]!.values, [["11"], ACTOR_BASE, "2026-04-01", "2026-04-30"]);
  assert.equal(result.pairingNumber, "M4959");
  assert.equal(result.periodCode, "Apr 2026");
  assert.deepEqual(result.occurrences.map((occurrence) => occurrence.originDate), [
    "2026-04-03",
  ]);
});

test("pairing occurrence query filters runs to the logged-in actor rank", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [],
      };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const result = await service.searchPairingOccurrences(actor, {
    pairingId: "11",
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8\.pairing_composition pc/i);
  assert.match(queries[0]!.text, /pc\.pairing_id = p\.id/i);
  assert.match(queries[0]!.text, /pc\.acting_rank = \$5::varchar/i);
  assert.match(queries[0]!.text, /pc\.is_deleted = 0/i);
  assert.deepEqual(queries[0]!.values, [["11"], ACTOR_BASE, "2026-04-01", "2026-04-30", "CA"]);
  assert.deepEqual(result.occurrences, []);
});

test("pairing occurrence date search uses the logged-in user's base timezone", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [
          {
            pairing_id: "12484",
            pairing_label: "TB7930",
            origin_date: "2026-06-27",
            start_date: "2026-06-27",
            end_date: "2026-06-30",
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.searchPairingOccurrencesByDate(actor, {
    originDate: "2026-06-27",
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /p\.base = \$1/i);
  assert.match(queries[0]!.text, /join f8\.airport base_airport/i);
  assert.match(queries[0]!.text, /join pg_timezone_names base_tz/i);
  assert.match(queries[0]!.text, /min\(coalesce\(s\.duty_sch_str_dt_utc, s\.brief_start_utc, s\.sch_str_dt_utc\)\)/i);
  assert.match(queries[0]!.text, /start_utc at time zone 'UTC'\) at time zone zone_id/i);
  assert.match(queries[0]!.text, /between \$2::date and \$3::date/i);
  assert.match(queries[0]!.text, /= \$4::date/i);
  assert.deepEqual(queries[0]!.values, [
    ACTOR_BASE,
    "2026-06-01",
    "2026-06-30",
    "2026-06-27",
  ]);
  assert.equal(result.originDate, "2026-06-27");
  assert.equal(result.periodCode, "Jun 2026");
  assert.deepEqual(result.occurrences, [
    {
      occurrenceId: "12484:2026-06-27",
      pairingNumber: "TB7930",
      pairingId: "12484",
      originDate: "2026-06-27",
      startDate: "2026-06-27",
      endDate: "2026-06-30",
      label: "TB7930 · 2026-06-27",
    },
  ]);
});

test("pairing occurrence date search filters candidates to the logged-in actor rank", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [],
      };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const result = await service.searchPairingOccurrencesByDate(actor, {
    originDate: "2026-06-06",
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8\.pairing_composition pc/i);
  assert.match(queries[0]!.text, /pc\.pairing_id = p\.id/i);
  assert.match(queries[0]!.text, /pc\.acting_rank = \$5::varchar/i);
  assert.match(queries[0]!.text, /pc\.is_deleted = 0/i);
  assert.deepEqual(queries[0]!.values, [
    ACTOR_BASE,
    "2026-06-01",
    "2026-06-30",
    "2026-06-06",
    "CA",
  ]);
  assert.deepEqual(result, {
    originDate: "2026-06-06",
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    occurrences: [],
  });
});

test("pairing occurrence date search fails when the actor base timezone is missing", async () => {
  const pgPool = {
    async query(text: string) {
      if (/from f8\.roster_period/i.test(text)) {
        return { rows: [{
          roster_period_id: "6",
          roster_period_key: "2026RP06",
          period_code: "Jun 2026",
          rp_start_local: "2026-06-01",
          rp_end_local: "2026-06-30",
        }] };
      }
      if (isActorBaseLookupQuery(text)) {
        return { rows: [{ base: ACTOR_BASE, rank: "CA", zone_id: null }] };
      }
      throw new Error("Unexpected pairing occurrence query");
    },
  } as unknown as Pool;
  const service = createPbsPairingSearchService({ pgPool, liveSchema: "f8", pbsSchema: "f8_pbs" });

  await assert.rejects(
    () => service.searchPairingOccurrencesByDate(actor, {
      originDate: "2026-06-28",
      rosterPeriodId: 6,
      periodCode: "Jun 2026",
    }),
    /valid timezone is required/i,
  );
});

test("pairing occurrences query rejects non-id labels before querying", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [],
      };
  });
  const service = createService(pgPool);

  await assert.rejects(
    () => service.searchPairingOccurrences(actor, {
      pairingId: "M4959",
      rosterPeriodId: 4,
      periodCode: "Apr 2026",
    }),
    /valid Pairing ID/,
  );

  assert.equal(queries.length, 0);
});

test("pairing occurrences query rejects unsupported bid periods before querying", async () => {
  const pgPool = createPairingSearchPgPool(async () => {
      throw new Error("Unexpected pairing occurrence query");
  });
  const service = createService(pgPool);

  await assert.rejects(
    () => service.searchPairingOccurrences(actor, {
      pairingId: "4959",
      rosterPeriodId: 4,
      periodCode: "bad-period",
    }),
    /requested period does not match the selected roster period/i,
  );
});

test("pairing details stay scoped to the logged-in actor base, rank, and bid period", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
    queries.push({ text, values });
    return { rows: [] };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const result = await service.getPairingDetails(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    targets: [{ pairingId: "11" }],
  });

  assert.deepEqual(result, { results: [] });
  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /p\.base = \$2::varchar/i);
  assert.match(queries[0]!.text, /upper\(actor_composition\.acting_rank\) = upper\(\$3::varchar\)/i);
  assert.match(queries[0]!.text, /cp\.origin_date between \$6::date and \$7::date/i);
  assert.deepEqual(queries[0]!.values, [
    ["11"],
    ACTOR_BASE,
    "CA",
    "11",
    null,
    "2026-04-01",
    "2026-04-30",
  ]);
});

test("pairing details display the base-local origin date instead of the next UTC date", async () => {
  let queryCount = 0;
  const pgPool = createPairingSearchPgPool(async () => {
    queryCount += 1;

    return queryCount === 1
      ? {
        rows: [{
          id: "11",
          pairing_label: "T4531A",
          base: "YYZ",
          base_zone_id: "America/Toronto",
          pairing_start_utc: "2026-06-05T00:30:00.000Z",
          composition_label: "IFD(1)",
          division: "C",
          duration_days: 2,
          duty_count: 1,
          fleet: "7M8",
          active_start_date: "2026-06-04",
          origin_date: "2026-06-04",
          report_start_utc: "2026-06-05T00:00:00.000Z",
          release_end_utc: "2026-06-06T10:50:00.000Z",
        }],
      }
      : { rows: [] };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const result = await service.getPairingDetails(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    targets: [{ pairingId: "11", originDate: "2026-06-04" }],
  });

  assert.equal(queryCount, 2);
  assert.equal(result.results[0]?.originDate, "2026-06-04");
  assert.equal(result.results[0]?.startDateLabel, "Jun 4, 2026");
  assert.deepEqual(result.results[0]?.activeDates, ["2026-06-04"]);
});

test("pairing details do not fall back to a UTC date when no local coverage date exists", async () => {
  let queryCount = 0;
  const pgPool = createPairingSearchPgPool(async () => {
    queryCount += 1;

    return queryCount === 1
      ? {
        rows: [{
          id: "11",
          pairing_label: "T4531A",
          base: "YYZ",
          base_zone_id: "America/Toronto",
          pairing_start_utc: "2026-06-05T00:30:00.000Z",
          composition_label: "IFD(1)",
          division: "C",
          duration_days: 2,
          duty_count: 1,
          fleet: "7M8",
          active_start_date: null,
          origin_date: null,
          report_start_utc: null,
          release_end_utc: null,
        }],
      }
      : { rows: [] };
  }, ACTOR_BASE, "CA");
  const service = createService(pgPool);

  const result = await service.getPairingDetails(actor, {
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    targets: [{ pairingId: "11" }],
  });

  assert.equal(queryCount, 2);
  assert.equal(result.results[0]?.originDate, "");
  assert.equal(result.results[0]?.startDateLabel, "");
  assert.deepEqual(result.results[0]?.activeDates, []);
});

test("pairing search preview skips segment loading when the combined summary/page query is empty", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = createPairingSearchPgPool(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });

      return {
        rows: [
          {
            total_items: "0",
            pairing_id_count: "0",
            id: null,
            pairing_label: null,
            base: null,
            division: null,
            duration_days: null,
            duty_count: null,
            fleet: null,
            active_start_date: null,
            report_start_utc: null,
            release_end_utc: null,
          },
        ],
      };
  });
  const service = createService(pgPool);

  const result = await service.previewPairings(actor, {
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    preview: {
      property: {
        propertyCode: 102,
        name: "Pairing Preference",
        action: "award",
        quantifier: null,
        bid: { type: "pairing-preference", pairingIds: ["999999"] },
      },
      page: 1,
      pageSize: 30,
    },
  });

  assert.equal(queries.length, 1);
  assert.equal(result.summary.totalItems, 0);
  assert.deepEqual(result.results, []);
});
