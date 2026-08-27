import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import type { PbsPairingOccurrence } from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  buildPairingEvents,
  buildWeekendEvents,
  createPlannedAbsenceEventsLoader,
  DAY_OFF_CAPACITY_CONTEXT_WARNING,
  DAY_OFF_CAPACITY_UNAVAILABLE_WARNING,
  findPairingDayOffConflicts,
  loadDayOffCapacityRows,
  loadSafeDayOffCapacityRows,
  loadPairingEvents,
} from "./bidding-calendar-service.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";

const partialWeekendConfig: PbsPreferOffConfig = {
  weekdays: [
    { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
    { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
  ],
  weekend: {
    available: true,
    startDayCode: "FRI",
    startDayName: "Friday",
    startTime: "18:00",
    endDayCode: "SUN",
    endDayName: "Sunday",
    endTime: "12:00",
  },
};

test("buildWeekendEvents uses configured partial-day intervals including a prior-month anchor", () => {
  const events = buildWeekendEvents("2026-08-01", "2026-08-31", partialWeekendConfig);

  assert.deepEqual(events[0], {
    id: "weekend-2026-07-31",
    type: "weekend",
    label: "Weekend",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    tone: "muted",
    source: "computed",
    readonly: true,
    metadata: {
      anchorDate: "2026-07-31",
      startTime: "00:00",
      endBoundaryDate: "2026-08-02",
      endTime: "12:00",
    },
  });
});

const buildOccurrence = (
  pairingId: string,
  originDate: string,
  pairingNumber = "M4959",
  endDate = originDate,
  localTimes?: { startLocal: string; endLocal: string },
): PbsPairingOccurrence => ({
  occurrenceId: `${pairingId}:${originDate}`,
  pairingNumber,
  pairingId,
  originDate,
  startDate: originDate,
  endDate,
  ...localTimes,
  label: `${pairingNumber} · ${originDate}`,
});

const createPairingEventsDb = (
  groupRows: Parameters<typeof buildPairingEvents>[0],
  occurrenceRows: Array<{
    propertyGroupKey: string;
    tier: number;
    pairingNumber: string;
    originDate: string;
    pairingId: string;
  }> = [],
) => {
  let selectCount = 0;

  return {
    select() {
      selectCount += 1;
      const rows = selectCount === 1 ? groupRows : occurrenceRows;
      const builder = {
        from() {
          return builder;
        },
        innerJoin() {
          return builder;
        },
        leftJoin() {
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          return Promise.resolve(rows);
        },
      };

      return builder;
    },
  } as unknown as Parameters<typeof loadPairingEvents>[0];
};

test("buildPairingEvents expands entire-month pairing bids into every occurrence", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-1",
      groupSeq: 1,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "496001,496002",
      paramB: null,
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496001", [buildOccurrence("496001", "2026-04-03")]],
      ["496002", [buildOccurrence("496002", "2026-04-10")]],
    ]),
  );

  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events.map((event) => event.startDate), [
    "2026-04-03",
    "2026-04-10",
  ]);
  assert.deepEqual(result.events.map((event) => event.tone), [
    "blue",
    "blue",
  ]);
  assert.deepEqual(result.events.map((event) => event.metadata?.occurrenceMode), [
    "entire_month",
    "entire_month",
  ]);
  assert.deepEqual(result.missingPairingIds, []);
});

