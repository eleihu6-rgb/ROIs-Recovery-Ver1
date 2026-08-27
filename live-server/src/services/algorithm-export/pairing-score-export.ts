import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import {
  parsePbsEfficientFlyingPercentileDefinition,
  pbsBidDefinitionCodes,
} from "../../../../packages/contracts/pbs-bid-definitions.js";
import {
  isPbsPairingCreditPriorityProperty,
  pbsPairingPropertyCatalog,
  type PbsPairingBidAction,
  type PbsPairingBidQuantifier,
  type PbsPairingBidValue,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";
import {
  pbsBid,
} from "../../models/index.js";
import type { RuleBidValue, RulePropertyDefinition } from "../lineholder/rule-bid-types.js";
import { deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { buildPreviewCondition } from "../pairing-search/pairing-search-condition-builder.js";
import {
  createPairingSearchSqlBuilder,
  type PairingSearchSqlBuilder,
} from "../pairing-search/pairing-search-sql-builder.js";
import { escapeCsvCell } from "./csv.js";
import type { AlgorithmExportPeriodContext } from "./types.js";
import {
  buildBidSourceSql,
  buildCrewScopeSql,
  compareCrewScopedRows,
  type AlgorithmExportScope,
} from "./export-scope.js";
import { loadRedeyeDefinition } from "../pbs-bid-definitions/redeye-config.js";

export type PairingScopeFilter = {
  dateStart?: string;
  dateEnd?: string;
  datePadDays?: number;
  bases?: readonly string[];
  divisions?: readonly string[];
  ranks?: readonly string[];
};

const SCENARIO_PAIRING_DATE_PAD_DAYS = 7;

const padIsoDate = (iso: string, deltaDays: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

const nonEmpty = (values: readonly string[] | undefined): string[] | null =>
  values && values.length > 0 ? [...values] : null;

const buildScenarioFilterClause = (
  filter: PairingScopeFilter | undefined,
  schema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  localOriginDateExpression: string,
): string => {
  if (!filter) {
    return "";
  }

  const clauses: string[] = [];

  if (filter.dateStart && filter.dateEnd) {
    const padDays = filter.datePadDays ?? SCENARIO_PAIRING_DATE_PAD_DAYS;
    const lo = padIsoDate(filter.dateStart, -padDays);
    const hi = padIsoDate(filter.dateEnd, padDays);
    clauses.push(
      `${localOriginDateExpression} `
      + `between ${sqlBuilder.addParam(lo)}::date and ${sqlBuilder.addParam(hi)}::date`,
    );
  }

  const bases = nonEmpty(filter.bases);
  if (bases) {
    clauses.push(`p.base = any(${sqlBuilder.addParam(bases)}::varchar[])`);
  }

  const divisions = nonEmpty(filter.divisions);
  const ranks = nonEmpty(filter.ranks);
  if (divisions || ranks) {
    const parts: string[] = [];
    if (divisions) {
      parts.push(`p.division = any(${sqlBuilder.addParam(divisions)}::varchar[])`);
    }
    if (ranks) {
      parts.push(
        `exists (select 1 from ${schema}.pairing_composition pc `
        + `where pc.pairing_id = p.id and pc.is_deleted = 0 `
        + `and pc.acting_rank = any(${sqlBuilder.addParam(ranks)}::varchar[]))`,
      );
    }
    clauses.push(`(${parts.join(" or ")})`);
  }

  return clauses.length > 0 ? ` and ${clauses.join(" and ")}` : "";
};

type Database = ReturnType<typeof drizzle>;

type PairingScoreGroupRow = {
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
  preferenceJson: {
    creditPriority?: unknown;
  } | null;
};

type PairingScoreMatchRow = {
  pairingId: string;
  interfaceId: string | null;
  base: string;
  localOriginDate: string;
  localDayStartUtc: Date | string;
  localDayEndUtc: Date | string;
  division?: string | null;
  actingRanks?: string[];
};

type EfficientFlyingMode = "efficient" | "inefficient";

type EfficientFlyingCohortRow = PairingScoreMatchRow & {
  averageDailyCredit: string | number;
  isEfficient: boolean;
  isInefficient: boolean;
};

type PairingBaseZoneRow = {
  base: string | null;
  zoneId: string;
};

type PairingBaseZoneGroup = {
  bases: string[];
  includeMissingBase: boolean;
  zoneId: string;
};

export type CrewPairingEligibilityFacet = {
  bases: readonly {
    id: string;
    base: string;
    effectiveAt: Date | string;
    expiresAt: Date | string | null;
  }[];
  ranks: readonly {
    rank: string;
    effectiveAt: Date | string;
    expiresAt: Date | string | null;
  }[];
};

export type CrewPairingEligibility = ReadonlyMap<string, CrewPairingEligibilityFacet>;

const toEpochMillis = (value: Date | string): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

const overlapsLocalDay = (
  effectiveAt: Date | string,
  expiresAt: Date | string | null,
  localDayStartUtc: Date | string,
  localDayEndUtc: Date | string,
) =>
  toEpochMillis(effectiveAt) < toEpochMillis(localDayEndUtc)
  && (expiresAt == null || toEpochMillis(expiresAt) >= toEpochMillis(localDayStartUtc));

const isCrewEligibleForPairing = (
  eligibility: CrewPairingEligibility | undefined,
  crewId: string,
  pairing: PairingScoreMatchRow,
): boolean => {
  if (!eligibility) {
    return true;
  }

  const facet = eligibility.get(crewId);
  if (!facet) {
    return false;
  }

  const activeBase = facet.bases
    .filter((base) => overlapsLocalDay(
      base.effectiveAt,
      base.expiresAt,
      pairing.localDayStartUtc,
      pairing.localDayEndUtc,
    ))
    .sort((left, right) => {
      const effectiveCompare = toEpochMillis(right.effectiveAt) - toEpochMillis(left.effectiveAt);
      return effectiveCompare !== 0
        ? effectiveCompare
        : Number.parseInt(right.id, 10) - Number.parseInt(left.id, 10);
    })[0];

  if (!activeBase || activeBase.base.trim().toUpperCase() !== pairing.base.trim().toUpperCase()) {
    return false;
  }

  const activeRanks = new Set(
    facet.ranks
      .filter((rank) => overlapsLocalDay(
        rank.effectiveAt,
        rank.expiresAt,
        pairing.localDayStartUtc,
        pairing.localDayEndUtc,
      ))
      .map((rank) => rank.rank.trim().toUpperCase()),
  );

  return (pairing.actingRanks ?? []).some((rank) => activeRanks.has(rank.trim().toUpperCase()));
};

export type PairingScoreMatch = {
  crewId: string;
  pairingId: string;
  interfaceId: string | null;
  tier: number;
  action: PbsPairingBidAction;
  creditPriority?: "higher" | "lower";
};

export type PairingScoreSkippedProperty = {
  crewId: string;
  periodCode: string;
  propertyCode: number;
  propertyGroupKey: string;
  reason: string;
};

type LoadPairingScoreCsvOptions = {
  db: Pick<Database, "execute">;
  pgPool: Pool;
  periodCode: string;
  period: AlgorithmExportPeriodContext;
  liveSchema: string;
  pbsSchema: string;
  scope?: AlgorithmExportScope;
  pairingFilter?: PairingScopeFilter;
  crewEligibility?: CrewPairingEligibility;
  onSkippedProperty?: (event: PairingScoreSkippedProperty) => void;
};

const TIER_COUNT = 7;
const NEGATIVE_DEFAULT_PROPERTY_CODES = new Set([148, 151, 156, 160]);

const PAIRING_SCORE_CSV_HEADER = [
  "Crew_ID",
  "Pairing_ID",
  "Interface_ID",
  "Award_Higher_Credit_Tiers",
  "Avoid_Higher_Credit_Tiers",
  ...Array.from({ length: TIER_COUNT }, (_, index) => [
    `T${index + 1}_Award_Counter`,
    `T${index + 1}_Avoid_Counter`,
  ]).flat(),
];

const propertyCatalogByCode = new Map(
  pbsPairingPropertyCatalog.map((property) => [property.propertyCode, property]),
);

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

const mapPairingActionFromId = (actionId: number | null): PbsPairingBidAction | null => {
  if (actionId === 1) {
    return "award";
  }

  if (actionId === 2) {
    return "avoid";
  }

  return null;
};

const mapPairingQuantifier = (value: string | null): PbsPairingBidQuantifier | null =>
  value === "any" || value === "every" ? value : null;

const resolveScoreAction = (
  propertyCode: number,
  actionId: number | null,
): PbsPairingBidAction => {
  const explicitAction = mapPairingActionFromId(actionId);

  if (explicitAction) {
    return explicitAction;
  }

  const definition = propertyCatalogByCode.get(propertyCode);

  if (definition?.defaultAction) {
    return definition.defaultAction;
  }

  return NEGATIVE_DEFAULT_PROPERTY_CODES.has(propertyCode) ? "avoid" : "award";
};

const CURRENT_JSON_BID_TYPES = new Map<number, PbsPairingBidValue["type"]>([
  [103, "pairing-check-time"],
  [107, "flight-legs-per-duty"],
  [163, "month-end-carryover"],
  [428, "efficient-flying-preference"],
]);

const parseCurrentJsonBid = (
  propertyCode: number,
  operator: string | null,
  paramA: string | null,
): PbsPairingBidValue | null => {
  const expectedType = CURRENT_JSON_BID_TYPES.get(propertyCode);
  if (!expectedType || operator !== "Json" || !paramA) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(paramA);
    if (
      parsed !== null
      && typeof parsed === "object"
      && !Array.isArray(parsed)
      && (parsed as { type?: unknown }).type === expectedType
    ) {
      return parsed as PbsPairingBidValue;
    }
  } catch {
    return null;
  }

  return null;
};

const parseLegacyPairingLengthBid = (
  propertyCode: number,
  operator: string | null,
  paramA: string | null,
  paramB: string | null,
): PbsPairingBidValue | null => {
  if (propertyCode !== 112 || operator === "Json") {
    return null;
  }

  const first = Number(paramA);
  if (!Number.isSafeInteger(first) || first < 1) {
    return null;
  }

  if (operator === "Between") {
    const second = Number(paramB);
    return Number.isSafeInteger(second) && second >= first
      ? { type: "stepper-range", from: first, to: second, min: 1, max: 7 }
      : null;
  }

  return operator === "<" || operator === ">" || operator === "="
    ? { type: "stepper", value: first, min: 1, max: 7, operator }
    : null;
};

const buildSearchProperty = (row: PairingScoreGroupRow): PbsPairingSearchPreviewProperty | null => {
  const propertyCode = row.propertyCode ?? row.legacyPropertyCode;
  const definition = propertyCatalogByCode.get(propertyCode);

  if (!definition) {
    return null;
  }

  const currentBid = parseCurrentJsonBid(propertyCode, row.operator, row.paramA)
    ?? parseLegacyPairingLengthBid(propertyCode, row.operator, row.paramA, row.paramB);

  return {
    propertyCode,
    name: definition.name,
    action: "award",
    quantifier: mapPairingQuantifier(row.paramC),
    bid: currentBid ?? deserializeRuleBid(
      definition as unknown as RulePropertyDefinition<RuleBidValue>,
      {
        operator: row.operator,
        paramA: row.paramA,
        paramB: row.paramB,
        paramC: row.paramC,
      },
    ) as PbsPairingBidValue,
  };
};

const buildConditionCacheKey = (row: PairingScoreGroupRow) =>
  [
    row.propertyCode ?? row.legacyPropertyCode,
    row.operator ?? "",
    row.paramA ?? "",
    row.paramB ?? "",
    row.paramC ?? "",
  ].join("\u001f");

const loadPairingBaseZoneGroups = async (
  pgPool: Pool,
  schema: string,
  requestedBases?: readonly string[],
): Promise<PairingBaseZoneGroup[]> => {
  const result = await pgPool.query<PairingBaseZoneRow>(
    `
      select distinct
        nullif(upper(btrim(pairing_base_source.base)), '') as base,
        coalesce(pairing_base_tz.name, 'UTC') as "zoneId"
      from ${schema}.pairing pairing_base_source
      left join ${schema}.airport pairing_base_airport
        on upper(btrim(pairing_base_airport.airport)) = upper(btrim(pairing_base_source.base))
      left join pg_timezone_names pairing_base_tz
        on pairing_base_tz.name = nullif(btrim(pairing_base_airport.zone_id), '')
      where pairing_base_source.is_deleted = 0
      order by base
    `,
  );
  const requestedBaseSet = requestedBases && requestedBases.length > 0
    ? new Set(requestedBases.map((base) => base.trim().toUpperCase()).filter(Boolean))
    : null;
  const groupsByZone = new Map<string, PairingBaseZoneGroup>();

  for (const row of result.rows) {
    const base = row.base?.trim().toUpperCase() || null;
    const zoneId = row.zoneId.trim();

    if (!/^[A-Za-z0-9_+./-]+$/.test(zoneId) || (base && requestedBaseSet && !requestedBaseSet.has(base))) {
      continue;
    }

    const group = groupsByZone.get(zoneId) ?? {
      bases: [],
      includeMissingBase: false,
      zoneId,
    };

    if (base && /^[A-Z0-9]{3,5}$/.test(base)) {
      group.bases.push(base);
    } else if (!base && !requestedBaseSet) {
      group.includeMissingBase = true;
    }

    groupsByZone.set(zoneId, group);
  }

  return Array.from(groupsByZone.values()).filter((group) =>
    group.bases.length > 0 || group.includeMissingBase);
};

const loadMatchingPairings = async (
  pgPool: Pool,
  schema: string,
  property: PbsPairingSearchPreviewProperty,
  period: AlgorithmExportPeriodContext,
  pairingFilter?: PairingScopeFilter,
  pairingBaseZoneExpression?: string,
  pairingBaseScope?: Pick<PairingBaseZoneGroup, "bases" | "includeMissingBase">,
  redeye?: PbsRedeyeDefinition,
) => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(property, schema, sqlBuilder, {
    pairingBaseZoneExpression,
    periodStartDate: period.rpStartLocal,
    periodEndDate: period.rpEndLocal,
    redeye,
  });
  const localOriginDateExpression = "pairing_origin.local_origin_date";
  const scenarioClause = buildScenarioFilterClause(
    pairingFilter,
    schema,
    sqlBuilder,
    localOriginDateExpression,
  );
  const pairingBaseScopeClause = pairingBaseScope
    ? pairingBaseScope.bases.length > 0 && pairingBaseScope.includeMissingBase
      ? ` and (upper(btrim(p.base)) = any(${sqlBuilder.addParam(pairingBaseScope.bases)}::varchar[])
          or nullif(btrim(p.base), '') is null)`
      : pairingBaseScope.bases.length > 0
        ? ` and upper(btrim(p.base)) = any(${sqlBuilder.addParam(pairingBaseScope.bases)}::varchar[])`
        : ` and nullif(btrim(p.base), '') is null`
    : "";
  const result = await pgPool.query<PairingScoreMatchRow>(
    `
      select
        p.id::text as "pairingId",
        p.interface_id::varchar as "interfaceId",
        p.base::varchar as "base",
        pairing_origin.local_origin_date::text as "localOriginDate",
        (pairing_origin.local_origin_date::timestamp at time zone base_tz.name) as "localDayStartUtc",
        ((pairing_origin.local_origin_date + 1)::timestamp at time zone base_tz.name) as "localDayEndUtc",
        p.division::varchar as "division",
        coalesce(
          (
            select array_agg(distinct pc.acting_rank)
            from ${schema}.pairing_composition pc
            where pc.pairing_id = p.id
              and pc.is_deleted = 0
              and pc.acting_rank is not null
          ),
          '{}'::varchar[]
        ) as "actingRanks"
      from ${schema}.pairing p
      join lateral (
        select min(coalesce(
          origin_segment.duty_sch_str_dt_utc,
          origin_segment.brief_start_utc,
          origin_segment.sch_str_dt_utc
        )) as origin_start_utc
        from ${schema}.pairing_segment origin_segment
        where origin_segment.pairing_id = p.id
          and origin_segment.is_deleted = 0
      ) origin_segment on origin_segment.origin_start_utc is not null
      join ${schema}.airport base_airport
        on upper(btrim(base_airport.airport)) = upper(btrim(p.base))
      join pg_timezone_names base_tz
        on base_tz.name = nullif(btrim(base_airport.zone_id), '')
      cross join lateral (
        select (origin_segment.origin_start_utc at time zone base_tz.name)::date as local_origin_date
      ) pairing_origin
      where p.is_deleted = 0
        and upper(btrim(p.assignment_group)) = 'FLY'
        and ${condition}${scenarioClause}${pairingBaseScopeClause}
      order by p.id
    `,
    sqlBuilder.params,
  );

  return result.rows;
};

type EfficientFlyingPercentileRow = {
  codeValue: string | null;
};

const parseEfficientFlyingPercentile = (value: string | null | undefined): number | null => {
  const definition = parsePbsEfficientFlyingPercentileDefinition({ percentile: value });
  return definition.available ? definition.percentile : null;
};

const loadEfficientFlyingPercentile = async (
  options: LoadPairingScoreCsvOptions,
  liveSchema: string,
): Promise<number> => {
  const result = await options.db.execute<EfficientFlyingPercentileRow>(sql`
    select code_value::varchar as "codeValue"
    from ${sql.raw(`${liveSchema}.dictionary`)}
    where parent_code = ${pbsBidDefinitionCodes.efficientFlyingParent}
      and code = ${pbsBidDefinitionCodes.efficientFlyingPercentile}
    order by id
  `);

  if (result.rows.length !== 1) {
    throw new Error(
      "Efficient Flying First requires exactly one PBS_EFFICIENT_FLYING_CONFIG PERCENTILE value.",
    );
  }

  const percentile = parseEfficientFlyingPercentile(result.rows[0]?.codeValue);

  if (percentile === null) {
    throw new Error(
      "Efficient Flying First requires an integer PBS_EFFICIENT_FLYING_CONFIG PERCENTILE value from 1 to 50.",
    );
  }

  return percentile;
};

const loadEfficientFlyingCohort = async (
  pgPool: Pool,
  schema: string,
  period: AlgorithmExportPeriodContext,
  percentile: number,
  pairingFilter?: PairingScopeFilter,
): Promise<EfficientFlyingCohortRow[]> => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const effectiveFilter = pairingFilter ?? {
    dateStart: period.rpStartLocal,
    dateEnd: period.rpEndLocal,
    datePadDays: 0,
  };
  const scenarioClause = buildScenarioFilterClause(
    effectiveFilter,
    schema,
    sqlBuilder,
    "pairing_origin.local_origin_date",
  );
  const percentilePlaceholder = sqlBuilder.addParam(percentile);
  const result = await pgPool.query<EfficientFlyingCohortRow>(
    `
      with scoped_pairings as (
        select
          p.id::text as "pairingId",
          p.interface_id::varchar as "interfaceId",
          p.base::varchar as "base",
          pairing_origin.local_origin_date::text as "localOriginDate",
          (pairing_origin.local_origin_date::timestamp at time zone base_tz.name) as "localDayStartUtc",
          ((pairing_origin.local_origin_date + 1)::timestamp at time zone base_tz.name) as "localDayEndUtc",
          p.division::varchar as "division",
          coalesce(
            (
              select array_agg(distinct pc.acting_rank)
              from ${schema}.pairing_composition pc
              where pc.pairing_id = p.id
                and pc.is_deleted = 0
                and pc.acting_rank is not null
            ),
            '{}'::varchar[]
          ) as "actingRanks",
          (
            coalesce(
              (
                select sum(coalesce(duty_credit.duty_act_credited_minutes::numeric, 0))
                from (
                  select distinct on (credit_segment.duty_seq)
                    credit_segment.duty_seq,
                    credit_segment.duty_act_credited_minutes
                  from ${schema}.pairing_segment credit_segment
                  where credit_segment.pairing_id = p.id
                    and credit_segment.is_deleted = 0
                  order by credit_segment.duty_seq asc, credit_segment.seg_seq asc
                ) duty_credit
              ),
              0
            ) / p.duration_days::numeric
          ) as average_daily_credit
        from ${schema}.pairing p
        join lateral (
          select min(coalesce(
            origin_segment.duty_sch_str_dt_utc,
            origin_segment.brief_start_utc,
            origin_segment.sch_str_dt_utc
          )) as origin_start_utc
          from ${schema}.pairing_segment origin_segment
          where origin_segment.pairing_id = p.id
            and origin_segment.is_deleted = 0
        ) origin_segment on origin_segment.origin_start_utc is not null
        join ${schema}.airport base_airport
          on upper(btrim(base_airport.airport)) = upper(btrim(p.base))
        join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        cross join lateral (
          select (origin_segment.origin_start_utc at time zone base_tz.name)::date as local_origin_date
        ) pairing_origin
        where p.is_deleted = 0
          and upper(btrim(p.assignment_group)) = 'FLY'
          and p.duration_days > 0${scenarioClause}
      ),
      band_size as (
        select
          count(*)::integer as cohort_size,
          greatest(
            1,
            round(count(*)::numeric * ${percentilePlaceholder}::numeric / 100)::integer
          ) as band_count
        from scoped_pairings
      ),
      cutoffs as (
        select
          (array_agg(
            scoped_pairings.average_daily_credit
            order by scoped_pairings.average_daily_credit asc
          ))[band_size.band_count] as inefficient_cutoff,
          (array_agg(
            scoped_pairings.average_daily_credit
            order by scoped_pairings.average_daily_credit asc
          ))[band_size.cohort_size - band_size.band_count + 1] as efficient_cutoff
        from scoped_pairings
        cross join band_size
        group by band_size.cohort_size, band_size.band_count
      )
      select
        scoped_pairings."pairingId",
        scoped_pairings."interfaceId",
        scoped_pairings."base",
        scoped_pairings."localOriginDate",
        scoped_pairings."localDayStartUtc",
        scoped_pairings."localDayEndUtc",
        scoped_pairings."division",
        scoped_pairings."actingRanks",
        scoped_pairings.average_daily_credit as "averageDailyCredit",
        scoped_pairings.average_daily_credit >= cutoffs.efficient_cutoff as "isEfficient",
        scoped_pairings.average_daily_credit <= cutoffs.inefficient_cutoff as "isInefficient"
      from scoped_pairings
      cross join cutoffs
      order by scoped_pairings."pairingId"
    `,
    sqlBuilder.params,
  );

  return result.rows;
};

