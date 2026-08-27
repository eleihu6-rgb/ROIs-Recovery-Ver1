import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const listTarEntryNames = (buffer: Buffer) => {
  const tar = gunzipSync(buffer);
  const names: string[] = [];
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const name = tar.toString("utf8", offset, offset + 100).replace(/\0.*$/u, "");

    if (!name) {
      break;
    }

    const sizeText = tar.toString("ascii", offset + 124, offset + 136).replace(/\0.*$/u, "").trim();
    const size = Number.parseInt(sizeText, 8);

    names.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  return names;
};

const createDb = () => ({
  async execute<T>(): Promise<{ rows: T[] }> {
    return { rows: [] };
  },
} as never);

const createService = async (
  pgPool: Pool,
  options: { liveSchema?: string; pbsSchema?: string } = {},
) => {
  const { createPbsAlgorithmExportService } = await import("./algorithm-export-service.js");
  const periodAwarePool = {
    async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
      if (/from f8\.roster_period/i.test(text)) {
        const rosterPeriodId = Number(params?.[0]);
        const isJune = rosterPeriodId === 6;
        return {
          rows: [{
            rosterPeriodId,
            rosterPeriodKey: isJune ? "2026RP06" : "2026RP07",
            periodCode: isJune ? "Jun 2026" : "Jul 2026",
            rpStartLocal: isJune ? "2026-06-01" : "2026-06-30",
            rpEndLocal: isJune ? "2026-06-30" : "2026-07-30",
          }] as T[],
        };
      }

      const result = await pgPool.query(text, params);
      return { rows: result.rows as T[] };
    },
  } as unknown as Pool;
  return createPbsAlgorithmExportService({
    db: createDb(),
    pgPool: periodAwarePool,
    liveSchema: options.liveSchema ?? "f8",
    pbsSchema: options.pbsSchema ?? "f8_pbs",
  });
};