test("loadPairingEvents reconstructs pairing-preference dates by stable IDs and actor base", async () => {
  const occurrenceQueries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const db = createPairingEventsDb([
    {
      propertyGroupKey: "pairing-property-key-1",
      groupSeq: 1,
      tier: 1,
      actionId: 1,
      operator: "Json",
      paramA: JSON.stringify({
        type: "pairing-preference",
        pairingIds: ["496001", "451302"],
        pairingLabels: ["M4959", "C4513"],
      }),
      paramB: null,
      paramC: null,
    },
  ]);
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      occurrenceQueries.push({ text, values });

      return {
        rows: [
          {
            pairing_id: "496001",
            pairing_label: "M4959",
            origin_date: "2026-04-03",
            start_date: "2026-04-03",
            end_date: "2026-04-03",
          },
        ],
      };
    },
  } as unknown as Pool;
  let actorBaseLookupCount = 0;

  const result = await loadPairingEvents(
    db,
    pgPool,
    "f8",
    42,
    "2026-04-01",
    "2026-04-30",
    new Map(),
    async () => {
      actorBaseLookupCount += 1;
      return "YYZ";
    },
  );

  assert.equal(actorBaseLookupCount, 1);
  assert.equal(occurrenceQueries.length, 1);
  assert.match(occurrenceQueries[0]!.text, /p\.id = any\(\$1::bigint\[\]\)/i);
  assert.doesNotMatch(occurrenceQueries[0]!.text, /pairing_label\s*=\s*any/i);
  assert.match(occurrenceQueries[0]!.text, /p\.base = \$2::varchar/i);
  assert.match(occurrenceQueries[0]!.text, /start_utc at time zone 'UTC'\) at time zone zone_id/i);
  assert.match(occurrenceQueries[0]!.text, /between \$3::date and \$4::date/i);
  assert.deepEqual(occurrenceQueries[0]!.values, [
    ["496001", "451302"],
    "YYZ",
    "2026-04-01",
    "2026-04-30",
  ]);
  assert.deepEqual(result.events.map((event) => event.metadata?.pairingId), ["496001"]);
  assert.deepEqual(result.warnings, [
    "Specific pairing bids skipped because pairing data was not found: 451302.",
  ]);
});

test("loadPairingEvents skips actor base lookup when there are no saved pairing ids", async () => {
  const db = createPairingEventsDb([
    {
      propertyGroupKey: "pairing-property-key-empty",
      groupSeq: 1,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: null,
      paramB: null,
      paramC: null,
    },
  ]);
  const pgPool = {
    async query() {
      throw new Error("Unexpected live pairing lookup");
    },
  } as unknown as Pool;
  let actorBaseLookupCount = 0;

  const result = await loadPairingEvents(
    db,
    pgPool,
    "f8",
    42,
    "2026-04-01",
    "2026-04-30",
    new Map(),
    async () => {
      actorBaseLookupCount += 1;
      throw new Error("Unexpected actor base lookup");
    },
  );

  assert.equal(actorBaseLookupCount, 0);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.warnings, []);
});

test("loadPairingEvents skips actor base lookup when saved pairing ids are avoid bids", async () => {
  const db = createPairingEventsDb([
    {
      propertyGroupKey: "pairing-property-key-avoid",
      groupSeq: 1,
      tier: 1,
      actionId: 2,
      operator: "In",
      paramA: "496002",
      paramB: "2026-04-10",
      paramC: null,
    },
  ]);
  const pgPool = {
    async query() {
      throw new Error("Unexpected live pairing lookup");
    },
  } as unknown as Pool;
  let actorBaseLookupCount = 0;

  const result = await loadPairingEvents(
    db,
    pgPool,
    "f8",
    42,
    "2026-04-01",
    "2026-04-30",
    new Map(),
    async () => {
      actorBaseLookupCount += 1;
      throw new Error("Unexpected actor base lookup");
    },
  );

  assert.equal(actorBaseLookupCount, 0);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.warnings, []);
});

