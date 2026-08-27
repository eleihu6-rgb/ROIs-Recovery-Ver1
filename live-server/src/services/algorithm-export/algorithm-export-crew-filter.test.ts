import { describe, expect, it } from "vitest";

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

describe("algorithm export crew filtering", () => {
  it("filters non-crew Pairing and Reserve bids at the SQL source", async () => {
    const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
    const { loadReserveScoreCsv } = await import("./reserve-score-export.js");
    const queries: string[] = [];
    const db = {
      async execute<T>(query: unknown): Promise<{ rows: T[] }> {
        queries.push(queryText(query));
        return { rows: [] };
      },
    } as unknown as Parameters<typeof loadPairingScoreCsv>[0]["db"];
    const pgPool = { query: async () => ({ rows: [] }) } as unknown as Pool;

    await loadPairingScoreCsv({
      db,
      pgPool,
      periodCode: "Jun 2026",
      period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
    });
    await loadReserveScoreCsv({
      db,
      pgPool,
      periodCode: "Jun 2026",
      period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
    });

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("inner join f8.crew");
    expect(queries[1]).toContain("inner join f8.crew");
  });

  it("uses the resolved bid ids for every CSV loader", async () => {
    const { loadDaysOffCsv } = await import("./days-off-export.js");
    const { loadPairingScoreCsv } = await import("./pairing-score-export.js");
    const { loadReserveScoreCsv } = await import("./reserve-score-export.js");
    const { loadLineRulesCsv } = await import("./line-rules-export.js");
    const queries: string[] = [];
    const db = {
      async execute<T>(query: unknown): Promise<{ rows: T[] }> {
        queries.push(queryText(query));
        return { rows: [] };
      },
    };
    const pgPool = { query: async () => ({ rows: [] }) } as unknown as Pool;
    const scope = {
      crewIds: ["19"],
      bidIds: ["20", "21"],
    };

    await loadDaysOffCsv(
      db as never,
      "Jul 2026",
      "f8",
      "f8_pbs",
      scope,
      { rosterPeriodId: 7, rosterPeriodKey: "2026RP07", periodCode: "Jul 2026", rpStartLocal: "2026-07-01", rpEndLocal: "2026-07-30" },
    );
    await loadPairingScoreCsv({
      db: db as never,
      pgPool,
      periodCode: "Jul 2026",
      period: { rosterPeriodId: 7, rosterPeriodKey: "2026RP07", periodCode: "Jul 2026", rpStartLocal: "2026-07-01", rpEndLocal: "2026-07-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
      scope,
    });
    await loadReserveScoreCsv({
      db: db as never,
      pgPool,
      periodCode: "Jul 2026",
      period: { rosterPeriodId: 7, rosterPeriodKey: "2026RP07", periodCode: "Jul 2026", rpStartLocal: "2026-07-01", rpEndLocal: "2026-07-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
      scope,
    });
    await loadLineRulesCsv({
      db: db as never,
      periodCode: "Jul 2026",
      period: { rosterPeriodId: 7, rosterPeriodKey: "2026RP07", periodCode: "Jul 2026", rpStartLocal: "2026-07-01", rpEndLocal: "2026-07-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
      scope,
    });

    expect(queries).toHaveLength(6);
    for (const query of queries) {
      expect(query).toContain("where in (20, 21)");
      expect(query).not.toContain("= 'Current'");
    }
  });
});