const parseEfficientFlyingMode = (
  property: PbsPairingSearchPreviewProperty,
): EfficientFlyingMode | null =>
  property.bid.type === "efficient-flying-preference"
    && (property.bid.mode === "efficient" || property.bid.mode === "inefficient")
    ? property.bid.mode
    : null;

type PairingScoreCounterRow = {
  crewId: string;
  pairingId: string;
  interfaceId: string | null;
  awardHigherCreditTiers: Set<number>;
  avoidHigherCreditTiers: Set<number>;
  awardCounters: number[];
  avoidCounters: number[];
};

const createCounterRow = (
  crewId: string,
  pairingId: string,
  interfaceId: string | null,
): PairingScoreCounterRow => ({
  crewId,
  pairingId,
  interfaceId,
  awardHigherCreditTiers: new Set<number>(),
  avoidHigherCreditTiers: new Set<number>(),
  awardCounters: Array.from({ length: TIER_COUNT }, () => 0),
  avoidCounters: Array.from({ length: TIER_COUNT }, () => 0),
});

const normalizeCreditPriority = (value: unknown): "higher" | "lower" | undefined =>
  value === "higher" || value === "lower" ? value : undefined;

const collectHigherCreditTier = (row: PairingScoreCounterRow, match: PairingScoreMatch) => {
  const creditPriority = normalizeCreditPriority(match.creditPriority);

  if (!creditPriority) {
    return;
  }

  if (
    (match.action === "award" && creditPriority === "higher")
    || (match.action === "avoid" && creditPriority === "lower")
  ) {
    row.awardHigherCreditTiers.add(match.tier);
    return;
  }

  row.avoidHigherCreditTiers.add(match.tier);
};