test("loadDayOffCapacityRows reads live demand, pre-assigned days off, and clamps max capacity", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });

      if (/pbs_bid_group bid_group/i.test(text) && /pbs_bid_day_off day_off/i.test(text)) {
        return {
          rows: [
            {
              source_kind: "group",
              crew_id: "F8001",
              operator: "In",
              param_a: "2026-04-05,2026-04-06",
              param_b: null,
              bid_date: null,
            },
            {
              source_kind: "group",
              crew_id: "F8001",
              operator: "In",
              param_a: "2026-04-05",
              param_b: null,
              bid_date: null,
            },
            {
              source_kind: "group",
              crew_id: "F8002",
              operator: "Between",
              param_a: "2026-04-05",
              param_b: "2026-04-06",
              bid_date: null,
            },
            {
              source_kind: "date",
              crew_id: "F8002",
              operator: null,
              param_a: null,
              param_b: null,
              bid_date: "2026-04-05",
            },
            {
              source_kind: "date",
              crew_id: "F8004",
              operator: null,
              param_a: null,
              param_b: null,
              bid_date: "2026-04-06",
            },
          ],
        };
      }

      return {
        rows: [
          {
            capacity_date: "2026-04-05",
            base_code: "YVR",
            division_code: "C",
            zone_id: "America/Vancouver",
            total_crew_count: "120",
            pairing_demand_count: "82",
            reserve_demand_count: "8",
            pre_assigned_day_off_count: "10",
            max_days_off_count: "20",
          },
          {
            capacity_date: "2026-04-06",
            base_code: "YVR",
            division_code: "C",
            zone_id: "America/Vancouver",
            total_crew_count: "4",
            pairing_demand_count: "5",
            reserve_demand_count: "2",
            pre_assigned_day_off_count: "1",
            max_days_off_count: "0",
          },
        ],
      };
    },
  } as unknown as Pick<Pool, "query">;

  const result = await loadDayOffCapacityRows({
    pgPool,
    schema: "f8",
    pbsSchema: "f8_pbs",
    actor: {
      crewId: "F8030",
      userCode: "casey.crew",
    },
    rangeStart: "2026-04-01",
    rangeEnd: "2026-04-30",
    rosterPeriodId: 42,
    preferOffConfig: partialWeekendConfig,
  });

  const capacityQuery = queries.find((query) => /join f8\.pairing p/i.test(query.text));
  const requestedQuery = queries.find((query) =>
    /pbs_bid_group bid_group/i.test(query.text) && /pbs_bid_day_off day_off/i.test(query.text)
  );
  const requestedSql = requestedQuery?.text ?? "";

  assert.equal(queries.length, 2);
  assert.deepEqual(capacityQuery?.values, ["2026-04-01", "2026-04-30", "F8030", "casey.crew"]);
  assert.deepEqual(requestedQuery?.values, ["2026-04-01", "2026-04-30", "F8030", "casey.crew", 42]);
  assert.match(capacityQuery?.text ?? "", /join f8\.pairing p/i);
  assert.match(capacityQuery?.text ?? "", /join f8\.pairing_composition pairing_composition/i);
  assert.match(capacityQuery?.text ?? "", /join f8\.roster_flight roster_flight/i);
  assert.match(capacityQuery?.text ?? "", /calendar\.capacity_date::text as capacity_date/i);
  assert.match(capacityQuery?.text ?? "", /active_crew_ids as/i);
  assert.match(capacityQuery?.text ?? "", /pre_assigned_day_off_windows as/i);
  assert.match(capacityQuery?.text ?? "", /roster_flight\.source = 'IMP'/i);
  assert.match(capacityQuery?.text ?? "", /roster_flight\.assignment = 'DO'/i);
  assert.doesNotMatch(capacityQuery?.text ?? "", /upper\(btrim\(roster_flight\.source\)\)/i);
  assert.doesNotMatch(capacityQuery?.text ?? "", /upper\(btrim\(coalesce\(roster_flight\.assignment/i);
  assert.match(
    capacityQuery?.text ?? "",
    /pre_assigned_day_off_windows\.crew_id[\s\S]+active_crew\.crew_id = pre_assigned_day_off_windows\.crew_id/i,
  );
  assert.match(capacityQuery?.text ?? "", /parent_code = 'RES_CALL_TYPE'/i);
  assert.match(capacityQuery?.text ?? "", /pairing_composition\.plan/i);
  assert.match(capacityQuery?.text ?? "", /greatest\(/i);
  assert.equal((requestedSql.match(/actor_scope as/g) ?? []).length, 1);
  assert.equal((requestedSql.match(/scoped_bids as/g) ?? []).length, 1);
  assert.match(requestedSql, /join f8_pbs\.pbs_bid bid/i);
  assert.match(requestedSql, /bid\.bid_context = 'Current'/i);
  assert.match(requestedSql, /bid\.roster_period_id = \$5::bigint/i);
  assert.doesNotMatch(requestedSql, /bid\.period_code = \$5::varchar/i);
  assert.match(requestedSql, /'group'::varchar as source_kind/i);
  assert.match(requestedSql, /'date'::varchar as source_kind/i);
  assert.match(requestedSql, /null::varchar as bid_date/i);
  assert.match(requestedSql, /day_off\.bid_date::text as bid_date/i);
  assert.match(requestedSql, /union all/i);
  assert.match(requestedSql, /bid_group\.property_id = 201/i);
  assert.match(requestedSql, /join f8_pbs\.pbs_bid_day_off day_off/i);
  assert.deepEqual(result, {
    days: [
      {
        date: "2026-04-05",
        requestedDayOffCount: 2,
        totalCrewCount: 120,
        pairingDemandCount: 82,
        reserveDemandCount: 8,
        preAssignedDayOffCount: 10,
        maxDaysOffCount: 20,
      },
      {
        date: "2026-04-06",
        requestedDayOffCount: 3,
        totalCrewCount: 4,
        pairingDemandCount: 5,
        reserveDemandCount: 2,
        preAssignedDayOffCount: 1,
        maxDaysOffCount: 0,
      },
    ],
    warnings: [],
  });
});

test("loadDayOffCapacityRows skips capacity when actor scope is incomplete", async () => {
  const pgPool = {
    async query() {
      return {
        rows: [
          {
            capacity_date: "2026-04-05",
            base_code: null,
            division_code: "C",
            zone_id: "America/Vancouver",
            total_crew_count: "0",
            pairing_demand_count: "0",
            reserve_demand_count: "0",
            pre_assigned_day_off_count: "0",
            max_days_off_count: "0",
          },
        ],
      };
    },
  } as unknown as Pick<Pool, "query">;

  const result = await loadDayOffCapacityRows({
    pgPool,
    schema: "f8",
    pbsSchema: "f8_pbs",
    actor: {
      crewId: "F8030",
      userCode: "casey.crew",
    },
    rangeStart: "2026-04-01",
    rangeEnd: "2026-04-30",
    rosterPeriodId: 42,
    preferOffConfig: partialWeekendConfig,
  });

  assert.deepEqual(result, {
    days: [],
    warnings: [DAY_OFF_CAPACITY_CONTEXT_WARNING],
  });
});

test("loadSafeDayOffCapacityRows keeps the bidding calendar available when live demand lookup fails", async () => {
  const pgPool = {
    async query() {
      throw new Error("live database unavailable");
    },
  } as unknown as Pick<Pool, "query">;

  const result = await loadSafeDayOffCapacityRows({
    pgPool,
    schema: "f8",
    pbsSchema: "f8_pbs",
    actor: {
      crewId: "F8030",
      userCode: "casey.crew",
    },
    rangeStart: "2026-04-01",
    rangeEnd: "2026-04-30",
    rosterPeriodId: 42,
    preferOffConfig: partialWeekendConfig,
  });

  assert.deepEqual(result, {
    days: [],
    warnings: [DAY_OFF_CAPACITY_UNAVAILABLE_WARNING],
  });
});

test("buildPairingEvents skips avoid pairing bids from calendar events", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-avoid",
      groupSeq: 1,
      tier: 1,
      actionId: 2,
      operator: "In",
      paramA: "496002",
      paramB: "2026-04-10",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496002", [buildOccurrence("496002", "2026-04-10")]],
    ]),
  );

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.missingPairingIds, []);
});

