import { strict as assert } from "node:assert";
import { test } from "vitest";
import type { Pool } from "pg";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const queryText = (query: unknown): string => {
  const render = (chunk: unknown): string => {
    if (typeof chunk === "string" || typeof chunk === "number") return String(chunk);
    if (typeof chunk !== "object" || chunk === null) return "";
    if ("queryChunks" in chunk) {
      return (chunk as { queryChunks: unknown[] }).queryChunks.map(render).join("");
    }
    if ("value" in chunk) {
      const value = (chunk as { value: unknown }).value;
      return Array.isArray(value) ? value.map(render).join("") : String(value);
    }
    return "";
  };

  return render(query).replace(/\s+/g, " ").trim();
};

test("loadPairingScoreCsv filters Airport Preference layovers before writing pairing counters", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const queryTexts: string[] = [];
  const queryParams: unknown[][] = [];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return {
        rows: [
          {
            crewId: "F8030",
            tier: 1,
            propertyGroupKey: "airport-preference",
            propertyCode: 168,
            legacyPropertyCode: 168,
            actionId: 1,
            operator: "Json",
            paramA: JSON.stringify({
              type: "airport-preference",
              event: "landing_or_layover",
              locations: [{ code: "YVR", kind: "airport" }],
              dateScope: null,
              minimumLayoverDuration: "16:00",
            }),
            paramB: null,
            paramC: null,
            preferenceJson: null,
          },
        ] as T[],
      };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
      queryTexts.push(text);
      queryParams.push(params ?? []);
      return {
        rows: [
          {
            pairingId: "101",
            interfaceId: "PR101",
            division: null,
            actingRanks: [],
          },
        ] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv({
    db,
    pgPool,
    periodCode: "Jun 2026",
    period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });
  const searchQueryIndex = queryTexts.findIndex((text) => /airport_events\.layover_minutes/.test(text));

  assert.ok(searchQueryIndex >= 0);
  assert.match(queryTexts[searchQueryIndex]!, /later_s\.pairing_id = s\.pairing_id/);
  assert.match(queryTexts[searchQueryIndex]!, /later_s\.is_deleted = 0/);
  assert.match(queryTexts[searchQueryIndex]!, /later_s\.duty_seq > s\.duty_seq/);
  assert.deepEqual(queryParams[searchQueryIndex], [["YVR"], 960]);
  assert.match(csv, /^Crew_ID,Pairing_ID,Interface_ID,/);
  assert.match(csv, /F8030,101,PR101,\[\],\[\],1,0,0,0,0,0,0,0,0,0,0,0,0,0/);
});

