import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  pbsPairingPropertyCatalog,
  type PbsPairingDraftProperty,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import type { PbsPairingOccurrence } from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PbsCache } from "../../utils/cache.js";
import { buildPreferOffDatesByTier } from "../calendar/prefer-off-calendar-events.js";
import { CURRENT_BID_CONTEXT } from "../lineholder/shared.js";
import {
  createPbsPairingBidService,
  findSpecificDatePairingDayOffConflicts,
} from "./pairing-bid-service.js";
import {
  applyPairingBidPreferenceJson,
  buildPairingBidPreferenceJson,
  normalizeAddPropertyRequest,
} from "./pairing-bid-normalization.js";
import { normalizePairingOccurrenceListBid } from "./pairing-occurrence-list.js";
import type { PairingPropertyCatalogContext } from "./pairing-property-catalog.js";

const preferOffConfig: PbsPreferOffConfig = {
  weekdays: [
    { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
    { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
    { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
  ],
  weekend: {
    available: true,
    startDayCode: "SAT",
    startDayName: "Saturday",
    startTime: "00:00",
    endDayCode: "SUN",
    endDayName: "Sunday",
    endTime: "24:00",
  },
};

const buildOccurrence = (
  pairingNumber: string,
  originDate: string,
  endDate = originDate,
  pairingId = "1001",
): PbsPairingOccurrence => ({
  occurrenceId: `${pairingId}:${originDate}`,
  pairingNumber,
  pairingId,
  originDate,
  startDate: originDate,
  endDate,
  label: `${pairingNumber} · ${originDate}`,
});

const buildSpecificDatePairingProperty = (
  overrides: Partial<PbsPairingDraftProperty> = {},
): PbsPairingDraftProperty => ({
  propertyGroupKey: "pairing-property-key-1",
  rowSeq: 1,
  propertyCode: 102,
  name: "Pairing Number",
  action: "award",
  quantifier: null,
  bid: {
    type: "pairing-occurrence-list",
    occurrences: [{ pairingNumber: "M4959", originDate: "2026-04-04", pairingId: "4959" }],
  },
  tiers: ["T1"],
  ...overrides,
});

const pairingCatalogByCode = new Map(pbsPairingPropertyCatalog.map((definition) => [definition.propertyCode, definition]));

const buildWarmupCatalogContext = (): PairingPropertyCatalogContext => {
  const catalog = [
    {
      propertyCode: 132,
      name: "Prefer Pairing Length",
      defaultBid: { type: "stepper" as const, value: 3, min: 1, max: 7 },
      supportedActions: ["award", "avoid"] as const,
    },
  ];

  return {
    catalog,
    catalogByCode: new Map([[132, catalog[0]]]),
    propertyIdentityByCode: new Map([[132, { propertyCode: 132, propertyDefinitionId: 700132 }]]),
    recommendedPropertyCodes: [132],
    recommendedOrderByCode: new Map([[132, 1]]),
  };
};

const currentPeriodRow = {
  period_id: "7",
  roster_period_key: "2026RP02",
  period_code: "Feb 2026",
  filiale: "F8",
  status: "OPEN",
  bid_open_at: "2026-03-01T00:00:00.000Z",
  bid_close_at: "2026-03-10T23:59:59.000Z",
  base: "YYZ",
  zone_id: "America/Toronto",
  rp_start_local: "2026-01-31",
  rp_end_local: "2026-03-01",
};

const pairingCatalogRows = [{
  propertyDefinitionId: 700132,
  propertyCode: 132,
  bidType: "Pairing",
  propertyName: "Prefer Pairing Length",
  isActive: 1,
  recommendedOrder: 1,
  contextId: 900132,
  isVisibleInPortal: 1,
  contextDisplayOrder: 1,
}];

const buildSelectBuilder = <TRow extends Record<string, unknown>>(
  rows: TRow[],
  onFinalize: () => void,
) => {
  const builder = {
    from() {
      return builder;
    },
    leftJoin() {
      return builder;
    },
    innerJoin() {
      return builder;
    },
    where() {
      return builder;
    },
    orderBy() {
      onFinalize();
      return Promise.resolve(rows);
    },
    limit() {
      onFinalize();
      return Promise.resolve(rows);
    },
  };

  return builder;
};

test("pairing bid service warmUp leaves the database-controlled property catalog uncached", async () => {
  const catalogContext = buildWarmupCatalogContext();
  const cacheCalls: Array<{
    key: string;
    ttlSeconds: number;
    hasSerialize: boolean;
    hasDeserialize: boolean;
  }> = [];
  let executeCalls = 0;
  const cache: PbsCache = {
    key(group, resource, version, ...dimensions) {
      return [group, resource, version, ...dimensions].join(":");
    },
    async getOrSet(key, ttlSeconds, load, options) {
      cacheCalls.push({
        key,
        ttlSeconds,
        hasSerialize: Boolean(options?.serialize),
        hasDeserialize: Boolean(options?.deserialize),
      });

      return catalogContext as Awaited<ReturnType<typeof load>>;
    },
    async invalidate() {
      return;
    },
    async invalidatePattern() {
      return;
    },
  };
  type PairingBidServiceOptions = Parameters<typeof createPbsPairingBidService>[0];
  const service = createPbsPairingBidService({
    db: {
      async execute() {
        executeCalls += 1;
        return { rows: [] };
      },
    } as unknown as PairingBidServiceOptions["db"],
    cache,
  });

  await service.warmUp?.();

  assert.deepEqual(cacheCalls, []);
  assert.equal(executeCalls, 4);
});

test("pairing current draft uses current-period cache without caching the draft", async () => {
  const executedSql: string[] = [];
  const selectKinds: string[] = [];
  const cachedValues = new Map<string, unknown>();
  const cache: PbsCache = {
    key(group, resource, version, ...dimensions) {
      return [group, resource, version, ...dimensions].join(":");
    },
    async getOrSet(key, _ttlSeconds, load) {
      if (!cachedValues.has(key)) {
        cachedValues.set(key, await load());
      }

      return cachedValues.get(key) as Awaited<ReturnType<typeof load>>;
    },
    async invalidate() {
      return;
    },
    async invalidatePattern() {
      return;
    },
  };
  type PairingBidServiceOptions = Parameters<typeof createPbsPairingBidService>[0];
  const db = {
    async execute(query: SQL) {
      const queryText = new PgDialect().sqlToQuery(query).sql;
      executedSql.push(queryText);

      if (queryText.includes("SYS_PARAM")) {
        return { rows: [] };
      }

      return { rows: [currentPeriodRow] };
    },
    select(selection?: Record<string, unknown>) {
      if (selection && "propertyDefinitionId" in selection) {
        return buildSelectBuilder(pairingCatalogRows, () => {
          selectKinds.push("propertyCatalog");
        });
      }

      return buildSelectBuilder([], () => {
        selectKinds.push("existingBid");
      });
    },
  } as unknown as PairingBidServiceOptions["db"];
  const service = createPbsPairingBidService({ db, cache });
  const actor = { crewId: "F8030", userCode: "casey.crew" };

  const firstDraft = await service.getCurrentDraft(actor);
  const secondDraft = await service.getCurrentDraft(actor);

  assert.equal(firstDraft.currentPeriod?.periodCode, "Feb 2026");
  assert.equal(secondDraft.currentPeriod?.periodCode, "Feb 2026");
  assert.equal(
    executedSql.filter((queryText) => queryText.includes("automatic_candidates")).length,
    1,
  );
  assert.equal(
    executedSql.some((queryText) => /\bexisting_bid\b/i.test(queryText)),
    false,
  );
  assert.deepEqual(selectKinds, [
    "propertyCatalog",
    "existingBid",
    "propertyCatalog",
    "existingBid",
  ]);
});

test("Pairing Number add request rejects legacy tag-list bids", () => {
  assert.throws(
    () =>
      normalizeAddPropertyRequest({
        bidContext: CURRENT_BID_CONTEXT,
        draftVersion: 1,
        property: {
          propertyCode: 102,
          name: "Pairing Number",
          action: "award",
          quantifier: null,
          bid: { type: "tag-list", values: ["TB7930"] },
          tiers: ["T1"],
        },
      }, pairingCatalogByCode),
    /Pairing Preference must use Pairing IDs selected from the list/,
  );
});

test("Pairing Number add request rejects legacy tag-list-date bids", () => {
  assert.throws(
    () =>
      normalizeAddPropertyRequest({
        bidContext: CURRENT_BID_CONTEXT,
        draftVersion: 1,
        property: {
          propertyCode: 102,
          name: "Pairing Number",
          action: "award",
          quantifier: null,
          bid: { type: "tag-list-date", values: ["TB7930"], date: "2026-04-04" },
          tiers: ["T1"],
        },
      }, pairingCatalogByCode),
    /Pairing Preference must use Pairing IDs selected from the list/,
  );
});

test("Pairing Preference add request normalizes selected stable Pairing IDs and labels", () => {
  const normalizedRequest = normalizeAddPropertyRequest({
    bidContext: CURRENT_BID_CONTEXT,
    draftVersion: 1,
    property: {
      propertyCode: 102,
      name: "Pairing Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-preference",
        pairingIds: [" 496001 ", "496001", "496002"],
        pairingLabels: [" PR141 ", "PR141", "PR142"],
      },
      tiers: ["T1"],
    },
  }, pairingCatalogByCode);

  assert.equal(normalizedRequest.name, "Pairing Preference");
  assert.deepEqual(normalizedRequest.bid, {
    type: "pairing-preference",
    pairingIds: ["496001", "496002"],
    pairingLabels: ["PR141", "PR142"],
  });
});

test("Pairing Preference add request rejects legacy pairing-id-list bids", () => {
  assert.throws(
    () =>
      normalizeAddPropertyRequest({
        bidContext: CURRENT_BID_CONTEXT,
        draftVersion: 1,
        property: {
          propertyCode: 102,
          name: "Pairing Preference",
          action: "award",
          quantifier: null,
          bid: {
            type: "pairing-id-list",
            pairingIds: ["496001"],
            pairingLabels: ["PR141"],
          },
          tiers: ["T1"],
        },
      }, pairingCatalogByCode),
    /Pairing Preference must use Pairing IDs selected from the list/,
  );
});

test("pairing credit priority is preserved only for supported credit properties", () => {
  const normalizedCreditRequest = normalizeAddPropertyRequest({
    bidContext: CURRENT_BID_CONTEXT,
    draftVersion: 1,
    property: {
      propertyCode: 105,
      name: "Pairing Total Credit",
      action: "award",
      quantifier: null,
      bid: { type: "duration", value: "08:00", operator: ">", creditPriority: "lower" },
      tiers: ["T1"],
    },
  }, pairingCatalogByCode);

  assert.deepEqual(normalizedCreditRequest.bid, {
    type: "duration",
    value: "08:00",
    operator: ">",
    creditPriority: "lower",
  });
  assert.deepEqual(buildPairingBidPreferenceJson(105, normalizedCreditRequest.bid), {
    creditPriority: "lower",
  });
  assert.deepEqual(applyPairingBidPreferenceJson(105, {
    type: "duration",
    value: "08:00",
    operator: ">",
  }, {
    creditPriority: "higher",
  }), {
    type: "duration",
    value: "08:00",
    operator: ">",
    creditPriority: "higher",
  });

  const normalizedUnsupportedRequest = normalizeAddPropertyRequest({
    bidContext: CURRENT_BID_CONTEXT,
    draftVersion: 1,
    property: {
      propertyCode: 113,
      name: "TAFB",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 2, operator: "<", creditPriority: "higher" } as unknown as { type: "stepper"; value: number; operator: "<" | ">" | "=" },
      tiers: ["T1"],
    },
  }, pairingCatalogByCode);

  assert.deepEqual(normalizedUnsupportedRequest.bid, {
    type: "stepper",
    value: 2,
    operator: "<",
  });
  assert.equal(buildPairingBidPreferenceJson(113, normalizedUnsupportedRequest.bid), null);
});

test("specific-date pairing day off conflicts detect same-tier touched off dates", () => {
  const conflicts = findSpecificDatePairingDayOffConflicts(
    [
      buildSpecificDatePairingProperty({
        bid: {
          type: "pairing-occurrence-list",
          occurrences: [{ pairingNumber: "M4959", originDate: "2026-04-04", pairingId: "4959" }],
        },
        tiers: ["T1"],
      }),
    ],
    new Map([
      ["4959", [buildOccurrence("M4959", "2026-04-04", "2026-04-06", "4959")]],
    ]),
    new Map([[1, new Set(["2026-04-05"])]]),
  );

  assert.deepEqual(conflicts, [
    {
      tier: 1,
      date: "2026-04-05",
      pairingNumber: "M4959",
      originDate: "2026-04-04",
      propertyGroupKey: "pairing-property-key-1",
    },
  ]);
});

test("specific-date pairing conflicts use Saturday-Sunday Weekend dates but not Friday", () => {
  const dayOffDatesByTier = buildPreferOffDatesByTier([
    {
      propertyGroupKey: "prefer-off-weekends",
      groupSeq: 1,
      tier: 1,
      legacyPropertyCode: 201,
      propertyCode: 201,
      operator: "In",
      paramA: "Weekends",
      paramB: null,
      paramC: null,
    },
  ], "2026-06-01", "2026-06-30", preferOffConfig);
  const properties = [
    buildSpecificDatePairingProperty({
      bid: {
        type: "pairing-occurrence-list",
        occurrences: [
          { pairingNumber: "FRI100", originDate: "2026-06-05", pairingId: "100" },
          { pairingNumber: "SAT200", originDate: "2026-06-06", pairingId: "200" },
          { pairingNumber: "SUN300", originDate: "2026-06-07", pairingId: "300" },
        ],
      },
      tiers: ["T1"],
    }),
  ];
  const occurrences = new Map([
    ["100", [buildOccurrence("FRI100", "2026-06-05", "2026-06-05", "100")]],
    ["200", [buildOccurrence("SAT200", "2026-06-06", "2026-06-06", "200")]],
    ["300", [buildOccurrence("SUN300", "2026-06-07", "2026-06-07", "300")]],
  ]);

  assert.deepEqual(
    findSpecificDatePairingDayOffConflicts(properties, occurrences, dayOffDatesByTier)
      .map(({ date, pairingNumber }) => ({ date, pairingNumber })),
    [
      { date: "2026-06-06", pairingNumber: "SAT200" },
      { date: "2026-06-07", pairingNumber: "SUN300" },
    ],
  );
});

test("specific-date pairing conflicts ignore a non-overlapping partial Weekend window", () => {
  const property = buildSpecificDatePairingProperty({
    bid: {
      type: "pairing-occurrence-list",
      occurrences: [{ pairingNumber: "SAT200", originDate: "2026-06-06", pairingId: "200" }],
    },
    tiers: ["T1"],
  });
  const occurrence = {
    ...buildOccurrence("SAT200", "2026-06-06", "2026-06-06", "200"),
    startLocal: "2026-06-06T08:00:00",
    endLocal: "2026-06-06T12:00:00",
  };

  const conflicts = findSpecificDatePairingDayOffConflicts(
    [property],
    new Map([["200", [occurrence]]]),
    new Map([[1, new Set(["2026-06-06", "2026-06-07"])]]),
    new Map([[1, [{
      anchorDate: "2026-06-06",
      startDate: "2026-06-06",
      startTime: "18:00",
      endDate: "2026-06-07",
      endTime: "12:00",
      dates: ["2026-06-06", "2026-06-07"],
    }]]]),
  );

  assert.deepEqual(conflicts, []);
});

test("specific-date pairing day off conflicts ignore other tiers and entire-month bids", () => {
  const conflicts = findSpecificDatePairingDayOffConflicts(
    [
      buildSpecificDatePairingProperty({
        bid: {
          type: "pairing-occurrence-list",
          occurrences: [{ pairingNumber: "M4959", originDate: "2026-04-04", pairingId: "4959" }],
        },
        tiers: ["T1"],
      }),
      buildSpecificDatePairingProperty({
        propertyGroupKey: "entire-month",
        bid: {
          type: "pairing-id-list",
          pairingIds: ["4959"],
        },
        tiers: ["T2"],
      }),
    ],
    new Map([
      ["4959", [buildOccurrence("M4959", "2026-04-04", "2026-04-06", "4959")]],
    ]),
    new Map([[2, new Set(["2026-04-05"])]]),
  );

  assert.deepEqual(conflicts, []);
});

test("pairing occurrence list normalization uppercases and de-duplicates selected runs", () => {
  const bid = normalizePairingOccurrenceListBid({
    type: "pairing-occurrence-list",
    occurrences: [
      { pairingNumber: " m4959 ", originDate: "2026-04-10", pairingId: "496002" },
      { pairingNumber: "M4959", originDate: "2026-04-10", pairingId: "496002" },
      { pairingNumber: "c4513", originDate: "2026-04-13", pairingId: "4513" },
    ],
  });

  assert.deepEqual(bid.occurrences, [
    { pairingNumber: "C4513", originDate: "2026-04-13", pairingId: "4513" },
    { pairingNumber: "M4959", originDate: "2026-04-10", pairingId: "496002" },
  ]);
});

test("pairing occurrence list conflicts detect selected run dates", () => {
  const conflicts = findSpecificDatePairingDayOffConflicts(
    [
      buildSpecificDatePairingProperty({
        bid: {
          type: "pairing-occurrence-list",
          occurrences: [
            { pairingNumber: "M4959", originDate: "2026-04-04", pairingId: "4959" },
            { pairingNumber: "C4513", originDate: "2026-04-13", pairingId: "4513" },
          ],
        },
        tiers: ["T2"],
      }),
    ],
    new Map([
      ["4959", [buildOccurrence("M4959", "2026-04-04", "2026-04-06", "4959")]],
      ["4513", [buildOccurrence("C4513", "2026-04-13", "2026-04-13", "4513")]],
    ]),
    new Map([[2, new Set(["2026-04-05"])]]),
  );

  assert.deepEqual(conflicts, [
    {
      tier: 2,
      date: "2026-04-05",
      pairingNumber: "M4959",
      originDate: "2026-04-04",
      propertyGroupKey: "pairing-property-key-1",
    },
  ]);
});