test("buildPairingEvents keeps award and skips overlapping avoid pairing events", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-award",
      groupSeq: 1,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "496002",
      paramB: "2026-04-10",
      paramC: null,
    },
    {
      propertyGroupKey: "pairing-property-key-avoid",
      groupSeq: 2,
      tier: 1,
      actionId: 2,
      operator: "In",
      paramA: "451302",
      paramB: "2026-04-10",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496002", [buildOccurrence("496002", "2026-04-10", "M4959", "2026-04-11")]],
      ["451302", [buildOccurrence("451302", "2026-04-10", "C4513", "2026-04-11")]],
    ]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.label, "M4959");
  assert.equal(result.events[0]?.tone, "blue");
  assert.equal(result.events[0]?.metadata?.actionId, 1);
});

test("buildPairingEvents filters entire-month occurrences that touch same-tier day off", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-1",
      groupSeq: 1,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "496001,496002",
      paramB: null,
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496001", [buildOccurrence("496001", "2026-04-03", "M4959", "2026-04-05")]],
      ["496002", [buildOccurrence("496002", "2026-04-10")]],
    ]),
    new Map([[1, new Set(["2026-04-05"])]]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.startDate, "2026-04-10");
  assert.deepEqual(result.missingPairingIds, []);
});

test("buildPairingEvents keeps entire-month occurrences when day off is in another tier", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-1",
      groupSeq: 1,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "496001",
      paramB: null,
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496001", [buildOccurrence("496001", "2026-04-03", "M4959", "2026-04-05")]],
    ]),
    new Map([[2, new Set(["2026-04-05"])]]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.startDate, "2026-04-03");
});