const incrementCounter = (
  rowsByKey: Map<string, PairingScoreCounterRow>,
  match: PairingScoreMatch,
) => {
  if (match.tier < 1 || match.tier > TIER_COUNT) {
    return;
  }

  const key = `${match.crewId}|${match.pairingId}`;
  const row = rowsByKey.get(key) ?? createCounterRow(match.crewId, match.pairingId, match.interfaceId);

  if (!row.interfaceId && match.interfaceId) {
    row.interfaceId = match.interfaceId;
  }

  if (match.action === "avoid") {
    row.avoidCounters[match.tier - 1] += 1;
  } else {
    row.awardCounters[match.tier - 1] += 1;
  }

  collectHigherCreditTier(row, match);
  rowsByKey.set(key, row);
};

const serializeTierList = (tiers: Set<number>) =>
  `[${Array.from(tiers).sort((left, right) => left - right).join(",")}]`;

const comparePairingScoreRows = (
  left: PairingScoreCounterRow,
  right: PairingScoreCounterRow,
  scope?: AlgorithmExportScope,
) => {
  const crewCompare = compareCrewScopedRows(left, right, scope);

  if (crewCompare !== 0) {
    return crewCompare;
  }

  const leftPairingId = Number.parseInt(left.pairingId, 10);
  const rightPairingId = Number.parseInt(right.pairingId, 10);

  if (Number.isSafeInteger(leftPairingId) && Number.isSafeInteger(rightPairingId)) {
    return leftPairingId - rightPairingId;
  }

  return left.pairingId.localeCompare(right.pairingId);
};

