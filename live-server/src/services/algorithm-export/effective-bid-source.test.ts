import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  loadEffectiveBidSources,
  resolveEffectiveBidSources,
  type EffectiveBidSourceRow,
} from "./effective-bid-source.js";

const row = (
  bidId: string,
  crewId: string,
  bidContext: EffectiveBidSourceRow["bidContext"],
  options: { hasGroup?: boolean; hasDayOff?: boolean; periodCode?: string } = {},
): EffectiveBidSourceRow => ({
  bidId,
  crewId,
  bidContext,
  periodCode: options.periodCode ?? (bidContext === "Current" ? "Jul 2026" : "STANDING"),
  hasGroup: options.hasGroup ?? false,
  hasDayOff: options.hasDayOff ?? false,
});

describe("resolveEffectiveBidSources", () => {
  it("uses the whole Current bid when Current has a saved group", () => {
    const result = resolveEffectiveBidSources([
      row("10", "19", "Current", { hasGroup: true }),
      row("20", "19", "StandingLineholder", { hasGroup: true }),
      row("21", "19", "StandingReserve", { hasGroup: true }),
    ]);

    expect(result).toEqual([{ crewId: "19", source: "Current", bidIds: ["10"] }]);
  });

  it("uses Current when a concrete day-off row is its only formal condition", () => {
    const result = resolveEffectiveBidSources([
      row("10", "19", "Current", { hasDayOff: true }),
      row("20", "19", "StandingLineholder", { hasGroup: true }),
    ]);

    expect(result).toEqual([{ crewId: "19", source: "Current", bidIds: ["10"] }]);
  });

  it("uses both Standing contexts when Current is an empty container", () => {
    const result = resolveEffectiveBidSources([
      row("10", "19", "Current"),
      row("20", "19", "StandingLineholder", { hasGroup: true }),
      row("21", "19", "StandingReserve", { hasGroup: true }),
    ]);

    expect(result).toEqual([{
      crewId: "19",
      source: "Standing",
      bidIds: ["20", "21"],
    }]);
  });

  it("keeps a single available Standing context and omits empty bids", () => {
    const result = resolveEffectiveBidSources([
      row("30", "20", "Current"),
      row("31", "20", "StandingLineholder"),
      row("40", "21", "StandingReserve", { hasGroup: true }),
      row("50", "22", "Current"),
    ]);

    expect(result).toEqual([{
      crewId: "21",
      source: "Standing",
      bidIds: ["40"],
    }]);
  });
});

describe("loadEffectiveBidSources", () => {
  it("loads only the target Current month plus Standing and scopes candidate crews", async () => {
    const query = vi.fn(async (_text: string, _params?: unknown[]) => ({
      rows: [
        row("10", "19", "Current"),
        row("20", "19", "StandingLineholder", { hasGroup: true }),
      ],
    }));
    const result = await loadEffectiveBidSources(
      { query } as unknown as Pool,
      "f8",
      "f8_pbs",
      7,
      ["19"],
    );

    expect(result).toEqual([{
      crewId: "19",
      source: "Standing",
      bidIds: ["20"],
    }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("inner join f8.crew crew");
    expect(query.mock.calls[0]?.[0]).toContain("b.roster_period_id = $1::bigint");
    expect(query.mock.calls[0]?.[0]).toContain("b.period_code = 'STANDING'");
    expect(query.mock.calls[0]?.[0]).toContain("b.crew_id = any($2::varchar[])");
    expect(query.mock.calls[0]?.[1]).toEqual([7, ["19"]]);
  });

  it("does not query when an explicit crew scope is empty", async () => {
    const query = vi.fn();

    await expect(loadEffectiveBidSources(
      { query } as unknown as Pool,
      "f8",
      "f8_pbs",
      7,
      [],
    )).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