test("buildPairingEvents keeps only the selected origin date for specific-date pairing bids", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-2",
      groupSeq: 2,
      tier: 3,
      actionId: 1,
      operator: "In",
      paramA: "496002",
      paramB: "2026-04-10",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496001", [buildOccurrence("496001", "2026-04-03")]],
      ["496002", [buildOccurrence("496002", "2026-04-10")]],
    ]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.tier, "T3");
  assert.equal(result.events[0]?.startDate, "2026-04-10");
  assert.equal(result.events[0]?.metadata?.occurrenceMode, "specific_date");
  assert.equal(result.events[0]?.metadata?.pairingId, "496002");
});

test("buildPairingEvents does not filter specific-date pairing bids by day off", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-2",
      groupSeq: 2,
      tier: 3,
      actionId: 1,
      operator: "In",
      paramA: "496002",
      paramB: "2026-04-10",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496002", [buildOccurrence("496002", "2026-04-10", "M4959", "2026-04-11")]],
    ]),
    new Map([[3, new Set(["2026-04-10"])]]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.metadata?.occurrenceMode, "specific_date");
});

test("buildPairingEvents groups same-date pairing number bids into one calendar event", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-3",
      groupSeq: 3,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "496001,414601,123401",
      paramB: "2026-04-11",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496001", [buildOccurrence("496001", "2026-04-11", "M4959")]],
      ["414601", [buildOccurrence("414601", "2026-04-11", "V4146")]],
      ["123401", [buildOccurrence("123401", "2026-04-11", "T1234")]],
    ]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.label, "M4959 +2");
  assert.equal(result.events[0]?.metadata?.pairingNumbers, "M4959,T1234,V4146");
  assert.equal(result.events[0]?.metadata?.pairingCount, 3);
  assert.equal(result.events[0]?.metadata?.occurrenceMode, "specific_date");
});

