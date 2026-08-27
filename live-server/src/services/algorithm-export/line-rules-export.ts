import { sql } from "drizzle-orm";
import {
  parsePbsLineCreditWindowDeltaHours,
  pbsLineF8PropertyCodes,
} from "../../../../packages/contracts/pbs-line-bids.js";
import { pbsBid } from "../../models/index.js";
import { buildBidSourceSql, buildCrewScopeSql } from "./export-scope.js";
import { buildLineRulesCsvFromEntries } from "./line-rules-csv.js";
import { buildLineRuleEntry } from "./line-rules-entry.js";
import {
  DAYS_OFF_LINE_RULE_PROPERTY_CODES,
  RESERVE_LINE_RULE_PROPERTY_CODES,
  TIER_COUNT,
  pbsLineAaPropertyCodes,
} from "./line-rules-metadata.js";
import type {
  LineRuleExportEntry,
  LineRuleGroupRow,
  LoadLineRulesCsvOptions,
} from "./line-rules-types.js";

export { buildLineRulesCsvFromEntries } from "./line-rules-csv.js";
export { buildLineRulesReadme } from "./line-rules-readme.js";
export type { LineRuleExportEntry, LineRuleSkippedProperty } from "./line-rules-types.js";

const validatePbsSchema = (pbsSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(pbsSchema)) {
    throw new Error(`Invalid PBS schema name: ${pbsSchema}`);
  }

  return pbsSchema;
};

const getRosterPeriodDayCount = (startDate: string, endDate: string) =>
  Math.floor(
    (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`))
    / 86_400_000,
  ) + 1;

type CreditWindowDeltaRow = {
  codeValue: string | null;
};

const loadCreditWindowDeltaHours = async (
  options: LoadLineRulesCsvOptions,
  liveSchema: string,
): Promise<number> => {
  const result = await options.db.execute<CreditWindowDeltaRow>(sql`
    select code_value::varchar as "codeValue"
    from ${sql.raw(`${liveSchema}.dictionary`)}
    where parent_code = 'PBS_LINE_CREDIT_WINDOW_CONFIG'
      and code = 'DELTA_HOURS'
    limit 1
  `);
  const deltaHours = parsePbsLineCreditWindowDeltaHours(result.rows[0]?.codeValue);

  if (deltaHours === null) {
    throw new Error(
      "Credit Window Preference requires a valid PBS_LINE_CREDIT_WINDOW_CONFIG DELTA_HOURS value.",
    );
  }

  return deltaHours;
};

const notifySkippedProperty = (
  options: LoadLineRulesCsvOptions,
  row: LineRuleGroupRow,
  reason: string,
) => {
  options.onSkippedProperty?.({
    crewId: row.crewId,
    periodCode: options.periodCode,
    propertyCode: row.propertyCode ?? row.legacyPropertyCode,
    propertyGroupKey: row.propertyGroupKey,
    reason,
  });
};

export const loadLineRulesCsv = async (options: LoadLineRulesCsvOptions) => {
  const liveSchema = validatePbsSchema(options.liveSchema);
  const pbsSchema = validatePbsSchema(options.pbsSchema);
  const crewScopeSql = buildCrewScopeSql(options.scope?.crewIds, sql`${pbsBid.crewId}`);
  const bidSourceSql = buildBidSourceSql(
    options.scope?.bidIds,
    options.periodCode,
    sql`${pbsBid.id}`,
    sql`${pbsBid.periodCode}`,
    sql`${pbsBid.bidContext}`,
  );
  const rosterPeriodDayCount = getRosterPeriodDayCount(
    options.period.rpStartLocal,
    options.period.rpEndLocal,
  );

  if (!Number.isSafeInteger(rosterPeriodDayCount) || rosterPeriodDayCount < 1) {
    throw new Error("The roster period range is invalid for LINE_RULES export.");
  }
  const groupRows = await options.db.execute<LineRuleGroupRow>(sql`
    select
      ${pbsBid.crewId}::varchar as "crewId",
      pbs_bid_tier.tier::integer as tier,
      pbs_bid_group.property_group_key::varchar as "propertyGroupKey",
      pbs_bid_group.bid_type::varchar as "bidType",
      pbs_bid_property.property_code::integer as "propertyCode",
      pbs_bid_group.property_id::integer as "legacyPropertyCode",
      pbs_bid_group.action_id::integer as "actionId",
      pbs_bid_group.operator::varchar as operator,
      pbs_bid_group.param_a::varchar as "paramA",
      pbs_bid_group.param_b::varchar as "paramB",
      pbs_bid_group.param_c::varchar as "paramC"
    from ${sql.raw(`${pbsSchema}.pbs_bid_group`)} pbs_bid_group
    inner join ${pbsBid}
      on pbs_bid_group.bid_id = ${pbsBid.id}
    inner join ${sql.raw(`${liveSchema}.crew`)} crew
      on crew.crew_id = ${pbsBid.crewId}
    inner join ${sql.raw(`${pbsSchema}.pbs_bid_tier`)} pbs_bid_tier
      on pbs_bid_group.tier_id = pbs_bid_tier.id
    left join ${sql.raw(`${pbsSchema}.pbs_bid_property`)} pbs_bid_property
      on pbs_bid_group.property_definition_id = pbs_bid_property.id
    where ${bidSourceSql}
      and (
        pbs_bid_group.bid_type = 'Line'
        or (
          pbs_bid_group.bid_type = 'DaysOff'
          and coalesce(pbs_bid_property.property_code, pbs_bid_group.property_id) in (${sql.join(
            Array.from(DAYS_OFF_LINE_RULE_PROPERTY_CODES).map((propertyCode) => sql`${propertyCode}`),
            sql`, `,
          )})
        )
        or (
          pbs_bid_group.bid_type = 'Reserve'
          and coalesce(pbs_bid_property.property_code, pbs_bid_group.property_id) in (${sql.join(
            Array.from(RESERVE_LINE_RULE_PROPERTY_CODES).map((propertyCode) => sql`${propertyCode}`),
            sql`, `,
          )})
        )
      )
      and ${crewScopeSql}
    order by ${pbsBid.crewId}, pbs_bid_tier.tier, pbs_bid_group.group_seq
  `);
  const hasCreditWindowPreference = groupRows.rows.some(
    (row) =>
      (row.propertyCode ?? row.legacyPropertyCode)
      === pbsLineF8PropertyCodes.creditWindowPreference,
  );
  const creditWindowDeltaHours = hasCreditWindowPreference
    ? await loadCreditWindowDeltaHours(options, liveSchema)
    : null;
  const entries: LineRuleExportEntry[] = [];

  for (const row of groupRows.rows) {
    if (row.tier < 1 || row.tier > TIER_COUNT) {
      continue;
    }

    const entry = buildLineRuleEntry(
      row,
      rosterPeriodDayCount,
      creditWindowDeltaHours,
      options.period.rpStartLocal,
      options.period.rpEndLocal,
    );

    if (!entry) {
      if (row.bidType === "Reserve") {
        continue;
      }

      notifySkippedProperty(
        options,
        row,
        (row.propertyCode ?? row.legacyPropertyCode) === pbsLineAaPropertyCodes.reserve
          ? "Line Reserve requires Award or Avoid."
          : "Unsupported line rule property code.",
      );
      continue;
    }

    entries.push(entry);
  }

  return buildLineRulesCsvFromEntries(entries, options.scope);
};
