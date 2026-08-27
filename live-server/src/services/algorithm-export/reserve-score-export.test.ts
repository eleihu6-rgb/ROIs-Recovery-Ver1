import { describe, expect, it, vi } from "vitest";

import type { Pool } from "pg";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const reserveRow = (
  dateScope: object,
  overrides: Partial<{
    crewId: string;
    tier: number;
    actionId: number;
    callType: string;
  }> = {},
) => ({
  crewId: overrides.crewId ?? "F8030",
  tier: overrides.tier ?? 1,
  propertyGroupKey: "reserve-short-call-type",
  propertyCode: 301,
  legacyPropertyCode: 301,
  actionId: overrides.actionId ?? 1,
  operator: "In",
  paramA: overrides.callType ?? "PRAM",
  paramB: JSON.stringify(dateScope),
  paramC: null,
});

const createDb = (rows: ReturnType<typeof reserveRow>[]) => ({
  execute: vi.fn(async () => ({ rows })),
});

describe("loadReserveScoreCsv standard-answer ownership", () => {
  it.each([
    { mode: "whole_month" },
    { mode: "first_half" },
    { mode: "second_half" },
    { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
  ])("does not query pairings for $mode because the condition belongs to LINE_RULES", async (dateScope) => {
    const { loadReserveScoreCsv } = await import("./reserve-score-export.js");
    const pgPool = { query: vi.fn() } as unknown as Pool;

    const csv = await loadReserveScoreCsv({
      db: createDb([reserveRow(dateScope)]) as never,
      pgPool,
      periodCode: "Jun 2026",
      period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
    });

    expect(pgPool.query).not.toHaveBeenCalled();
    expect(csv.trim().split("\n")).toHaveLength(1);
  });

  it("expands specific dates from both RES and historical SBY pairings", async () => {
    const { loadReserveScoreCsv } = await import("./reserve-score-export.js");
    const query = vi.fn(async (_text: string, _params?: unknown[]) => ({
      rows: [{ pairingId: "9001", interfaceId: "RES-9001" }],
    }));

    const csv = await loadReserveScoreCsv({
      db: createDb([reserveRow({
        mode: "specific_dates",
        dates: ["2026-06-03"],
      })]) as never,
      pgPool: { query } as unknown as Pool,
      periodCode: "Jun 2026",
      period: { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode: "Jun 2026", rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain(
      "upper(btrim(p.assignment_group)) in ('SBY', 'RES')",
    );
    expect(query.mock.calls[0]?.[1]).toEqual(["PRAM", ["2026-06-03"]]);
    expect(csv).toContain("F8030,9001,RES-9001");
  });
});
