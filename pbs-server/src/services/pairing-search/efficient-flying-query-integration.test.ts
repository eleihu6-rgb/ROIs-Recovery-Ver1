import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";

import { buildPreviewCondition } from "./pairing-search-condition-builder.js";
import {
  executeCurrentRulesCountQuery,
  executePreviewCountQueries,
  executePreviewQuery,
} from "./pairing-search-preview-query.js";
import { createPairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

const property = (mode: "efficient" | "inefficient") => ({
  propertyCode: 428,
  name: "Efficient Flying First",
  action: "award" as const,
  quantifier: null,
  bid: {
    type: "efficient-flying-preference" as const,
    mode,
  },
});

const context = {
  periodStartDate: "2026-07-01",
  periodEndDate: "2026-07-31",
  efficientFlying: {
    percentile: 20,
    periodStartDate: "2026-07-01",
    periodEndDate: "2026-07-31",
    baseScopeMode: "fixed" as const,
    bases: ["YEG"],
    actorRank: "CA",
  },
};

const assertCompleteSql = (text: string, values: unknown[]): void => {
  assert.match(text, /with pairing_search_1_efficient_scoped as materialized/i);
  assert.match(text, /pairing_search_1_efficient_matches as materialized/i);
  assert.equal((text.match(/efficient_scoped as materialized/gi) ?? []).length, 1);
  const placeholders = [...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  assert.equal(Math.max(...placeholders), values.length);
};

test("Efficient Flying Preview renders one complete top-level CTE statement", async () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(property("efficient"), "f8", sqlBuilder, context);
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pgPool = {
    async query(text: string, values: unknown[]) {
      queries.push({ text, values });
      return {
        rows: [{
          total_items: "0",
          pairing_id_count: "0",
          id: null,
        }],
      };
    },
  } as unknown as Pool;

  await executePreviewQuery({
    condition,
    metadata: { mode: "single_property_preview", property: property("efficient") },
    page: 1,
    pageSize: 30,
    periodStartDate: "2026-07-01",
  periodEndDate: "2026-07-31",
    pgPool,
    schema: "f8",
    sqlBuilder,
    actorBase: "YEG",
    actorRank: "CA",
  });

  assert.equal(queries.length, 1);
  assertCompleteSql(queries[0]!.text, queries[0]!.values);
  assert.match(queries[0]!.text, /filtered_pairings as/i);
});

test("Efficient and Inefficient count leaves share one CTE bundle and continuous parameters", async () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const efficient = buildPreviewCondition(property("efficient"), "f8", sqlBuilder, context);
  const inefficient = buildPreviewCondition(property("inefficient"), "f8", sqlBuilder, context);
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pgPool = {
    async query(text: string, values: unknown[]) {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as unknown as Pool;

  await executeCurrentRulesCountQuery({
    leaves: [
      { alias: "match_1", condition: efficient },
      { alias: "match_2", condition: inefficient },
    ],
    targets: [{ key: "all", expression: "evaluated.match_1 or evaluated.match_2" }],
    pgPool,
    schema: "f8",
    sqlBuilder,
    actorBase: "YEG",
    actorRank: "CA",
    periodStartDate: "2026-07-01",
  periodEndDate: "2026-07-31",
    useCurrentRulesFacts: false,
  });

  assertCompleteSql(queries[0]!.text, queries[0]!.values);
  assert.match(queries[0]!.text, /candidate_pairings as materialized/i);
  assert.match(queries[0]!.text, /evaluated_pairings as materialized/i);
});

test("Efficient Flying tier-pool counts render the CTE before the UNION statement", async () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(property("efficient"), "f8", sqlBuilder, context);
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pgPool = {
    async query(text: string, values: unknown[]) {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as unknown as Pool;

  await executePreviewCountQueries({
    targets: [
      { key: "package", condition: "true" },
      { key: "tx:T1", condition },
    ],
    pgPool,
    schema: "f8",
    sqlBuilder,
    actorBase: "YEG",
    actorRank: "CA",
    periodStartDate: "2026-07-01",
  periodEndDate: "2026-07-31",
  });

  assertCompleteSql(queries[0]!.text, queries[0]!.values);
  assert.match(queries[0]!.text, /union all/i);
});