export const serializePairingScoreRowsToCsv = (
  rows: PairingScoreCounterRow[],
  scope?: AlgorithmExportScope,
) => {
  const lines = [
    PAIRING_SCORE_CSV_HEADER.join(","),
    ...rows
      .sort((left, right) => comparePairingScoreRows(left, right, scope))
      .map((row) => [
        row.crewId,
        row.pairingId,
        row.interfaceId ?? "",
        serializeTierList(row.awardHigherCreditTiers),
        serializeTierList(row.avoidHigherCreditTiers),
        ...row.awardCounters.flatMap((awardCounter, index) => [
          awardCounter,
          row.avoidCounters[index] ?? 0,
        ]),
      ].map(escapeCsvCell).join(",")),
  ];

  return `${lines.join("\n")}\n`;
};

export const buildPairingScoreCsvFromMatches = (
  matches: PairingScoreMatch[],
  scope?: AlgorithmExportScope,
) => {
  const rowsByKey = new Map<string, PairingScoreCounterRow>();

  for (const match of matches) {
    incrementCounter(rowsByKey, match);
  }

  return serializePairingScoreRowsToCsv(Array.from(rowsByKey.values()), scope);
};

const notifySkippedProperty = (
  options: LoadPairingScoreCsvOptions,
  row: PairingScoreGroupRow,
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

export const loadPairingScoreCsv = async (options: LoadPairingScoreCsvOptions) => {
  const schema = validateLiveSchema(options.liveSchema);
  const pbsSchema = validateLiveSchema(options.pbsSchema);
  const crewScopeSql = buildCrewScopeSql(options.scope?.crewIds, sql`${pbsBid.crewId}`);
  const bidSourceSql = buildBidSourceSql(
    options.scope?.bidIds,
    options.periodCode,
    sql`${pbsBid.id}`,
    sql`${pbsBid.periodCode}`,
    sql`${pbsBid.bidContext}`,
  );
  const groupRows = await options.db.execute<PairingScoreGroupRow>(sql`
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
      pbs_bid_group.param_c::varchar as "paramC",
      pbs_bid_group.preference_json as "preferenceJson"
    from ${sql.raw(`${pbsSchema}.pbs_bid_group`)} pbs_bid_group
    inner join ${pbsBid}
      on pbs_bid_group.bid_id = ${pbsBid.id}
    inner join ${sql.raw(`${schema}.crew`)} crew
      on crew.crew_id = ${pbsBid.crewId}
    inner join ${sql.raw(`${pbsSchema}.pbs_bid_tier`)} pbs_bid_tier
      on pbs_bid_group.tier_id = pbs_bid_tier.id
    left join ${sql.raw(`${pbsSchema}.pbs_bid_property`)} pbs_bid_property
      on pbs_bid_group.property_definition_id = pbs_bid_property.id
    where ${bidSourceSql}
      and pbs_bid_group.bid_type = 'Pairing'
      and ${crewScopeSql}
    order by ${pbsBid.crewId}, pbs_bid_tier.tier, pbs_bid_group.group_seq
  `);
  const matches: PairingScoreMatch[] = [];
  const matchesByCondition = new Map<string, PairingScoreMatchRow[]>();
  const hasEfficientFlying = groupRows.rows.some((row) =>
    (row.propertyCode ?? row.legacyPropertyCode) === 428);
  const efficientFlyingCohort = hasEfficientFlying
    ? await loadEfficientFlyingCohort(
      options.pgPool,
      schema,
      options.period,
      await loadEfficientFlyingPercentile(options, schema),
      options.pairingFilter,
    )
    : [];
  const hasRedeye = groupRows.rows.some((row) =>
    (row.propertyCode ?? row.legacyPropertyCode) === 117);
  const redeyeDefinition = hasRedeye
    ? await loadRedeyeDefinition(options.pgPool, schema)
    : undefined;
  const needsPairingBaseZones = groupRows.rows.some((row) =>
    (row.propertyCode ?? row.legacyPropertyCode) === 163);
  const pairingBaseZoneGroups = needsPairingBaseZones
    ? await loadPairingBaseZoneGroups(options.pgPool, schema, options.pairingFilter?.bases)
    : [];

  for (const row of groupRows.rows) {
    if (row.tier < 1 || row.tier > TIER_COUNT) {
      continue;
    }

    const property = buildSearchProperty(row);

    if (!property) {
      notifySkippedProperty(options, row, "Unsupported pairing property code.");
      continue;
    }

    if (property.propertyCode === 428) {
      const mode = parseEfficientFlyingMode(property);

      if (!mode) {
        notifySkippedProperty(options, row, "Efficient Flying First payload is invalid.");
        continue;
      }

      if (mapPairingActionFromId(row.actionId) === "avoid") {
        notifySkippedProperty(options, row, "Efficient Flying First does not accept Avoid.");
        continue;
      }

      const matchingPairings = efficientFlyingCohort.filter((pairing) =>
        mode === "efficient" ? pairing.isEfficient : pairing.isInefficient);

      for (const pairing of matchingPairings) {
        if (!isCrewEligibleForPairing(options.crewEligibility, row.crewId, pairing)) {
          continue;
        }

        matches.push({
          crewId: row.crewId,
          pairingId: pairing.pairingId,
          interfaceId: pairing.interfaceId,
          tier: row.tier,
          action: "award",
        });
      }

      continue;
    }

    const cacheKey = buildConditionCacheKey(row);
    let matchingPairings = matchesByCondition.get(cacheKey);

    if (!matchingPairings) {
      matchingPairings = property.propertyCode === 163
          ? (await Promise.all(pairingBaseZoneGroups.map((group) => loadMatchingPairings(
            options.pgPool,
            schema,
            property,
            options.period,
            options.pairingFilter,
            `'${group.zoneId}'`,
            group,
            redeyeDefinition,
          )))).flat()
          : await loadMatchingPairings(
            options.pgPool,
            schema,
            property,
            options.period,
            options.pairingFilter,
            undefined,
            undefined,
            redeyeDefinition,
          );
      matchesByCondition.set(cacheKey, matchingPairings);
    }

    const action = resolveScoreAction(property.propertyCode, row.actionId);
    const creditPriority = isPbsPairingCreditPriorityProperty(property.propertyCode)
      ? normalizeCreditPriority(row.preferenceJson?.creditPriority)
      : undefined;

    for (const pairing of matchingPairings) {
      if (!isCrewEligibleForPairing(options.crewEligibility, row.crewId, pairing)) {
        continue;
      }

      matches.push({
        crewId: row.crewId,
        pairingId: pairing.pairingId,
        interfaceId: pairing.interfaceId,
        tier: row.tier,
        action,
        creditPriority,
      });
    }
  }

  return buildPairingScoreCsvFromMatches(matches, options.scope);
};
