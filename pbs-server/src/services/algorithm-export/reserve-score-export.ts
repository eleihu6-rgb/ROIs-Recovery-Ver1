import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import {
  pbsReserveAaPropertyCodes,
  pbsSupportedReservePropertyCatalog,
  type PbsReserveBidValue,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import { pbsBid } from "../../models/index.js";
import { deserializeRuleBid, type ReserveDateScope } from "../lineholder/rule-bid-value.js";
import { buildPairingScoreCsvFromMatches, type PairingScoreMatch } from "./pairing-score-export.js";
import { buildCrewScopeSql, type AlgorithmExportScope } from "./export-scope.js";

type Database = ReturnType<typeof drizzle>;

type ReserveScoreGroupRow = {
  crewId: string;
  tier: number;
  propertyGroupKey: string;
  propertyCode: number | null;
  legacyPropertyCode: number;
  actionId: number | null;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};

type ReserveScoreMatchRow = {
  pairingId: string;
  interfaceId: string | null;
};

export type ReserveScoreSkippedProperty = {
  crewId: string;
  periodCode: string;
  propertyCode: number;
  propertyGroupKey: string;
  reason: string;
};

type LoadReserveScoreCsvOptions = {
  db: Pick<Database, "execute">;
  pgPool: Pool;
  periodCode: string;
  liveSchema: string;
  scope?: AlgorithmExportScope;
  onSkippedProperty?: (event: ReserveScoreSkippedProperty) => void;
};

const TIER_COUNT = 7;

const propertyCatalogByCode = new Map(
  pbsSupportedReservePropertyCatalog.map((property) => [property.propertyCode, property]),
);

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

const mapReserveActionFromId = (actionId: number | null): "award" | "avoid" | null => {
  if (actionId === 1) {
    return "award";
  }

  if (actionId === 2) {
    return "avoid";
  }

  return null;
};

const resolveReserveAction = (propertyCode: number, actionId: number | null): "award" | "avoid" => {
  if (propertyCode === pbsReserveAaPropertyCodes.preferOff) {
    return "avoid";
  }

  const explicitAction = mapReserveActionFromId(actionId);

  if (explicitAction) {
    return explicitAction;
  }

  return "award";
};

const buildReserveBid = (row: ReserveScoreGroupRow): PbsReserveBidValue | null => {
  const propertyCode = row.propertyCode ?? row.legacyPropertyCode;
  const definition = propertyCatalogByCode.get(propertyCode);

  if (!definition) {
    return null;
  }

  return deserializeRuleBid(definition, {
    operator: row.operator,
    paramA: row.paramA,
    paramB: row.paramB,
    paramC: row.paramC,
  });
};

const buildConditionCacheKey = (row: ReserveScoreGroupRow) =>
  [
    row.propertyCode ?? row.legacyPropertyCode,
    row.operator ?? "",
    row.paramA ?? "",
    row.paramB ?? "",
    row.paramC ?? "",
  ].join("\u001f");

const RESERVE_LINE_RULE_DATE_SCOPE_MODES = new Set(["whole_month"]);

const isLineLevelReserveBid = (bid: PbsReserveBidValue) =>
  bid.type === "reserve-call-type-date-scope"
  && RESERVE_LINE_RULE_DATE_SCOPE_MODES.has(bid.dateScope.mode);

const normalizeDate = (value: string) => value.trim();

const monthNameToIndex = new Map([
  ["jan", 0],
  ["january", 0],
  ["feb", 1],
  ["february", 1],
  ["mar", 2],
  ["march", 2],
  ["apr", 3],
  ["april", 3],
  ["may", 4],
  ["jun", 5],
  ["june", 5],
  ["jul", 6],
  ["july", 6],
  ["aug", 7],
  ["august", 7],
  ["sep", 8],
  ["sept", 8],
  ["september", 8],
  ["oct", 9],
  ["october", 9],
  ["nov", 10],
  ["november", 10],
  ["dec", 11],
  ["december", 11],
]);

const parsePeriodMonthStart = (periodCode: string) => {
  const trimmed = periodCode.trim();
  const isoMatch = /^(\d{4})-(\d{2})/.exec(trimmed);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-01`;
  }

  const namedMatch = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);

  if (!namedMatch) {
    return null;
  }

  const monthIndex = monthNameToIndex.get(namedMatch[1]!.toLowerCase());

  if (monthIndex == null) {
    return null;
  }

  return `${namedMatch[2]}-${String(monthIndex + 1).padStart(2, "0")}-01`;
};

const buildReserveDateScopeSql = (
  dateExpression: string,
  dateScope: ReserveDateScope,
  periodMonthStart: string,
  params: unknown[],
): string => {
  if (dateScope.mode === "whole_month") {
    params.push(periodMonthStart);
    return `${dateExpression} >= $${params.length}::date
      and ${dateExpression} < ($${params.length}::date + interval '1 month')`;
  }

  if (dateScope.mode === "first_half") {
    params.push(periodMonthStart);
    return `${dateExpression} >= $${params.length}::date
      and ${dateExpression} < ($${params.length}::date + interval '15 days')`;
  }

  if (dateScope.mode === "second_half") {
    params.push(periodMonthStart);
    return `${dateExpression} >= ($${params.length}::date + interval '15 days')
      and ${dateExpression} < ($${params.length}::date + interval '1 month')`;
  }

  if (dateScope.mode === "date_range") {
    params.push(normalizeDate(dateScope.from), normalizeDate(dateScope.to));
    return `${dateExpression} >= $${params.length - 1}::date
      and ${dateExpression} <= $${params.length}::date`;
  }

  const dates = dateScope.dates.map(normalizeDate).filter(Boolean);

  if (dates.length === 0) {
    return "false";
  }

  params.push(dates);
  return `${dateExpression} = any($${params.length}::date[])`;
};

const buildTagListDateSql = (
  dateExpression: string,
  values: string[],
  params: unknown[],
): string => {
  const dates = values.map(normalizeDate).filter(Boolean);

  if (dates.length === 0) {
    return "false";
  }

  params.push(dates);
  return `${dateExpression} = any($${params.length}::date[])`;
};

const loadMatchingReservePairings = async (
  pgPool: Pool,
  schema: string,
  periodCode: string,
  bid: PbsReserveBidValue,
) => {
  const periodMonthStart = parsePeriodMonthStart(periodCode);

  if (!periodMonthStart) {
    throw new Error(`Invalid periodCode for reserve score export: ${periodCode}`);
  }

  const params: unknown[] = [];
  const localDateExpression = "(p.sch_str_dt_utc at time zone a.zone_id)::date";
  let condition: string | null = null;

  if (bid.type === "reserve-call-type-date-scope") {
    params.push(bid.callType);
    condition = `p.assignment = $${params.length}
      and ${buildReserveDateScopeSql(localDateExpression, bid.dateScope, periodMonthStart, params)}`;
  } else if (bid.type === "tag-list") {
    condition = buildTagListDateSql(localDateExpression, bid.values, params);
  }

  if (!condition) {
    return null;
  }

  const result = await pgPool.query<ReserveScoreMatchRow>(
    `
      select
        p.id::text as "pairingId",
        p.interface_id::varchar as "interfaceId"
      from ${schema}.pairing p
      inner join ${schema}.airport a
        on a.airport = p.base
      where p.is_deleted = 0
        and p.assignment_group = 'SBY'
        and ${condition}
      order by p.id
    `,
    params,
  );

  return result.rows;
};

const notifySkippedProperty = (
  options: LoadReserveScoreCsvOptions,
  row: ReserveScoreGroupRow,
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

export const loadReserveScoreCsv = async (options: LoadReserveScoreCsvOptions) => {
  const schema = validateLiveSchema(options.liveSchema);
  const crewScopeSql = buildCrewScopeSql(options.scope?.crewIds);
  const groupRows = await options.db.execute<ReserveScoreGroupRow>(sql`
    select
      ${pbsBid.crewId}::varchar as "crewId",
      pbs_bid_tier.tier::integer as tier,
      pbs_bid_group.property_group_key::varchar as "propertyGroupKey",
      pbs_bid_property.property_code::integer as "propertyCode",
      pbs_bid_group.property_id::integer as "legacyPropertyCode",
      pbs_bid_group.action_id::integer as "actionId",
      pbs_bid_group.operator::varchar as operator,
      pbs_bid_group.param_a::varchar as "paramA",
      pbs_bid_group.param_b::varchar as "paramB",
      pbs_bid_group.param_c::varchar as "paramC"
    from pbs_bid_group
    inner join ${pbsBid}
      on pbs_bid_group.bid_id = ${pbsBid.id}
    inner join pbs_bid_tier
      on pbs_bid_group.tier_id = pbs_bid_tier.id
    left join pbs_bid_property
      on pbs_bid_group.property_definition_id = pbs_bid_property.id
    where ${pbsBid.periodCode} = ${options.periodCode}
      and ${pbsBid.bidContext} = 'Current'
      and pbs_bid_group.bid_type = 'Reserve'
      and ${crewScopeSql}
    order by ${pbsBid.crewId}, pbs_bid_tier.tier, pbs_bid_group.group_seq
  `);
  const matches: PairingScoreMatch[] = [];
  const matchesByCondition = new Map<string, ReserveScoreMatchRow[]>();

  for (const row of groupRows.rows) {
    if (row.tier < 1 || row.tier > TIER_COUNT) {
      continue;
    }

    const propertyCode = row.propertyCode ?? row.legacyPropertyCode;
    const bid = buildReserveBid(row);

    if (!bid) {
      notifySkippedProperty(options, row, "Unsupported reserve property code.");
      continue;
    }

    if (isLineLevelReserveBid(bid)) {
      continue;
    }

    const cacheKey = buildConditionCacheKey(row);
    let matchingReservePairings = matchesByCondition.get(cacheKey);

    if (!matchingReservePairings) {
      const loadedMatches = await loadMatchingReservePairings(options.pgPool, schema, options.periodCode, bid);

      if (!loadedMatches) {
        notifySkippedProperty(options, row, "Unsupported reserve property type.");
        matchesByCondition.set(cacheKey, []);
        continue;
      }

      matchingReservePairings = loadedMatches;
      matchesByCondition.set(cacheKey, matchingReservePairings);
    }

    const action = resolveReserveAction(propertyCode, row.actionId);

    for (const reservePairing of matchingReservePairings) {
      matches.push({
        crewId: row.crewId,
        pairingId: reservePairing.pairingId,
        interfaceId: reservePairing.interfaceId,
        tier: row.tier,
        action,
      });
    }
  }

  return buildPairingScoreCsvFromMatches(matches, options.scope);
};

export const __testReserveScore = {
  buildReserveDateScopeSql,
};
