import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import {
  isPbsPairingCreditPriorityProperty,
  pbsPairingPropertyCatalog,
  type PbsPairingBidAction,
  type PbsPairingBidQuantifier,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  pbsBid,
} from "../../models/index.js";
import { deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import { buildPreviewCondition } from "../pairing-search/pairing-search-condition-builder.js";
import { parsePeriodMonth } from "../lineholder/date-utils.js";
import type { EfficientFlyingCohortContext } from "../pairing-search/efficient-flying-cohort.js";
import { loadEfficientFlyingConfig } from "../pairing/efficient-flying-config.js";
import { loadRedeyeConfig } from "../pairing/redeye-config.js";
import {
  createPairingSearchSqlBuilder,
  type PairingSearchSqlBuilder,
} from "../pairing-search/pairing-search-sql-builder.js";
import { escapeCsvCell } from "./csv.js";
import { buildCrewScopeSql, compareCrewScopedRows, type AlgorithmExportScope } from "./export-scope.js";

/**
 * Scenario-scope narrowing for PAIRING_SCORE: when a scenario kick-off supplies its
 * own window/crew facets, the bid search is restricted to the pairings the scenario
 * actually optimizes (instead of every live pairing across all bases/months/divisions).
 * Without it a 14-crew YEG bid set still scored against ~15k pairings (15 bases, 8
 * months) — ~28× over-generation that was the root of the slow scenario-package build.
 *
 *   - dateStart/dateEnd: the scenario window (str/end_dt_loc, local date). The pairing
 *     date is matched within ±SCENARIO_PAIRING_DATE_PAD_DAYS of it (req 1).
 *   - bases:     the scope crews' own bases (crew_base) → pairing.base must match (req 2).
 *   - divisions/ranks: the scope crews' divisions + ranks → a pairing is kept when its
 *     division matches the crew division OR a pairing_composition.acting_rank matches a
 *     crew rank (req 4 — "composition matches rank OR division matches crew").
 *
 * Every field is optional; an absent field drops only its own clause, so the legacy
 * (unscoped) callers keep their current behavior.
 */
export type PairingScopeFilter = {
  dateStart?: string;
  dateEnd?: string;
  bases?: readonly string[];
  divisions?: readonly string[];
  ranks?: readonly string[];
};

// Lead-in / lead-out padding applied to the scenario window before bounding the pairing
// date: a pairing that begins a few days before the scenario start (or ends just after)
// is still relevant to the bid, mirroring the engine's COF flight-pool buffer.
const SCENARIO_PAIRING_DATE_PAD_DAYS = 7;

const padIsoDate = (iso: string, deltaDays: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

const nonEmpty = (values: readonly string[] | undefined): string[] | null =>
  values && values.length > 0 ? [...values] : null;

// Build the extra ` and <clause>` appended to the pairing search. Uses the SAME
// sqlBuilder so its params keep contiguous $N indices after the bid condition's.
const buildScenarioFilterClause = (
  filter: PairingScopeFilter | undefined,
  schema: string,
  sqlBuilder: PairingSearchSqlBuilder,
): string => {
  if (!filter) {
    return "";
  }

  const clauses: string[] = [];

  if (filter.dateStart && filter.dateEnd) {
    const lo = padIsoDate(filter.dateStart, -SCENARIO_PAIRING_DATE_PAD_DAYS);
    const hi = padIsoDate(filter.dateEnd, SCENARIO_PAIRING_DATE_PAD_DAYS);
    clauses.push(
      `coalesce(p.pairing_dt, (p.sch_str_dt_utc at time zone 'UTC')::date) `
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
  // Populated only by the property-search path (the scenario-scope refinement source).
  // Occurrence-list / explicit-pick rows leave these undefined and are never refined.
  division?: string | null;
  actingRanks?: string[];
};

/**
 * Per-crew eligibility facets used to refine req-4 down to the rank. The scope-level OR
 * clause in the SQL is only the coarse union pre-filter (every in-scope pairing for ANY
 * crew); this map does the final per-crew narrowing so a CA is scored only on pairings
 * whose composition actually needs a CA.
 */
export type CrewPairingEligibility = ReadonlyMap<string, {
  division: string | null;
  ranks: ReadonlySet<string>;
}>;

// Decide whether `crewId` should be scored on `pairing`:
//   - when the pairing's composition ranks are KNOWN, the crew must hold one of them —
//     this is what drops a CA from an FO-only pilot pairing (a plain division match would
//     keep it, since both are division 'P', which is the collapse we are fixing);
//   - when the pairing has NO composition rows, fall back to a division match so pairings
//     that simply lack a complement aren't all dropped.
// Returns true (keep) when eligibility is unavailable, the crew is unknown, or the row
// carries no facets at all (occurrence-list explicit picks) — never refine those.
const isCrewEligibleForPairing = (
  eligibility: CrewPairingEligibility | undefined,
  crewId: string,
  pairing: PairingScoreMatchRow,
): boolean => {
  if (!eligibility) {
    return true;
  }

  if (pairing.division == null && pairing.actingRanks == null) {
    return true;
  }

  const facet = eligibility.get(crewId);
  if (!facet) {
    return true;
  }

  if (pairing.actingRanks && pairing.actingRanks.length > 0) {
    return pairing.actingRanks.some((rank) => facet.ranks.has(rank));
  }

  return facet.division != null && pairing.division != null && facet.division === pairing.division;
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
  liveSchema: string;
  scope?: AlgorithmExportScope;
  pairingFilter?: PairingScopeFilter;
  crewEligibility?: CrewPairingEligibility;
  onSkippedProperty?: (event: PairingScoreSkippedProperty) => void;
};

const TIER_COUNT = 7;
const NEGATIVE_DEFAULT_PROPERTY_CODES = new Set([148, 151, 156, 160]);

// This module is retained only for the retired pbs-server export endpoint. The active
// solver package is produced by live-server and receives the authoritative RP range.
const resolveRetiredExportRange = (periodCode: string) => {
  const periodMonth = parsePeriodMonth(periodCode);

  if (!periodMonth) {
    throw new LineholderBidServiceError(400, `Unsupported retired export period: ${periodCode}.`);
  }

  return {
    startDate: new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex, 1)).toISOString().slice(0, 10),
    endDate: new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex + 1, 0)).toISOString().slice(0, 10),
  };
};

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
  if (propertyCode === 428) {
    return "award";
  }

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

