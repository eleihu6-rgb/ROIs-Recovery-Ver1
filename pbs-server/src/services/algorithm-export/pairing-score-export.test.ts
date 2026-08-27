import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  buildPairingScoreCsvFromMatches,
  loadPairingScoreCsv,
  type PairingScoreSkippedProperty,
} from "./pairing-score-export.js";

const pairingScoreHeader = [
  "Crew_ID",
  "Pairing_ID",
  "Interface_ID",
  "Award_Higher_Credit_Tiers",
  "Avoid_Higher_Credit_Tiers",
  "T1_Award_Counter",
  "T1_Avoid_Counter",
  "T2_Award_Counter",
  "T2_Avoid_Counter",
  "T3_Award_Counter",
  "T3_Avoid_Counter",
  "T4_Award_Counter",
  "T4_Avoid_Counter",
  "T5_Award_Counter",
  "T5_Avoid_Counter",
  "T6_Award_Counter",
  "T6_Avoid_Counter",
  "T7_Award_Counter",
  "T7_Avoid_Counter",
].join(",");

test("buildPairingScoreCsvFromMatches outputs only matched pairings and increments repeated hits", () => {
  const csv = buildPairingScoreCsvFromMatches([
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 1,
      action: "award",
    },
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 1,
      action: "award",
    },
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 3,
      action: "avoid",
    },
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 8,
      action: "avoid",
    },
  ]);

  assert.equal(csv, [
    pairingScoreHeader,
    "F8030,496001,OLD-496001,[],[],2,0,0,0,0,1,0,0,0,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("buildPairingScoreCsvFromMatches returns only the header when nothing matches", () => {
  assert.equal(buildPairingScoreCsvFromMatches([]), `${pairingScoreHeader}\n`);
});