test("buildPairingEvents expands occurrence-list rows with different pairing dates", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-occurrence-list",
      groupSeq: 6,
      tier: 2,
      actionId: 1,
      operator: "In",
      paramA: "496002",
      paramB: "2026-04-10",
      paramC: null,
    },
    {
      propertyGroupKey: "pairing-occurrence-list",
      groupSeq: 6,
      tier: 2,
      actionId: 1,
      operator: "In",
      paramA: "451302",
      paramB: "2026-04-13",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["496002", [buildOccurrence("496002", "2026-04-10", "M4959")]],
      ["451302", [buildOccurrence("451302", "2026-04-13", "C4513")]],
    ]),
  );

  assert.deepEqual(result.events.map((event) => event.label), ["M4959", "C4513"]);
  assert.deepEqual(result.events.map((event) => event.startDate), ["2026-04-10", "2026-04-13"]);
  assert.deepEqual(result.events.map((event) => event.metadata?.propertyGroupKey), [
    "pairing-occurrence-list",
    "pairing-occurrence-list",
  ]);
});

test("buildPairingEvents merges overlapping same-tier pairing events across property rows", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-4",
      groupSeq: 4,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "410101",
      paramB: "2026-04-08",
      paramC: null,
    },
    {
      propertyGroupKey: "pairing-property-key-5",
      groupSeq: 5,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "410201",
      paramB: "2026-04-08",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["410101", [buildOccurrence("410101", "2026-04-08", "C4101", "2026-04-10")]],
      ["410201", [buildOccurrence("410201", "2026-04-08", "C4102")]],
    ]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.label, "C4101 +1");
  assert.equal(result.events[0]?.startDate, "2026-04-08");
  assert.equal(result.events[0]?.endDate, "2026-04-10");
  assert.equal(result.events[0]?.metadata?.propertyGroupKeys, "pairing-property-key-4,pairing-property-key-5");
  assert.equal(result.events[0]?.metadata?.pairingNumbers, "C4101,C4102");
  assert.equal(
    result.events[0]?.metadata?.pairingBidEntries,
    "pairing-property-key-4|C4101|410101|2026-04-08|2026-04-08|2026-04-10; pairing-property-key-5|C4102|410201|2026-04-08|2026-04-08|2026-04-08",
  );
  assert.equal(result.events[0]?.metadata?.pairingCount, 2);
});

test("buildPairingEvents de-duplicates metadata while merging repeated overlapping pairing events", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-duplicate",
      groupSeq: 4,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "410101",
      paramB: "2026-04-08",
      paramC: null,
    },
    {
      propertyGroupKey: "pairing-property-key-duplicate",
      groupSeq: 4,
      tier: 1,
      actionId: 1,
      operator: "In",
      paramA: "410101",
      paramB: "2026-04-08",
      paramC: null,
    },
  ];
  const result = buildPairingEvents(
    bidRows,
    new Map([
      ["410101", [buildOccurrence("410101", "2026-04-08", "C4101", "2026-04-10")]],
    ]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.label, "C4101");
  assert.equal(result.events[0]?.metadata?.propertyGroupKeys, "pairing-property-key-duplicate");
  assert.equal(result.events[0]?.metadata?.pairingNumbers, "C4101");
  assert.equal(
    result.events[0]?.metadata?.pairingBidEntries,
    "pairing-property-key-duplicate|C4101|410101|2026-04-08|2026-04-08|2026-04-10",
  );
  assert.equal(result.events[0]?.metadata?.pairingCount, 1);
});

test("findPairingDayOffConflicts reports pairing coverage by tier and date", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-4",
      groupSeq: 4,
      tier: 2,
      actionId: 1,
      operator: "In",
      paramA: "496001",
      paramB: null,
      paramC: null,
    },
  ];
  const conflicts = findPairingDayOffConflicts(
    bidRows,
    new Map([
      ["496001", [buildOccurrence("496001", "2026-04-03", "M4959", "2026-04-05")]],
    ]),
    new Map([[2, new Set(["2026-04-04"])]]),
  );

  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0], {
    tier: 2,
    date: "2026-04-04",
    pairingNumber: "M4959",
    originDate: "2026-04-03",
    occurrenceMode: "entire_month",
    propertyGroupKey: "pairing-property-key-4",
  });
});

