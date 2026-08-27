import { strict as assert } from "node:assert";
import { test } from "vitest";

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

test("buildDaysOffCsvFromRows uses effective crew_base timezone and preserves Prefer Off window", async () => {
  const { buildDaysOffCsvFromRows } = await import("./days-off-export.js");
  const csv = buildDaysOffCsvFromRows([
    {
      crewId: "F8030",
      zoneId: "America/Vancouver",
      tier: 2,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "2026-06-11,Window 08:00-18:00",
      paramB: null,
      paramC: null,
    },
  ], [], { rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" }, undefined, [
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      effAt: "2025-10-31T16:00:00.000Z",
      expAt: "2026-06-30T15:59:59.000Z",
      isPrimeBase: 1,
    },
  ]);

  assert.equal(csv, [
    "Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter",
    "F8030,2026-06-11T12:00:00Z,2026-06-11T22:00:00Z,0,1,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("buildDaysOffCsvFromRows rejects rows without an effective base timezone", async () => {
  const { buildDaysOffCsvFromRows } = await import("./days-off-export.js");
  assert.throws(() => buildDaysOffCsvFromRows([
      {
        crewId: "NOBASE",
        zoneId: null,
        tier: 1,
        propertyCode: 201,
        legacyPropertyCode: 201,
        operator: "In",
        paramA: "2026-06-11",
        paramB: null,
        paramC: null,
      },
    ], [], { rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" }),
    /could not resolve UTC window for crew NOBASE on 2026-06-11/,
  );
});

test("buildDaysOffCsvFromRows rolls a cross-midnight Prefer Off window into the next local date", async () => {
  const { buildDaysOffCsvFromRows } = await import("./days-off-export.js");
  const csv = buildDaysOffCsvFromRows([
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 1,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "2026-06-11,Window 22:00-06:00",
      paramB: null,
      paramC: null,
    },
  ], [], { rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" });

  assert.match(csv, /F8030,2026-06-12T02:00:00Z,2026-06-12T10:00:00Z,1,0,0,0,0,0,0/);
});

test("loadDaysOffCsv filters non-crew bids and loads crew_base instead of pbs_user base", async () => {
  const { loadDaysOffCsv } = await import("./days-off-export.js");
  type Database = Parameters<typeof loadDaysOffCsv>[0];
  const queries: string[] = [];
  let callIndex = 0;
  const db = {
    async execute<T>(query: unknown): Promise<{ rows: T[] }> {
      queries.push(queryText(query));
      callIndex += 1;
      if (callIndex === 1) return { rows: [] };
      if (callIndex === 2) return { rows: [] };
      return { rows: [] };
    },
  } as unknown as Database;

  await loadDaysOffCsv(
    db,
    "Jun 2026",
    "f8",
    "f8_pbs",
    undefined,
    { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
  );

  assert.equal(queries.length, 3);
  assert.ok(queries.slice(0, 2).every((query) => /inner join f8\.crew/.test(query)));
  assert.match(queries[2]!, /f8\.crew_base/);
  assert.doesNotMatch(queries.join("\n"), /f8_pbs\.pbs_user/);
});