describe("createPbsAlgorithmExportService scenario package", () => {
  it("uses explicit scenario window for crew facets", async () => {
    const queryTexts: string[] = [];
    const queryParams: unknown[][] = [];
    const pgPool = {
      async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
        queryTexts.push(text);
        queryParams.push(params ?? []);
        if (/array_agg\(distinct cb\.base\)/.test(text)) {
          return {
            rows: [
              { crewId: "274", division: "P", bases: ["YVR"], ranks: ["CA"] },
              { crewId: "499", division: "P", bases: ["YVR"], ranks: ["FO"] },
            ] as T[],
          };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool);

    const result = await service.exportScenarioPackage(
      6,
      "Jun 2026",
      ["274", "499"],
      "2026-06-01",
      "2026-06-30",
    );

    expect(result.filename).toBe("pbs-algorithm-export-scenario-Jun-2026.tgz");
    expect(listTarEntryNames(result.buffer)).toEqual([
      "DAYSOFF.csv",
      "PAIRING_SCORE.csv",
      "RESERVE_SCORE.csv",
      "LINE_RULES.csv",
      "LINE_RULES_README.md",
    ]);
    const facetsIndex = queryTexts.findIndex((text) => /array_agg\(distinct cb\.base\)/.test(text));
    expect(facetsIndex).toBeGreaterThanOrEqual(0);
    expect(queryTexts[facetsIndex]).toContain("from f8.crew c");
    expect(queryTexts[facetsIndex]).toContain("left join f8.crew_base cb");
    expect(queryTexts[facetsIndex]).toContain("left join f8.crew_rank cr");
    expect(queryParams[facetsIndex]).toEqual([["274", "499"], "2026-06-01", "2026-06-30"]);
  });

  it("uses the selected roster period range when no explicit scenario window is supplied", async () => {
    const queryTexts: string[] = [];
    const queryParams: unknown[][] = [];
    const pgPool = {
      async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
        queryTexts.push(text);
        queryParams.push(params ?? []);
        if (/array_agg\(distinct cb\.base\)/.test(text)) {
          return { rows: [{ crewId: "274", division: "P", bases: ["YYZ"], ranks: ["CA"] }] as T[] };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool);

    const result = await service.exportScenarioPackage(6, "Jun 2026", ["274"]);

    const facetsIndex = queryTexts.findIndex((text) => /array_agg\(distinct cb\.base\)/.test(text));
    expect(facetsIndex).toBeGreaterThanOrEqual(0);
    expect(queryParams[facetsIndex]).toEqual([["274"], "2026-06-01", "2026-06-30"]);
    expect(result.filename).toBe("pbs-algorithm-export-scenario-Jun-2026.tgz");
  });

  it("intersects scenario crewIds with explicit export filters", async () => {
    const queryTexts: string[] = [];
    const queryParams: unknown[][] = [];
    const pgPool = {
      async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
        queryTexts.push(text);
        queryParams.push(params ?? []);
        if (/from f8_pbs\.pbs_user u/.test(text)) {
          return { rows: [{ crewId: "499" }, { crewId: "999" }] as T[] };
        }
        if (/select\s+b\.id::text as "bidId"/.test(text)) {
          return {
            rows: [{
              bidId: "42",
              crewId: "499",
              periodCode: "Jun 2026",
              bidContext: "Current",
              hasGroup: true,
              hasDayOff: false,
            }] as T[],
          };
        }
        if (/seniority_num/.test(text)) {
          return { rows: [{ crewId: "499", seniorityNum: 12 }] as T[] };
        }
        if (/array_agg\(distinct cb\.base\)/.test(text)) {
          return { rows: [{ crewId: "499", division: "P", bases: ["YVR"], ranks: ["FO"] }] as T[] };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool);

    const result = await service.exportScenarioPackage(
      6,
      "Jun 2026",
      ["274", "499", "536"],
      "2026-06-01",
      "2026-06-30",
      {
        division: "P",
        status: "ACTIVE",
        bases: ["yvr"],
        fleetQuals: ["737"],
      },
    );

    const filterIndex = queryTexts.findIndex((text) => /from f8_pbs\.pbs_user u/.test(text));
    const facetsIndex = queryTexts.findIndex((text) => /array_agg\(distinct cb\.base\)/.test(text));
    expect(filterIndex).toBeGreaterThanOrEqual(0);
    expect(facetsIndex).toBeGreaterThanOrEqual(0);
    expect(queryParams[filterIndex]).toEqual(["P", ["YVR"], ["737"]]);
    expect(queryParams[facetsIndex]).toEqual([["499"], "2026-06-01", "2026-06-30"]);
    expect(result.filename).toBe("pbs-algorithm-export-scenario-Jun-2026.tgz");
  });

  it("uses configured PBS schema instead of deriving it from live schema", async () => {
    const queryTexts: string[] = [];
    const pgPool = {
      async query<T>(text: string): Promise<{ rows: T[] }> {
        queryTexts.push(text);
        if (/from f8_pbs\.pbs_user u/.test(text)) {
          return { rows: [{ crewId: "499" }] as T[] };
        }
        if (/select\s+b\.id::text as "bidId"/.test(text)) {
          return {
            rows: [{
              bidId: "42",
              crewId: "499",
              periodCode: "Jun 2026",
              bidContext: "Current",
              hasGroup: true,
              hasDayOff: false,
            }] as T[],
          };
        }
        if (/seniority_num/.test(text)) {
          return { rows: [{ crewId: "499", seniorityNum: 12 }] as T[] };
        }
        if (/array_agg\(distinct cb\.base\)/.test(text)) {
          return { rows: [{ crewId: "499", division: "P", bases: ["YVR"], ranks: ["FO"] }] as T[] };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool, {
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
    });

    await service.exportScenarioPackage(
      6,
      "Jun 2026",
      ["499"],
      "2026-06-01",
      "2026-06-30",
      { bases: ["YVR"] },
    );

    expect(queryTexts.some((text) => /from f8_pbs\.pbs_user u/.test(text))).toBe(true);
    expect(queryTexts.some((text) => /from f8_pbs\.pbs_bid b/.test(text))).toBe(true);
    expect(queryTexts.some((text) => text.includes("f8_live_pbs"))).toBe(false);
  });

  it("rejects scenario filters that match no scenario crew", async () => {
    const pgPool = {
      async query<T>(text: string): Promise<{ rows: T[] }> {
        if (/from f8_pbs\.pbs_user u/.test(text)) {
          return { rows: [] as T[] };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool);

    await expect(service.exportScenarioPackage(
      6,
      "Jun 2026",
      ["274"],
      "2026-06-01",
      "2026-06-30",
      { bases: ["YYZ"] },
    )).rejects.toMatchObject({
      statusCode: 400,
      message: "No crews match the scenario package export filters.",
    });
  });
});

describe("createPbsAlgorithmExportService current and YEG package eligibility", () => {
  it("keeps a filtered Standing-only crew in the effective export scope", async () => {
    const queryTexts: string[] = [];
    const queryParams: unknown[][] = [];
    const pgPool = {
      async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
        queryTexts.push(text);
        queryParams.push(params ?? []);
        if (/from f8_pbs\.pbs_user u/.test(text)) {
          return { rows: [{ crewId: "19" }] as T[] };
        }
        if (/select\s+b\.id::text as "bidId"/.test(text)) {
          return {
            rows: [
              {
                bidId: "100",
                crewId: "19",
                periodCode: "Jul 2026",
                bidContext: "Current",
                hasGroup: false,
                hasDayOff: false,
              },
              {
                bidId: "200",
                crewId: "19",
                periodCode: "STANDING",
                bidContext: "StandingLineholder",
                hasGroup: true,
                hasDayOff: false,
              },
              {
                bidId: "201",
                crewId: "19",
                periodCode: "STANDING",
                bidContext: "StandingReserve",
                hasGroup: true,
                hasDayOff: false,
              },
            ] as T[],
          };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool);

    await service.exportCurrentPackage(7, "Jul 2026", { bases: ["YYZ"] });

    const sourceIndex = queryTexts.findIndex((text) => /select\s+b\.id::text as "bidId"/.test(text));
    const baseIndex = queryTexts.findIndex((text) => /from f8\.crew_base cb/.test(text));
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    expect(queryParams[sourceIndex]).toEqual([7, ["19"]]);
    expect(queryParams[baseIndex]).toEqual([["19"]]);
  });

  it("loads date-qualified prime bases and ranks for every current-package crew", async () => {
    const queryTexts: string[] = [];
    const queryParams: unknown[][] = [];
    const pgPool = {
      async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
        queryTexts.push(text);
        queryParams.push(params ?? []);
        if (/select\s+b\.id::text as "bidId"/.test(text)) {
          return {
            rows: [{
              bidId: "84",
              crewId: "844",
              periodCode: "Jul 2026",
              bidContext: "Current",
              hasGroup: true,
              hasDayOff: false,
            }] as T[],
          };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool);

    await service.exportCurrentPackage(7, "Jul 2026");

    const baseIndex = queryTexts.findIndex((text) => /from f8\.crew_base cb/.test(text));
    const rankIndex = queryTexts.findIndex((text) => /from f8\.crew_rank cr/.test(text));
    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(rankIndex).toBeGreaterThanOrEqual(0);
    expect(queryTexts[baseIndex]).toContain("cb.is_prime_base = 1");
    expect(queryParams[baseIndex]).toEqual([["844"]]);
    expect(queryParams[rankIndex]).toEqual([["844"]]);
  });

  it("applies the same eligibility loader to the YEG-14 package", async () => {
    const queryTexts: string[] = [];
    const pgPool = {
      async query<T>(text: string): Promise<{ rows: T[] }> {
        queryTexts.push(text);
        if (/seniority_num/.test(text)) {
          return { rows: [{ crewId: "247", seniorityNum: 1 }] as T[] };
        }
        if (/select\s+b\.id::text as "bidId"/.test(text)) {
          return {
            rows: [{
              bidId: "24",
              crewId: "247",
              periodCode: "Jul 2026",
              bidContext: "Current",
              hasGroup: true,
              hasDayOff: false,
            }] as T[],
          };
        }
        return { rows: [] as T[] };
      },
    } as unknown as Pool;
    const service = await createService(pgPool);

    await service.exportYeg14TestPackage(7, "Jul 2026");

    expect(queryTexts.some((text) => /from f8\.crew_base cb/.test(text))).toBe(true);
    expect(queryTexts.some((text) => /from f8\.crew_rank cr/.test(text))).toBe(true);
  });
});
