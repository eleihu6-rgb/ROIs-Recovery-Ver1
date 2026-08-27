import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import type { Pool } from "pg";
import { createPbsAlgorithmExportService } from "./algorithm-export-service.js";

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

test("exportCurrentPackage includes line rules CSV and Rule ID readme", async () => {
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    },
  } as unknown as Parameters<typeof createPbsAlgorithmExportService>[0]["db"];
  const pgPool = {
    async query<T>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    },
  } as unknown as Pool;
  const service = createPbsAlgorithmExportService({
    db,
    pgPool,
    liveSchema: "f8",
  });

  const result = await service.exportCurrentPackage("Jun 2026");

  assert.equal(result.filename, "pbs-algorithm-export-Jun-2026.tgz");
  assert.deepEqual(listTarEntryNames(result.buffer), [
    "DAYSOFF.csv",
    "PAIRING_SCORE.csv",
    "RESERVE_SCORE.csv",
    "LINE_RULES.csv",
    "LINE_RULES_README.md",
  ]);
});

test("exportYeg14TestPackage uses YEG test filename and loads seniority order", async () => {
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    },
  } as unknown as Parameters<typeof createPbsAlgorithmExportService>[0]["db"];
  const queryTexts: string[] = [];
  const queryParams: unknown[][] = [];
  const pgPool = {
    async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
      queryTexts.push(text);
      queryParams.push(params ?? []);
      return {
        rows: [
          { crewId: "8888", seniorityNum: 900 },
          { crewId: "13702", seniorityNum: 800 },
        ] as T[],
      };
    },
  } as unknown as Pool;
  const service = createPbsAlgorithmExportService({
    db,
    pgPool,
    liveSchema: "f8",
  });

  const result = await service.exportYeg14TestPackage("Jun 2026");

  assert.equal(result.filename, "pbs-algorithm-export-yeg-14-Jun-2026.tgz");
  assert.match(queryTexts[0] ?? "", /from f8\.crew/);
  assert.match(queryTexts[0] ?? "", /base = 'YEG'/);
  assert.match(queryTexts[0] ?? "", /order by c\.seniority_num asc nulls last, c\.crew_id/);
  const requestedCrewIds = queryParams[0]?.[0];
  assert.ok(Array.isArray(requestedCrewIds));
  assert.equal(requestedCrewIds.length, 14);
  assert.ok(requestedCrewIds.includes("247"));
  assert.ok(!requestedCrewIds.includes("274"));
  assert.deepEqual(listTarEntryNames(result.buffer), [
    "DAYSOFF.csv",
    "PAIRING_SCORE.csv",
    "RESERVE_SCORE.csv",
    "LINE_RULES.csv",
    "LINE_RULES_README.md",
  ]);
});

test("exportScenarioPackage derives scope facets within the scenario window for PAIRING_SCORE narrowing", async () => {
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    },
  } as unknown as Parameters<typeof createPbsAlgorithmExportService>[0]["db"];
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
  const service = createPbsAlgorithmExportService({ db, pgPool, liveSchema: "f8" });

  const result = await service.exportScenarioPackage(
    "Jun 2026",
    ["274", "499"],
    "2026-06-01",
    "2026-06-30",
  );

  assert.equal(result.filename, "pbs-algorithm-export-scenario-Jun-2026.tgz");
  // The facets query runs against crew_base / crew_rank, bounded by the scenario window.
  const facetsIndex = queryTexts.findIndex((t) => /array_agg\(distinct cb\.base\)/.test(t));
  assert.ok(facetsIndex >= 0, "facets query must be issued");
  assert.match(queryTexts[facetsIndex] ?? "", /from f8\.crew c/);
  assert.match(queryTexts[facetsIndex] ?? "", /left join f8\.crew_base cb/);
  assert.match(queryTexts[facetsIndex] ?? "", /left join f8\.crew_rank cr/);
  // Per-crew rows (one per crew) drive the eligibility map for the req-4 refinement.
  assert.match(queryTexts[facetsIndex] ?? "", /group by c\.crew_id, c\.division/);
  assert.deepEqual(queryParams[facetsIndex], [["274", "499"], "2026-06-01", "2026-06-30"]);
});

test("exportScenarioPackage derives the date window from periodCode when none is passed", async () => {
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    },
  } as unknown as Parameters<typeof createPbsAlgorithmExportService>[0]["db"];
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
  const service = createPbsAlgorithmExportService({ db, pgPool, liveSchema: "f8" });

  // No explicit window → derived from the bid period "Jun 2026" = the June calendar month.
  const result = await service.exportScenarioPackage("Jun 2026", ["274"]);

  const facetsIndex = queryTexts.findIndex((t) => /array_agg\(distinct cb\.base\)/.test(t));
  assert.ok(facetsIndex >= 0, "facets query must be issued");
  assert.deepEqual(queryParams[facetsIndex], [["274"], "2026-06-01", "2026-06-30"]);
  assert.equal(result.filename, "pbs-algorithm-export-scenario-Jun-2026.tgz");
});