test("findPairingDayOffConflicts ignores avoid pairing bids", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [
    {
      propertyGroupKey: "pairing-property-key-avoid",
      groupSeq: 4,
      tier: 2,
      actionId: 2,
      operator: "In",
      paramA: "496001",
      paramB: null,
      paramC: null,
    },
  ];
  const conflicts = findPairingDayOffConflicts(
    bidRows,
    new Map([
      ["496001", [buildOccurrence("496001", "2026-04-03", "M4959", "2026-04-05")]],
    ]),
    new Map([[2, new Set(["2026-04-04"])]]),
  );

  assert.deepEqual(conflicts, []);
});

test("Weekend conflicts use the actual local interval instead of the whole touched date", () => {
  const bidRows: Parameters<typeof buildPairingEvents>[0] = [{
    propertyGroupKey: "pairing-property-key-weekend",
    groupSeq: 1,
    tier: 1,
    actionId: 1,
    operator: "In",
    paramA: "496001",
    paramB: null,
    paramC: null,
  }];
  const occurrence = buildOccurrence("496001", "2026-04-04", "M4959", "2026-04-04", {
    startLocal: "2026-04-04T08:00:00",
    endLocal: "2026-04-04T12:00:00",
  });
  const weekendIntervals = new Map([[1, [{
    anchorDate: "2026-04-04",
    startDate: "2026-04-04",
    startTime: "18:00",
    endDate: "2026-04-05",
    endTime: "12:00",
    dates: ["2026-04-04", "2026-04-05"],
  }]]]);

  const conflicts = findPairingDayOffConflicts(
    bidRows,
    new Map([["496001", [occurrence]]]),
    new Map([[1, new Set(["2026-04-04", "2026-04-05"])]]),
    weekendIntervals,
  );
  const events = buildPairingEvents(
    bidRows,
    new Map([["496001", [occurrence]]]),
    new Map([[1, new Set(["2026-04-04", "2026-04-05"])]]),
    weekendIntervals,
  );

  assert.deepEqual(conflicts, []);
  assert.equal(events.events.length, 1);
});

test("createPlannedAbsenceEventsLoader caches unavailable source checks", async () => {
  let now = 1_000;
  let queryCount = 0;
  const pgPool = {
    async query() {
      queryCount += 1;
      throw new Error("permission denied");
    },
  };
  const loadPlannedAbsenceEvents = createPlannedAbsenceEventsLoader(pgPool as unknown as Pick<Pool, "query">, "f8", {
    nowMs: () => now,
    ttlMs: 5_000,
  });

  const firstResult = await loadPlannedAbsenceEvents();
  const cachedResult = await loadPlannedAbsenceEvents();

  assert.equal(queryCount, 1);
  assert.deepEqual(firstResult.events, []);
  assert.deepEqual(cachedResult.events, []);
  assert.deepEqual(firstResult.warnings, cachedResult.warnings);

  now += 5_001;
  await loadPlannedAbsenceEvents();

  assert.equal(queryCount, 2);
});

test("createPlannedAbsenceEventsLoader caches available source checks", async () => {
  let now = 1_000;
  let queryCount = 0;
  const pgPool = {
    async query() {
      queryCount += 1;

      return { rows: [] };
    },
  };
  const loadPlannedAbsenceEvents = createPlannedAbsenceEventsLoader(pgPool as unknown as Pick<Pool, "query">, "f8", {
    nowMs: () => now,
    ttlMs: 5_000,
  });

  const firstResult = await loadPlannedAbsenceEvents();
  const cachedResult = await loadPlannedAbsenceEvents();

  assert.equal(queryCount, 1);
  assert.deepEqual(firstResult, {
    events: [],
    warnings: [],
  });
  assert.deepEqual(cachedResult, firstResult);

  now += 5_001;
  await loadPlannedAbsenceEvents();

  assert.equal(queryCount, 2);
});