const buildSearchProperty = (row: PairingScoreGroupRow): PbsPairingSearchPreviewProperty | null => {
  const propertyCode = row.propertyCode ?? row.legacyPropertyCode;
  const definition = propertyCatalogByCode.get(propertyCode);

  if (!definition) {
    return null;
  }

  return {
    propertyCode,
    name: definition.name,
    action: "award",
    quantifier: mapPairingQuantifier(row.paramC),
    bid: deserializeRuleBid(definition, {
      operator: row.operator,
      paramA: row.paramA,
      paramB: row.paramB,
      paramC: row.paramC,
    }),
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

const loadMatchingPairings = async (
  pgPool: Pool,
  schema: string,
  property: PbsPairingSearchPreviewProperty,
  periodCode: string,
  pairingFilter?: PairingScopeFilter,
  efficientFlying?: EfficientFlyingCohortContext,
  redeye?: PbsRedeyeDefinition,
) => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const periodRange = resolveRetiredExportRange(periodCode);
  const condition = buildPreviewCondition(property, schema, sqlBuilder, {
    periodStartDate: periodRange.startDate,
    periodEndDate: periodRange.endDate,
    efficientFlying,
    redeye,
  });
  const scenarioClause = buildScenarioFilterClause(pairingFilter, schema, sqlBuilder);
  const registeredCtes = sqlBuilder.renderCtes();
  // p.division + the pairing's composition acting_ranks are carried back so the caller
  // can refine req-4 per crew (a CA only on CA-needing pairings). Null ranks are dropped.
  const result = await pgPool.query<PairingScoreMatchRow>(
    `
      ${registeredCtes ? `with ${registeredCtes}` : ""}
      select
        p.id::text as "pairingId",
        p.interface_id::varchar as "interfaceId",
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
      where p.is_deleted = 0
        and ${condition}${scenarioClause}
      order by p.id
    `,
    sqlBuilder.params,
  );

  return result.rows;
};

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
  const crewScopeSql = buildCrewScopeSql(options.scope?.crewIds);
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
    from pbs_bid_group
    inner join ${pbsBid}
      on pbs_bid_group.bid_id = ${pbsBid.id}
    inner join pbs_bid_tier
      on pbs_bid_group.tier_id = pbs_bid_tier.id
    left join pbs_bid_property
      on pbs_bid_group.property_definition_id = pbs_bid_property.id
    where ${pbsBid.periodCode} = ${options.periodCode}
      and ${pbsBid.bidContext} = 'Current'
      and pbs_bid_group.bid_type = 'Pairing'
      and ${crewScopeSql}
    order by ${pbsBid.crewId}, pbs_bid_tier.tier, pbs_bid_group.group_seq
  `);
  const matches: PairingScoreMatch[] = [];
  const matchesByCondition = new Map<string, PairingScoreMatchRow[]>();
  const usesEfficientFlying = groupRows.rows.some(
    (row) => (row.propertyCode ?? row.legacyPropertyCode) === 428,
  );
  const usesRedeye = groupRows.rows.some(
    (row) => (row.propertyCode ?? row.legacyPropertyCode) === 117,
  );
  const redeye = usesRedeye
    ? await loadRedeyeConfig(drizzle(options.pgPool))
    : undefined;
  let efficientFlying: EfficientFlyingCohortContext | undefined;

  if (usesEfficientFlying) {
    const config = await loadEfficientFlyingConfig(options.pgPool, schema);
    const naturalMonthRange = resolveRetiredExportRange(options.periodCode);
    const periodStartDate = options.pairingFilter?.dateStart
      ? padIsoDate(options.pairingFilter.dateStart, -SCENARIO_PAIRING_DATE_PAD_DAYS)
      : naturalMonthRange?.startDate;
    const periodEndDate = options.pairingFilter?.dateEnd
      ? padIsoDate(options.pairingFilter.dateEnd, SCENARIO_PAIRING_DATE_PAD_DAYS)
      : naturalMonthRange?.endDate;

    if (!periodStartDate || !periodEndDate) {
      throw new LineholderBidServiceError(400, "A valid bid period is required for Efficient Flying First.");
    }

    efficientFlying = {
      percentile: config.percentile,
      periodStartDate,
      periodEndDate,
      baseScopeMode: options.pairingFilter?.bases?.length
        ? "merged"
        : "partitioned_all_bases",
      bases: options.pairingFilter?.bases,
      divisions: options.pairingFilter?.divisions,
      ranks: options.pairingFilter?.ranks,
    };
  }

  for (const row of groupRows.rows) {
    if (row.tier < 1 || row.tier > TIER_COUNT) {
      continue;
    }

    const property = buildSearchProperty(row);

    if (!property) {
      notifySkippedProperty(options, row, "Unsupported pairing property code.");
      continue;
    }

    const cacheKey = buildConditionCacheKey(row);
    let matchingPairings = matchesByCondition.get(cacheKey);

    if (!matchingPairings) {
      try {
        matchingPairings = await loadMatchingPairings(
          options.pgPool,
          schema,
          property,
          options.periodCode,
          options.pairingFilter,
          property.propertyCode === 428 ? efficientFlying : undefined,
          property.propertyCode === 117 ? redeye : undefined,
        );
        matchesByCondition.set(cacheKey, matchingPairings);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          notifySkippedProperty(options, row, error.message);
          matchesByCondition.set(cacheKey, []);
          continue;
        }

        throw error;
      }
    }

    const action = resolveScoreAction(property.propertyCode, row.actionId);
    const creditPriority = isPbsPairingCreditPriorityProperty(property.propertyCode)
      ? normalizeCreditPriority(row.preferenceJson?.creditPriority)
      : undefined;

    for (const pairing of matchingPairings) {
      // req-4 per-crew refinement: only score this crew on a pairing their division or
      // one of their ranks actually fits (a CA is dropped from FO-only pilot pairings).
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