test("buildPairingScoreCsvFromMatches maps explicit higher and lower credit priority tiers", () => {
  const csv = buildPairingScoreCsvFromMatches([
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 1,
      action: "award",
      creditPriority: "higher",
    },
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 2,
      action: "avoid",
      creditPriority: "higher",
    },
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 3,
      action: "award",
      creditPriority: "lower",
    },
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 4,
      action: "avoid",
      creditPriority: "lower",
    },
    {
      crewId: "F8030",
      pairingId: "496001",
      interfaceId: "OLD-496001",
      tier: 5,
      action: "award",
    },
  ]);

  assert.equal(csv, [
    pairingScoreHeader,
    "F8030,496001,OLD-496001,\"[1,4]\",\"[2,3]\",1,0,0,1,1,0,0,1,1,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("buildPairingScoreCsvFromMatches can sort crew by export scope rank", () => {
  const csv = buildPairingScoreCsvFromMatches([
    {
      crewId: "LOW",
      pairingId: "2",
      interfaceId: null,
      tier: 1,
      action: "award",
    },
    {
      crewId: "HIGH",
      pairingId: "1",
      interfaceId: null,
      tier: 1,
      action: "award",
    },
  ], {
    crewSortRank: new Map([
      ["HIGH", 0],
      ["LOW", 1],
    ]),
  });

  assert.equal(csv, [
    pairingScoreHeader,
    "HIGH,1,,[],[],1,0,0,0,0,0,0,0,0,0,0,0,0,0",
    "LOW,2,,[],[],1,0,0,0,0,0,0,0,0,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("loadPairingScoreCsv searches supported pairing properties and skips unsupported ones", async () => {
  const skippedProperties: PairingScoreSkippedProperty[] = [];
  const groupRows = [
    {
      crewId: "F8030",
      tier: 1,
      propertyGroupKey: "flight-number",
      propertyCode: 116,
      legacyPropertyCode: 116,
      actionId: 2,
      operator: "Json",
      paramA: JSON.stringify({
        type: "flight-number-preference",
        flightNumbers: ["F8123"],
        dateScope: null,
      }),
      paramB: null,
      paramC: null,
      preferenceJson: { creditPriority: "higher" },
    },
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "unsupported",
      propertyCode: 999,
      legacyPropertyCode: 999,
      actionId: 2,
      operator: "In",
      paramA: "X",
      paramB: null,
      paramC: null,
      preferenceJson: null,
    },
  ];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const queryCalls: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queryCalls.push({ text, values });
      return {
        rows: [{
          pairingId: "496001",
          interfaceId: "OLD-496001",
        }] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
    onSkippedProperty: (event: PairingScoreSkippedProperty) => skippedProperties.push(event),
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(queryCalls.length, 1);
  assert.deepEqual(queryCalls[0]!.values[0], ["F8123"]);
  assert.match(queryCalls[0]!.text, /upper\(btrim\(s\.flt_num\)\) = any/);
  assert.match(queryCalls[0]!.text, /seg_assignment.*in \('FLT', 'FLY'\)/);
  assert.doesNotMatch(queryCalls[0]!.text, /and\s+not\s+\(/);
  // Without a pairingFilter the bid search carries no scenario-scope WHERE narrowing
  // (the division/composition columns still appear in the SELECT for per-crew refinement).
  assert.doesNotMatch(queryCalls[0]!.text, /coalesce\(p\.pairing_dt|p\.base = any|p\.division = any/);
  assert.equal(csv, [
    pairingScoreHeader,
    "F8030,496001,OLD-496001,[],[],0,1,0,0,0,0,0,0,0,0,0,0,0,0",
    "",
  ].join("\n"));
  assert.deepEqual(skippedProperties, [{
    crewId: "F8030",
    periodCode: "Jun 2026",
    propertyCode: 999,
    propertyGroupKey: "unsupported",
    reason: "Unsupported pairing property code.",
  }]);
});

test("loadPairingScoreCsv filters Airport Preference with non-final landing events", async () => {
  const groupRows = [{
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
  }];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const queryCalls: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queryCalls.push({ text, values });
      return {
        rows: [{
          pairingId: "496001",
          interfaceId: "OLD-496001",
          division: null,
          actingRanks: [],
        }] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);
  const searchCall = queryCalls.find((call) => /airport_events\.layover_minutes/.test(call.text));

  assert.ok(searchCall);
  assert.match(searchCall.text, /later_s\.pairing_id = s\.pairing_id/);
  assert.match(searchCall.text, /later_s\.is_deleted = 0/);
  assert.match(searchCall.text, /later_s\.duty_seq > s\.duty_seq/);
  assert.deepEqual(searchCall.values, [["YVR"], 960]);
  assert.equal(csv, [
    pairingScoreHeader,
    "F8030,496001,OLD-496001,[],[],1,0,0,0,0,0,0,0,0,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("loadPairingScoreCsv keeps Avoid Redeye matching positive before writing the avoid counter", async () => {
  const groupRows = [{
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
  }];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const queryCalls: { text: string; values: unknown[] }[] = [];
  let dictionaryQueryCount = 0;
  const pgPool = {
    async query<T>(
      query: string | { text: string; values?: unknown[] },
      queryValues?: unknown[],
    ): Promise<{ rows: T[] }> {
      const text = typeof query === "string" ? query : query.text;
      const values = typeof query === "string" ? queryValues ?? [] : query.values ?? [];

      if (/dictionary/.test(text)) {
        dictionaryQueryCount += 1;
        return {
          rows: [
            ["PBS_PAIRING_REDEYE_CONFIG", "START_TIME", "23:00"],
            ["PBS_PAIRING_REDEYE_CONFIG", "END_TIME", "05:00"],
          ] as T[],
        };
      }

      queryCalls.push({ text, values });
      return { rows: [{ pairingId: "496001", interfaceId: "OLD-496001" }] as T[] };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(dictionaryQueryCount, 1);
  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0]!.text, /redeye_windows\.redeye_date \+ \$2::time/);
  assert.match(queryCalls[0]!.text, /redeye_windows\.redeye_date \+ \$3::time\) \+ interval '1 day'/);
  assert.match(queryCalls[0]!.text, /redeye_windows\.redeye_date = any\(\$1::date\[\]\)/);
  assert.doesNotMatch(queryCalls[0]!.text, /and\s+not\s+\(/);
  assert.deepEqual(queryCalls[0]!.values, [
    ["2026-06-03", "2026-06-18"],
    "23:00",
    "05:00",
  ]);
  assert.match(csv, /F8030,496001,OLD-496001,\[\],\[\],0,1/);
});

test("loadPairingScoreCsv skips Redeye explicitly when dictionary configuration is unavailable", async () => {
  const groupRows = [{
    crewId: "F8030",
    tier: 1,
    propertyGroupKey: "redeye-preference",
    propertyCode: 117,
    legacyPropertyCode: 117,
    actionId: 1,
    operator: "Json",
    paramA: JSON.stringify({
      type: "redeye-preference",
      dateScope: { mode: "specific_dates", dates: ["2026-06-03"] },
    }),
    paramB: null,
    paramC: null,
    preferenceJson: null,
  }];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const skippedProperties: PairingScoreSkippedProperty[] = [];
  let dictionaryQueryCount = 0;
  let pairingQueryCount = 0;
  const pgPool = {
    async query<T>(query: string | { text: string }): Promise<{ rows: T[] }> {
      const text = typeof query === "string" ? query : query.text;

      if (/dictionary/.test(text)) {
        dictionaryQueryCount += 1;
        return { rows: [] };
      }

      pairingQueryCount += 1;
      return { rows: [] };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
    onSkippedProperty: (event: PairingScoreSkippedProperty) => skippedProperties.push(event),
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(dictionaryQueryCount, 1);
  assert.equal(pairingQueryCount, 0);
  assert.equal(csv, `${pairingScoreHeader}\n`);
  assert.deepEqual(skippedProperties, [{
    crewId: "F8030",
    periodCode: "Jun 2026",
    propertyCode: 117,
    propertyGroupKey: "redeye-preference",
    reason: "Redeye configuration is unavailable for Redeye Preference.",
  }]);
});

test("loadPairingScoreCsv keeps Avoid Deadhead Flying matching positive with flight dates", async () => {
  const groupRows = [{
    crewId: "F8030",
    tier: 1,
    propertyGroupKey: "deadhead-flying",
    propertyCode: 122,
    legacyPropertyCode: 122,
    actionId: 2,
    operator: "Json",
    paramA: JSON.stringify({
      type: "deadhead-flying",
      mode: "deadhead-only-duty",
      dateScope: { mode: "date_range", from: "2026-06-10", to: "2026-06-12" },
    }),
    paramB: null,
    paramC: null,
    preferenceJson: null,
  }];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const queryCalls: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queryCalls.push({ text, values });
      return { rows: [{ pairingId: "496001", interfaceId: "OLD-496001" }] as T[] };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0]!.text, /group by s\.duty_seq/);
  assert.match(queryCalls[0]!.text, /bool_or\(s\.flt_dt between \$1::date and \$2::date\)/);
  assert.doesNotMatch(queryCalls[0]!.text, /and\s+not\s+\(/);
  assert.deepEqual(queryCalls[0]!.values, ["2026-06-10", "2026-06-12"]);
  assert.match(csv, /F8030,496001,OLD-496001,\[\],\[\],0,1/);
});

test("loadPairingScoreCsv exports pairing check-time bids with multi-date local event filtering", async () => {
  const groupRows = [{
    crewId: "F8030",
    tier: 1,
    propertyGroupKey: "pairing-check-time",
    propertyCode: 103,
    legacyPropertyCode: 103,
    actionId: 1,
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
    preferenceJson: null,
  }];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const queryCalls: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queryCalls.push({ text, values });
      return { rows: [{ pairingId: "496001", interfaceId: "OLD-496001" }] as T[] };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0]!.text, /event_airport\.airport = s\.dep_arp/);
  assert.match(queryCalls[0]!.text, /pg_timezone_names/);
  assert.match(queryCalls[0]!.text, /= any\(\$2::date\[\]\)/);
  assert.deepEqual(queryCalls[0]!.values, ["08:00", ["2026-06-15", "2026-06-18"]]);
  assert.match(csv, /F8030,496001,OLD-496001/);
});

test("loadPairingScoreCsv exports Flight Legs per Duty Between with local duty event dates", async () => {
  const groupRows = [{
    crewId: "F8030",
    tier: 1,
    propertyGroupKey: "flight-legs-per-duty",
    propertyCode: 107,
    legacyPropertyCode: 107,
    actionId: 1,
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
    preferenceJson: null,
  }];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const queryCalls: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queryCalls.push({ text, values });
      return { rows: [{ pairingId: "496001", interfaceId: "OLD-496001" }] as T[] };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0]!.text, /seg_assignment/);
  assert.match(queryCalls[0]!.text, /in \('FLT', 'FLY'\)/);
  assert.match(queryCalls[0]!.text, /event_segment\.dep_arp/);
  assert.match(queryCalls[0]!.text, /duty_counts\.event_date = any/);
  assert.deepEqual(queryCalls[0]!.values, [2, 4, ["2026-06-15", "2026-06-18"]]);
  assert.match(csv, /F8030,496001,OLD-496001/);
});

test("loadPairingScoreCsv narrows the bid search by scenario window, base and division/rank", async () => {
  const groupRows = [
    {
      crewId: "F8030",
      tier: 1,
      propertyGroupKey: "flight-number",
      propertyCode: 116,
      legacyPropertyCode: 116,
      actionId: 1,
      operator: "Json",
      paramA: JSON.stringify({
        type: "flight-number-preference",
        flightNumbers: ["F8123"],
        dateScope: null,
      }),
      paramB: null,
      paramC: null,
      preferenceJson: null,
    },
  ];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  const queryCalls: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queryCalls.push({ text, values });
      return { rows: [{ pairingId: "496001", interfaceId: "OLD-496001" }] as T[] };
    },
  } as unknown as Pool;

  await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
    pairingFilter: {
      dateStart: "2026-06-01",
      dateEnd: "2026-06-30",
      bases: ["YVR"],
      divisions: ["P"],
      ranks: ["CA", "FO"],
    },
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(queryCalls.length, 1);
  const { text, values } = queryCalls[0]!;
  // req 1: pairing date bounded to the scenario window padded ±7 days.
  assert.match(text, /coalesce\(p\.pairing_dt, \(p\.sch_str_dt_utc at time zone 'UTC'\)::date\)\s+between/);
  // req 2: pairing base must be one of the scope crews' bases.
  assert.match(text, /p\.base = any\(\$\d+::varchar\[\]\)/);
  // req 4 coarse pre-filter: composition acting_rank match OR pairing division match.
  assert.match(text, /p\.division = any\(\$\d+::varchar\[\]\) or exists \(select 1 from f8\.pairing_composition pc/);
  // The row carries the pairing's division + composition ranks for the per-crew refinement.
  assert.match(text, /p\.division::varchar as "division"/);
  assert.match(text, /array_agg\(distinct pc\.acting_rank\)/);
  // Filter params follow the bid condition's flight list, then scenario scope values.
  assert.deepEqual(values, [
    ["F8123"],
    "2026-05-25",
    "2026-07-07",
    ["YVR"],
    ["P"],
    ["CA", "FO"],
  ]);
});

test("loadPairingScoreCsv per-crew refinement keeps a crew only on rank-matching pairings", async () => {
  // Both a CA and an FO bid the same property → the same two candidate pilot pairings:
  // one needs a CA, one needs only an FO. The per-crew refinement must score the CA on
  // the CA-needing pairing only, and the FO on the FO-only pairing only — even though
  // both pairings are division 'P' (a plain division match would keep both for both).
  const groupRows = ["CA1", "FO1"].map((crewId) => ({
    crewId,
    tier: 1,
    propertyGroupKey: "flight-number",
    propertyCode: 116,
    legacyPropertyCode: 116,
    actionId: 1,
    operator: "Json",
    paramA: JSON.stringify({
      type: "flight-number-preference",
      flightNumbers: ["F8123"],
      dateScope: null,
    }),
    paramB: null,
    paramC: null,
    preferenceJson: null,
  }));
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  let queryCount = 0;
  const pgPool = {
    async query<T>(): Promise<{ rows: T[] }> {
      queryCount += 1;
      return {
        rows: [
          { pairingId: "1001", interfaceId: null, division: "P", actingRanks: ["CA"] },
          { pairingId: "1002", interfaceId: null, division: "P", actingRanks: ["FO"] },
        ] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
    crewEligibility: new Map([
      ["CA1", { division: "P", ranks: new Set(["CA"]) }],
      ["FO1", { division: "P", ranks: new Set(["FO"]) }],
    ]),
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  // The candidate query is cached across the two crew (one distinct condition).
  assert.equal(queryCount, 1);
  assert.equal(csv, [
    pairingScoreHeader,
    "CA1,1001,,[],[],1,0,0,0,0,0,0,0,0,0,0,0,0,0",
    "FO1,1002,,[],[],1,0,0,0,0,0,0,0,0,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("loadPairingScoreCsv exports Pairing Preference from selected stable pairing ids", async () => {
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
  };
  const queries: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queries.push({ text, values });
      return {
        rows: [
          { pairingId: "496001", interfaceId: "PR141", division: null, actingRanks: [] },
          { pairingId: "496002", interfaceId: "PR142", division: null, actingRanks: [] },
        ] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /p\.id = any\(\$1::bigint\[\]\)/);
  assert.deepEqual(queries[0]!.values[0], ["496001", "496002"]);
  assert.match(csv, /F8030,496001,PR141,\[\],\[\],1,0/);
  assert.match(csv, /F8030,496002,PR142,\[\],\[\],1,0/);
});

test("loadPairingScoreCsv renders the Efficient Flying cohort as one top-level CTE", async () => {
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
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
  };
  const queries: { text: string; values: unknown[] }[] = [];
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queries.push({ text, values });

      if (/from f8\.dictionary/i.test(text)) {
        return { rows: [{ code_value: "20" }] as T[] };
      }

      return {
        rows: [{
          pairingId: "496001",
          interfaceId: "PR141",
          division: "P",
          actingRanks: ["CA"],
        }] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadPairingScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadPairingScoreCsv>[0]);

  assert.equal(queries.length, 2);
  const pairingQuery = queries[1]!;
  assert.match(pairingQuery.text, /^\s*with pairing_search_1_efficient_scoped as materialized/i);
  assert.equal((pairingQuery.text.match(/efficient_scoped as materialized/gi) ?? []).length, 1);
  assert.match(pairingQuery.text, /pairing_search_1_efficient_matches as materialized/i);
  assert.match(pairingQuery.text, /efficient_match\.efficient_match/i);
  assert.match(csv, /F8030,496001,PR141,\[\],\[\],1,0/);
});
