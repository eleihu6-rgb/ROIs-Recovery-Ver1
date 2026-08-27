import assert from "node:assert/strict";
import test from "node:test";

import { buildEfficientFlyingCohortCondition } from "./efficient-flying-cohort.js";
import { createPairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

test("buildEfficientFlyingCohortCondition builds the top band from one period/base/rank cohort", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildEfficientFlyingCohortCondition({
    bid: { type: "efficient-flying-preference", mode: "efficient" },
    context: {
      percentile: 20,
      periodStartDate: "2026-07-01",
      periodEndDate: "2026-07-31",
      baseScopeMode: "fixed",
      bases: ["YEG"],
      actorRank: "CA",
    },
    schema: "f8",
    sqlBuilder,
  });

  const ctes = sqlBuilder.renderCtes();

  assert.match(condition, /efficient_match\.efficient_match/);
  assert.doesNotMatch(ctes, /cohort_pairing\.base = p\.base/);
  assert.match(ctes, /distinct on \(credit_segment\.pairing_id, credit_segment\.duty_seq\)/);
  assert.match(ctes, /order by credit_segment\.pairing_id, credit_segment\.duty_seq, credit_segment\.seg_seq/);
  assert.match(ctes, /cohort\.average_daily_credit >= stats\.credit_values\[stats\.n - stats\.k \+ 1\]/);
  assert.deepEqual(sqlBuilder.params, [
    "2026-07-01",
    "2026-07-31",
    "2026-07-01 00:00:00",
    "2026-08-01 00:00:00",
    20,
    ["YEG"],
    "CA",
  ]);
});

test("buildEfficientFlyingCohortCondition builds the bottom band and includes cutoff ties", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildEfficientFlyingCohortCondition({
    bid: { type: "efficient-flying-preference", mode: "inefficient" },
    context: {
      percentile: 17,
      periodStartDate: "2026-07-01",
      periodEndDate: "2026-07-31",
      baseScopeMode: "fixed",
      bases: ["YEG"],
    },
    schema: "f8",
    sqlBuilder,
  });

  const ctes = sqlBuilder.renderCtes();

  assert.match(condition, /efficient_match\.inefficient_match/);
  assert.match(ctes, /cohort\.average_daily_credit <= stats\.credit_values\[stats\.k\]/);
  assert.match(ctes, /greatest\(1, round\(count\(\*\) \* \$5::numeric \/ 100\)\)/);
});

test("buildEfficientFlyingCohortCondition reuses one lazy CTE bundle for both modes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const context = {
    percentile: 20,
    periodStartDate: "2026-07-01",
    periodEndDate: "2026-07-31",
    baseScopeMode: "fixed" as const,
    bases: ["YEG"],
    actorRank: "CA",
  };

  buildEfficientFlyingCohortCondition({
    bid: { type: "efficient-flying-preference", mode: "efficient" },
    context,
    schema: "f8",
    sqlBuilder,
  });
  const paramsAfterFirstRegistration = [...sqlBuilder.params];
  buildEfficientFlyingCohortCondition({
    bid: { type: "efficient-flying-preference", mode: "inefficient" },
    context,
    schema: "f8",
    sqlBuilder,
  });

  assert.deepEqual(sqlBuilder.params, paramsAfterFirstRegistration);
  assert.equal((sqlBuilder.renderCtes().match(/efficient_scoped as materialized/g) ?? []).length, 1);
});