test("loadPairingScoreCsv scores Efficient and Inefficient flying bands as Award counters", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const databaseQueries: string[] = [];
  const pairingQueries: { text: string; params: unknown[] }[] = [];
  const groupRows = [
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "efficient-flying",
      propertyCode: 428,
      legacyPropertyCode: 428,
      actionId: 1,
      operator: "Json",
      paramA: JSON.stringify({
        type: "efficient-flying-preference",
        mode: "efficient",
      }),
      paramB: null,
      paramC: null,
      preferenceJson: null,
    },
    {
      crewId: "F8040",
      tier: 4,
      propertyGroupKey: "inefficient-flying",
      propertyCode: 428,
      legacyPropertyCode: 428,
      actionId: 1,
      operator: "Json",
      paramA: JSON.stringify({
        type: "efficient-flying-preference",
        mode: "inefficient",
      }),
      paramB: null,
      paramC: null,
      preferenceJson: null,
    },
  ];
  const db = {
    async execute<T>(query: unknown): Promise<{ rows: T[] }> {
      const text = queryText(query);
      databaseQueries.push(text);

      if (text.includes("PBS_EFFICIENT_FLYING_CONFIG")) {
        return { rows: [{ codeValue: "20" }] as T[] };
      }

      return { rows: groupRows as T[] };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      pairingQueries.push({ text, params });
      return {
        rows: [
          {
            pairingId: "501001",
            interfaceId: "C4104",
            base: "YEG",
            localOriginDate: "2026-07-03",
            localDayStartUtc: "2026-07-03T06:00:00.000Z",
            localDayEndUtc: "2026-07-04T06:00:00.000Z",
            division: "737",
            actingRanks: ["CA"],
            averageDailyCredit: "510",
            isEfficient: true,
            isInefficient: false,
          },
          {
            pairingId: "501002",
            interfaceId: "C4105",
            base: "YEG",
            localOriginDate: "2026-07-04",
            localDayStartUtc: "2026-07-04T06:00:00.000Z",
            localDayEndUtc: "2026-07-05T06:00:00.000Z",
            division: "737",
            actingRanks: ["CA"],
            averageDailyCredit: "120",
            isEfficient: false,
            isInefficient: true,
          },
        ] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv({
    db,
    pgPool,
    periodCode: "Jul 2026",
    period: { rosterPeriodId: 7, rosterPeriodKey: "2026RP07", periodCode: "Jul 2026", rpStartLocal: "2026-07-01", rpEndLocal: "2026-07-30" },
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  assert.equal(databaseQueries.filter((text) => text.includes("PBS_EFFICIENT_FLYING_CONFIG")).length, 1);
  assert.equal(pairingQueries.length, 1);
  assert.deepEqual(pairingQueries[0]!.params, ["2026-07-01", "2026-07-30", 20]);
  assert.match(pairingQueries[0]!.text, /distinct on \(credit_segment\.duty_seq\)/);
  assert.match(
    pairingQueries[0]!.text,
    /order by credit_segment\.duty_seq asc, credit_segment\.seg_seq asc/,
  );
  assert.doesNotMatch(pairingQueries[0]!.text, /act_credited_minutes_seg/);
  assert.match(pairingQueries[0]!.text, /upper\(btrim\(p\.assignment_group\)\) = 'FLY'/);
  assert.match(pairingQueries[0]!.text, /p\.duration_days > 0/);
  assert.match(pairingQueries[0]!.text, /round\(count\(\*\)::numeric \* \$3::numeric \/ 100\)/);
  assert.match(pairingQueries[0]!.text, /average_daily_credit >= cutoffs\.efficient_cutoff/);
  assert.match(pairingQueries[0]!.text, /average_daily_credit <= cutoffs\.inefficient_cutoff/);
  assert.match(csv, /F8030,501001,C4104,\[\],\[\],0,0,1,0/);
  assert.match(csv, /F8040,501002,C4105,\[\],\[\],0,0,0,0,0,0,1,0/);
  assert.doesNotMatch(csv, /F8030,501002/);
  assert.doesNotMatch(csv, /F8040,501001/);
});

test("loadPairingScoreCsv fails explicitly when Efficient Flying company config is invalid", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const db = {
    async execute<T>(query: unknown): Promise<{ rows: T[] }> {
      if (queryText(query).includes("PBS_EFFICIENT_FLYING_CONFIG")) {
        return { rows: [{ codeValue: "0" }] as T[] };
      }

      return {
        rows: [{
          crewId: "F8030",
          tier: 1,
          propertyGroupKey: "efficient-flying",
          propertyCode: 428,
          legacyPropertyCode: 428,
          actionId: 1,
          operator: "Json",
          paramA: JSON.stringify({
            type: "efficient-flying-preference",
            mode: "efficient",
          }),
          paramB: null,
          paramC: null,
          preferenceJson: null,
        }] as T[],
      };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(): Promise<{ rows: T[] }> {
      throw new Error("Pairing query must not run when config is invalid.");
    },
  } as unknown as Pool;

  await assert.rejects(
    loadPairingScoreCsv({
      db,
      pgPool,
      periodCode: "Jul 2026",
      period: { rosterPeriodId: 7, rosterPeriodKey: "2026RP07", periodCode: "Jul 2026", rpStartLocal: "2026-07-01", rpEndLocal: "2026-07-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
    }),
    /integer PBS_EFFICIENT_FLYING_CONFIG PERCENTILE value from 1 to 50/,
  );
});

test("loadPairingScoreCsv keeps Avoid Redeye matching positive before writing the avoid counter", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const queryTexts: string[] = [];
  const queryParams: unknown[][] = [];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return {
        rows: [{
          crewId: "F8030",
          tier: 1,
          propertyGroupKey: "redeye-preference",
          propertyCode: 117,
          legacyPropertyCode: 117,
          actionId: 2,
          operator: "Json",
          paramA: JSON.stringify({
            type: "redeye-preference",
            dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
          }),
          paramB: null,
          paramC: null,
          preferenceJson: null,
        }] as T[],
      };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
      queryTexts.push(text);
      queryParams.push(params ?? []);

      if (/from f8\.dictionary/.test(text)) {
        return {
          rows: [
            { code: "START_TIME", code_value: "23:00" },
            { code: "END_TIME", code_value: "05:00" },
          ] as T[],
        };
      }

      return { rows: [{ pairingId: "101", interfaceId: "PR101", division: null, actingRanks: [] }] as T[] };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv({
    db,
    pgPool,
    periodCode: "Jun 2026",
    period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });
  const dictionaryQueryIndexes = queryTexts
    .map((text, index) => (/from f8\.dictionary/.test(text) ? index : -1))
    .filter((index) => index >= 0);
  const searchQueryIndex = queryTexts.findIndex((text) => /redeye_windows\.redeye_date/.test(text));

  assert.deepEqual(dictionaryQueryIndexes, [0]);
  assert.deepEqual(queryParams[dictionaryQueryIndexes[0]!], [
    "PBS_PAIRING_REDEYE_CONFIG",
    ["START_TIME", "END_TIME"],
  ]);
  assert.ok(searchQueryIndex >= 0);
  assert.match(queryTexts[searchQueryIndex]!, /redeye_windows\.redeye_date \+ \$2::time/);
  assert.match(queryTexts[searchQueryIndex]!, /redeye_windows\.redeye_date \+ \$3::time\) \+ interval '1 day'/);
  assert.doesNotMatch(queryTexts[searchQueryIndex]!, /and\s+not\s+\(/);
  assert.deepEqual(queryParams[searchQueryIndex], [
    ["2026-06-03", "2026-06-18"],
    "23:00",
    "05:00",
  ]);
  assert.match(csv, /F8030,101,PR101,\[\],\[\],0,1/);
});

test("loadPairingScoreCsv keeps Avoid Deadhead Flying matching positive with flight dates", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const queryTexts: string[] = [];
  const queryParams: unknown[][] = [];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return {
        rows: [{
          crewId: "F8030",
          tier: 1,
          propertyGroupKey: "deadhead-flying",
          propertyCode: 122,
          legacyPropertyCode: 122,
          actionId: 2,
          operator: "Json",
          paramA: JSON.stringify({
            type: "deadhead-flying",
            mode: "any-deadhead",
            dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
          }),
          paramB: null,
          paramC: null,
          preferenceJson: null,
        }] as T[],
      };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
      queryTexts.push(text);
      queryParams.push(params ?? []);
      return { rows: [{ pairingId: "101", interfaceId: "PR101", division: null, actingRanks: [] }] as T[] };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv({
    db,
    pgPool,
    periodCode: "Jun 2026",
    period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });
  const searchQueryIndex = queryTexts.findIndex((text) => /s\.seg_assignment = 'DHD'/.test(text));

  assert.ok(searchQueryIndex >= 0);
  assert.match(queryTexts[searchQueryIndex]!, /s\.flt_dt = any\(\$1::date\[\]\)/);
  assert.doesNotMatch(queryTexts[searchQueryIndex]!, /and\s+not\s+\(/);
  assert.deepEqual(queryParams[searchQueryIndex], [["2026-06-03", "2026-06-18"]]);
  assert.match(csv, /F8030,101,PR101,\[\],\[\],0,1/);
});

test("loadPairingScoreCsv exports Pairing Preference from selected stable pairing ids", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const queries: { text: string; params: unknown[] }[] = [];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return {
        rows: [{
          crewId: "F8030",
          tier: 1,
          propertyGroupKey: "pairing-preference",
          propertyCode: 102,
          legacyPropertyCode: 102,
          actionId: 1,
          operator: "Json",
          paramA: JSON.stringify({
            type: "pairing-preference",
            pairingIds: ["496001", "496002"],
            pairingLabels: ["PR141", "PR142"],
          }),
          paramB: null,
          paramC: null,
          preferenceJson: null,
        }] as T[],
      };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      queries.push({ text, params });
      return {
        rows: [
          { pairingId: "496001", interfaceId: "PR141", division: null, actingRanks: [] },
          { pairingId: "496002", interfaceId: "PR142", division: null, actingRanks: [] },
        ] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv({
    db,
    pgPool,
    periodCode: "Jun 2026",
    period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /p\.id = any\(\$1::bigint\[\]\)/);
  assert.deepEqual(queries[0]!.params[0], ["496001", "496002"]);
  assert.match(csv, /F8030,496001,PR141,\[\],\[\],1,0/);
  assert.match(csv, /F8030,496002,PR142,\[\],\[\],1,0/);
});

test("loadPairingScoreCsv scores only Pairing Length specific start dates", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const queries: { text: string; params: unknown[] }[] = [];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return {
        rows: [{
          crewId: "F8030",
          tier: 1,
          propertyGroupKey: "pairing-length",
          propertyCode: 112,
          legacyPropertyCode: 112,
          actionId: 1,
          operator: "Json",
          paramA: JSON.stringify({
            type: "pairing-length-preference",
            minDays: 1,
            maxDays: 3,
            dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
            min: 1,
            max: 7,
          }),
          paramB: null,
          paramC: null,
          preferenceJson: null,
        }] as T[],
      };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      queries.push({ text, params });
      return {
        rows: [
          { pairingId: "103", interfaceId: "PR103", division: null, actingRanks: [] },
          { pairingId: "118", interfaceId: "PR118", division: null, actingRanks: [] },
        ] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv({
    db,
    pgPool,
    periodCode: "Jun 2026",
    period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0]!.text, /pbs_calendar_days/);
  assert.match(queries[0]!.text, /p\.tafb between \$1 and \$2/);
  assert.doesNotMatch(queries[0]!.text, /p\.duration_days between/);
  assert.match(queries[0]!.text, /\)::date = any\(\$3::date\[\]\)/);
  assert.deepEqual(queries[0]!.params, [1, 3, ["2026-06-03", "2026-06-18"]]);
  assert.match(csv, /F8030,103,PR103,\[\],\[\],1,0/);
  assert.match(csv, /F8030,118,PR118,\[\],\[\],1,0/);
  assert.doesNotMatch(csv, /F8030,110,PR110/);
});

test("loadPairingScoreCsv excludes TB8549 and keeps only date-qualified crew pairings", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const queries: string[] = [];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return {
        rows: [{
          crewId: "844",
          tier: 4,
          propertyGroupKey: "pairing-length",
          propertyCode: 112,
          legacyPropertyCode: 112,
          actionId: 1,
          operator: "Json",
          paramA: JSON.stringify({
            type: "pairing-length-preference",
            minDays: null,
            maxDays: 1,
            dateScope: null,
          }),
          paramB: null,
          paramC: null,
          preferenceJson: null,
        }] as T[],
      };
    },
  } as unknown as LoadPairingScoreCsvOptions["db"];
  const pgPool = {
    async query<T>(text: string): Promise<{ rows: T[] }> {
      queries.push(text);
      return {
        rows: [
          {
            pairingId: "147759",
            interfaceId: "115491",
            base: "YYZ",
            localOriginDate: "2026-07-01",
            localDayStartUtc: "2026-07-01T04:00:00.000Z",
            localDayEndUtc: "2026-07-02T04:00:00.000Z",
            division: "C",
            actingRanks: ["IFD"],
          },
          {
            pairingId: "147760",
            interfaceId: "115492",
            base: "YYC",
            localOriginDate: "2026-07-01",
            localDayStartUtc: "2026-07-01T06:00:00.000Z",
            localDayEndUtc: "2026-07-02T06:00:00.000Z",
            division: "P",
            actingRanks: ["CA"],
          },
          {
            pairingId: "147761",
            interfaceId: "115493",
            base: "YYC",
            localOriginDate: "2026-06-30",
            localDayStartUtc: "2026-06-30T06:00:00.000Z",
            localDayEndUtc: "2026-07-01T06:00:00.000Z",
            division: "P",
            actingRanks: ["CA"],
          },
        ] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv({
    db,
    pgPool,
    periodCode: "Jul 2026",
    period: { rosterPeriodId: 7, rosterPeriodKey: "2026RP07", periodCode: "Jul 2026", rpStartLocal: "2026-07-01", rpEndLocal: "2026-07-30" },
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
    pairingFilter: {
      dateStart: "2026-07-01",
      dateEnd: "2026-07-31",
      datePadDays: 0,
    },
    crewEligibility: new Map([
      ["844", {
        bases: [{
          id: "10",
          base: "YYC",
          effectiveAt: "2026-07-01T06:00:00.000Z",
          expiresAt: null,
        }],
        ranks: [{
          rank: "CA",
          effectiveAt: "2026-07-01T06:00:00.000Z",
          expiresAt: null,
        }],
      }],
    ]),
  });

  assert.match(queries[0]!, /upper\(btrim\(p\.assignment_group\)\) = 'FLY'/);
  assert.match(queries[0]!, /join lateral \(\s*select min\(coalesce/);
  assert.match(queries[0]!, /pairing_origin\.local_origin_date between \$2::date and \$3::date/);
  assert.doesNotMatch(csv, /844,147759,115491/);
  assert.doesNotMatch(csv, /844,147761,115493/);
  assert.match(csv, /844,147760,115492,\[\],\[\],0,0,0,0,0,0,1,0/);
});

test("loadPairingScoreCsv exports current check-time, legs, carryover and legacy pairing-length bids", async () => {
  const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
  type LoadPairingScoreCsvOptions = Parameters<typeof loadPairingScoreCsv>[0];
  const cases = [
    {
      row: {
        propertyGroupKey: "pairing-check-time",
        propertyCode: 103,
        legacyPropertyCode: 103,
        operator: "Json",
        paramA: JSON.stringify({
          type: "pairing-check-time",
          timeType: "check_in",
          operator: ">",
          value: "08:00",
          dateScope: { mode: "specific_dates", dates: ["2026-06-15", "2026-06-18"] },
        }),
        paramB: null,
        paramC: null,
      },
      sqlPattern: /event_airport\.airport = s\.dep_arp/,
      params: ["08:00", ["2026-06-15", "2026-06-18"]],
    },
    {
      row: {
        propertyGroupKey: "flight-legs-per-duty",
        propertyCode: 107,
        legacyPropertyCode: 107,
        operator: "Json",
        paramA: JSON.stringify({
          type: "flight-legs-per-duty",
          operator: "Between",
          from: 2,
          to: 4,
          dateScope: { mode: "specific_dates", dates: ["2026-06-15", "2026-06-18"] },
        }),
        paramB: null,
        paramC: "any",
      },
      sqlPattern: /duty_counts\.event_date = any/,
      params: [2, 4, ["2026-06-15", "2026-06-18"]],
    },
    {
      row: {
        propertyGroupKey: "month-end-carryover",
        propertyCode: 163,
        legacyPropertyCode: 163,
        operator: "Json",
        paramA: JSON.stringify({ type: "month-end-carryover", operator: "Between", from: 2, to: 4 }),
        paramB: null,
        paramC: null,
      },
      sqlPattern: /between \$2 and \$3/,
      params: ["2026-06-30", 2, 4, ["YYZ"]],
    },
    {
      row: {
        propertyGroupKey: "legacy-pairing-length",
        propertyCode: 112,
        legacyPropertyCode: 112,
        operator: "Between",
        paramA: "1",
        paramB: "3",
        paramC: null,
      },
      sqlPattern: /p\.tafb between \$1 and \$2/,
      params: [1, 3],
    },
  ] as const;

  for (const testCase of cases) {
    const queries: { text: string; params: unknown[] }[] = [];
    const db = {
      async execute<T>(): Promise<{ rows: T[] }> {
        return {
          rows: [{
            crewId: "F8030",
            tier: 1,
            actionId: 1,
            preferenceJson: null,
            ...testCase.row,
          }] as T[],
        };
      },
    } as unknown as LoadPairingScoreCsvOptions["db"];
    const pgPool = {
      async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
        queries.push({ text, params });

        if (text.includes('as "zoneId"')) {
          return { rows: [{ base: "YYZ", zoneId: "America/Toronto" }] as T[] };
        }

        return { rows: [{ pairingId: "496001", interfaceId: "PR141", division: null, actingRanks: [] }] as T[] };
      },
    } as unknown as Pool;

    const csv = await loadPairingScoreCsv({
      db,
      pgPool,
      periodCode: "Jun 2026",
      period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
    });

    const pairingQueries = queries.filter((query) => /from f8\.pairing p\s/.test(query.text));

    assert.equal(pairingQueries.length, 1, `property ${testCase.row.propertyCode}`);
    assert.equal(queries.length, testCase.row.propertyCode === 163 ? 2 : 1);
    assert.match(pairingQueries[0]!.text, testCase.sqlPattern);
    assert.deepEqual(pairingQueries[0]!.params, testCase.params);
    if (testCase.row.propertyCode === 163) {
      assert.match(queries[0]!.text, /from f8\.pairing pairing_base_source/);
      assert.match(queries[0]!.text, /pg_timezone_names pairing_base_tz/);
      assert.match(pairingQueries[0]!.text, /at time zone 'America\/Toronto'/);
      assert.match(pairingQueries[0]!.text, /upper\(btrim\(p\.base\)\) = any\(\$4::varchar\[\]\)/);
      assert.match(pairingQueries[0]!.text, /month_end_carryover\.carry_out_days/);
      assert.equal(
        pairingQueries[0]!.text.match(/pairing_base_airport/g)?.length ?? 0,
        0,
        "the matching query should use the preloaded base-zone case expression",
      );
      assert.equal(
        pairingQueries[0]!.text.match(/as carry_out_days\s*\) month_end_carryover/g)?.length,
        1,
        "carry_out_days should be calculated once per pairing",
      );
    }
    assert.match(csv, /F8030,496001,PR141,\[\],\[\],1,0/);
  }
});
