import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  loadReserveScoreCsv,
  type ReserveScoreSkippedProperty,
} from "./reserve-score-export.js";

const reserveScoreHeader = [
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

test("loadReserveScoreCsv exports SBY reserve pairings with base-local date matching", async () => {
  const skippedProperties: ReserveScoreSkippedProperty[] = [];
  const groupRows = [
    {
      crewId: "F8030",
      tier: 1,
      propertyGroupKey: "short-call-pram",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: null,
      paramA: "PRAM",
      paramB: JSON.stringify({ mode: "whole_month" }),
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 1,
      propertyGroupKey: "reserve-day-on",
      propertyCode: 302,
      legacyPropertyCode: 302,
      actionId: null,
      operator: null,
      paramA: "2026-06-01",
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "short-call-prpm-first-half",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: null,
      paramA: "PRPM",
      paramB: JSON.stringify({ mode: "specific_dates", dates: ["2026-06-01"] }),
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "prefer-off",
      propertyCode: 311,
      legacyPropertyCode: 311,
      actionId: null,
      operator: null,
      paramA: "2026-06-01",
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 3,
      propertyGroupKey: "unsupported",
      propertyCode: 999,
      legacyPropertyCode: 999,
      actionId: null,
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
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
          pairingId: "61711",
          interfaceId: "PRAM2026-06-01",
        }] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadReserveScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
    onSkippedProperty: (event: ReserveScoreSkippedProperty) => skippedProperties.push(event),
  } as unknown) as Parameters<typeof loadReserveScoreCsv>[0]);

  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0]!.text, /p\.assignment_group = 'SBY'/);
  assert.match(queryCalls[0]!.text, /p\.sch_str_dt_utc at time zone a\.zone_id/);
  assert.deepEqual(queryCalls[0]!.values, ["PRPM", ["2026-06-01"]]);
  assert.equal(csv, [
    reserveScoreHeader,
    "F8030,61711,PRAM2026-06-01,[],[],0,0,1,0,0,0,0,0,0,0,0,0,0,0",
    "",
  ].join("\n"));
  assert.deepEqual(skippedProperties, [
    {
      crewId: "F8030",
      periodCode: "Jun 2026",
      propertyCode: 302,
      propertyGroupKey: "reserve-day-on",
      reason: "Unsupported reserve property code.",
    },
    {
      crewId: "F8030",
      periodCode: "Jun 2026",
      propertyCode: 311,
      propertyGroupKey: "prefer-off",
      reason: "Unsupported reserve property code.",
    },
    {
      crewId: "F8030",
      periodCode: "Jun 2026",
      propertyCode: 999,
      propertyGroupKey: "unsupported",
      reason: "Unsupported reserve property code.",
    },
  ]);
});

test("loadReserveScoreCsv keeps PRPM reserve pairings matchable without pairing segments", async () => {
  const groupRows = [{
    crewId: "F8031",
    tier: 1,
    propertyGroupKey: "short-call-prpm",
    propertyCode: 301,
    legacyPropertyCode: 301,
    actionId: null,
    operator: null,
    paramA: "PRPM",
    paramB: JSON.stringify({ mode: "specific_dates", dates: ["2026-06-01"] }),
    paramC: null,
  }];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: groupRows as T[] };
    },
  };
  let queryText = "";
  const pgPool = {
    async query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }> {
      queryText = text;
      assert.deepEqual(values, ["PRPM", ["2026-06-01"]]);
      return {
        rows: [{
          pairingId: "61742",
          interfaceId: "PRPM2026-06-01",
        }] as T[],
      };
    },
  } as unknown as Pool;

  const csv = await loadReserveScoreCsv(({
    db,
    pgPool,
    periodCode: "Jun 2026",
    liveSchema: "f8",
  } as unknown) as Parameters<typeof loadReserveScoreCsv>[0]);

  assert.doesNotMatch(queryText, /pairing_segment/);
  assert.equal(csv, [
    reserveScoreHeader,
    "F8031,61742,PRPM2026-06-01,[],[],1,0,0,0,0,0,0,0,0,0,0,0,0,0",
    "",
  ].join("\n"));
});
