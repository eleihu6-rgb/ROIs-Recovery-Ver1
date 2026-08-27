import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { executeFeedbackMatchQuery } from "./pairing-search-preview-query.js";
import { createPairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

test("Feedback matching uses one bounded batch query without eligibility scans and returns local summary fields", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pgPool = {
    async query(text: string, values: unknown[]) {
      queries.push({ text, values });
      return {
        rows: [{
          id: "10722",
          id_text: "10722",
          pairing_label: "T4101",
          rank_label: "CA+FO",
          base: "YYZ",
          base_zone_id: "America/Toronto",
          pairing_start_utc: "2026-06-01T10:00:00.000Z",
          composition_label: "CA(1)",
          division: "C",
          duration_days: 1,
          tafb_days: 2,
          duty_count: 1,
          fleet: "7M8",
          active_start_date: "2026-06-01",
          active_end_date: "2026-06-01",
          report_start_utc: "2026-06-01T10:00:00.000Z",
          release_end_utc: "2026-06-01T17:05:00.000Z",
          route_label: "YYZ-YWG-YYZ",
          total_credit_minutes: "310",
          matched_property_indexes: [1],
        }],
      };
    },
  } as unknown as Pool;
  const sqlBuilder = createPairingSearchSqlBuilder();

  const result = await executeFeedbackMatchQuery({
    leaves: [{ alias: "match_1", key: "current:length", condition: "p.duration_days = 1" }],
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    pgPool,
    schema: "f8",
    sqlBuilder,
    useCurrentRulesFacts: false,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /candidate_pairings as materialized/i);
  assert.match(queries[0]!.text, /matched_pairings as materialized/i);
  assert.match(queries[0]!.text, /segment_rollup as materialized/i);
  assert.match(queries[0]!.text, /composition_rollup as materialized/i);
  assert.match(queries[0]!.text, /cardinality\(matched_property_indexes\) > 0/i);
  assert.match(queries[0]!.text, /local_origin_date[\s\S]*<= \$\d+::date[\s\S]*local_end_date|local_origin_date[\s\S]*<= \$\d+::date[\s\S]*>= \$\d+::date/i);
  assert.doesNotMatch(queries[0]!.text, /from f8\.crew_base eligibility_base/i);
  assert.doesNotMatch(queries[0]!.text, /eligibility_base\.is_prime_base = 1/i);
  assert.doesNotMatch(queries[0]!.text, /from f8\.pairing_composition eligibility_composition/i);
  assert.doesNotMatch(queries[0]!.text, /from f8\.crew_rank eligibility_rank/i);
  assert.doesNotMatch(queries[0]!.text, /and upper\(btrim\(active_crew_base\.base\)\) = upper\(btrim\(p\.base\)\)/i);
  assert.match(queries[0]!.text, /left join f8\.rank r/i);
  assert.match(queries[0]!.text, /order by ranked\.display_order, ranked\.acting_rank/i);
  assert.match(queries[0]!.text, /p\.tafb as tafb_days/i);
  assert.doesNotMatch(queries[0]!.text, /left join lateral\s*\([\s\S]*from f8\.pairing_segment/i);
  assert.doesNotMatch(queries[0]!.text, /where s\.pairing_id = p\.id/i);
  assert.doesNotMatch(queries[0]!.text, /upper\(btrim\(rf\.source\)\) = 'PA'/i);
  assert.doesNotMatch(queries[0]!.text, /'IMP'/i);
  const referencedParameters = Array.from(queries[0]!.text.matchAll(/\$(\d+)/g), (match) => Number(match[1]));
  assert.deepEqual(
    Array.from(new Set(referencedParameters)).sort((left, right) => left - right),
    Array.from({ length: queries[0]!.values.length }, (_, index) => index + 1),
  );
  assert.equal(result[0]?.pairing.routeLabel, "YYZ-YWG-YYZ");
  assert.equal(result[0]?.pairing.rank, "CA+FO");
  assert.equal(result[0]?.pairing.tafbDays, 2);
  assert.equal(result[0]?.pairing.totalCredit, "5:10");
  assert.deepEqual(result[0]?.matchedPropertyKeys, ["current:length"]);
  assert.equal("eligibility" in result[0]!, false);
});

test("Feedback pairing occurrences use exact pairing id and base-local origin date conditions", async () => {
  let sql = "";
  let params: unknown[] = [];
  const pgPool = {
    async query(text: string, values: unknown[]) {
      sql = text;
      params = values;
      return { rows: [] };
    },
  } as unknown as Pool;

  await executeFeedbackMatchQuery({
    leaves: [{
      alias: "match_1",
      key: "current:pairing-number",
      occurrences: [
        { pairingId: "10722", originDate: "2026-06-01" },
        { pairingId: "10723", originDate: "2026-06-02" },
      ],
    }],
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    pgPool,
    schema: "f8",
    sqlBuilder: createPairingSearchSqlBuilder(),
    useCurrentRulesFacts: false,
  });

  assert.match(sql, /p\.id::text = \$\d+::text/i);
  assert.match(sql, /local_origin_date[\s\S]*= \$\d+::date/i);
  assert.ok(params.includes("10722"));
  assert.ok(params.includes("2026-06-01"));
});

test("Feedback query omits pre-assignment and crew eligibility scans", async () => {
  let sql = "";
  let params: unknown[] = [];
  const pgPool = {
    async query(text: string, values: unknown[]) {
      sql = text;
      params = values;
      return { rows: [] };
    },
  } as unknown as Pool;

  await executeFeedbackMatchQuery({
    leaves: [{ alias: "match_1", key: "current:length", condition: "true" }],
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    pgPool,
    schema: "f8",
    sqlBuilder: createPairingSearchSqlBuilder(),
    useCurrentRulesFacts: false,
  });

  assert.doesNotMatch(sql, /from f8\.roster_flight rf/i);
  assert.doesNotMatch(sql, /from f8\.crew_base eligibility_base/i);
  assert.doesNotMatch(sql, /from f8\.crew_rank eligibility_rank/i);
  const referencedParameters = Array.from(sql.matchAll(/\$(\d+)/g), (match) => Number(match[1]));
  assert.deepEqual(
    Array.from(new Set(referencedParameters)).sort((left, right) => left - right),
    Array.from({ length: params.length }, (_, index) => index + 1),
  );
});
