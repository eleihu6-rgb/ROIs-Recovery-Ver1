import { LineholderBidServiceError } from "../lineholder/shared.js";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  type PbsPairingCurrentRulesCountRow,
  type PbsPairingCurrentRulesCountsResponse,
  type PbsPairingPoolCountValue,
  type PbsPairingTierPoolRow,
  type PbsPairingTierPoolsResponse,
  type PbsTimeBetweenFlightsBoundsResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  buildCurrentRulesCondition,
  buildCurrentRulesExpression,
  buildPreviewCondition,
  normalizeCriteriaPreviewProperties,
  normalizeCurrentRulePreviewProperties,
  parsePreviewTier,
} from "./pairing-search-condition-builder.js";
import { searchCrewIdOptions } from "./crew-id-search-query.js";
import { loadFlightNumberCategoryRanges } from "./flight-number-category-range-config.js";
import { searchFlightNumberOptions } from "./flight-number-search-query.js";
import { searchPairingIdOptions } from "./pairing-id-search-query.js";
import { queryPairingNumberFilterOptions } from "./pairing-number-filter-options-query.js";
import { searchPairingOccurrences, searchPairingOccurrencesByDate } from "./pairing-occurrence-query.js";
import {
  executeCurrentRulesCountQuery,
  executeFeedbackMatchQuery,
  executePairingDetailsQuery,
  executePreviewCountQueries,
  executePreviewQuery,
  type PairingSearchCountTarget,
  type PairingSearchEvaluatedCountLeaf,
  type PairingSearchEvaluatedCountTarget,
  type PairingSearchFeedbackLeaf,
} from "./pairing-search-preview-query.js";
import { createPairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";
import type { CreatePbsPairingSearchServiceOptions, PbsPairingSearchService } from "./types.js";
import {
  resolvePairingSearchActorBase,
  resolvePairingSearchActorContext,
  resolveSinglePropertyPreviewActorContext,
} from "./actor-base.js";
import { executePairingAirportOptionsQuery } from "./pairing-airport-options-query.js";
import { executeTimeBetweenFlightsBoundsQuery } from "./time-between-flights-bounds-query.js";
import { stableHash } from "../../utils/stable-hash.js";
import { validateSchemaName } from "../../utils/schema-identifier.js";
import { loadEfficientFlyingConfig } from "../pairing/efficient-flying-config.js";
import { loadRedeyeConfig } from "../pairing/redeye-config.js";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PairingSearchConditionContext } from "./pairing-search-condition-context.js";
import {
  loadPairingSearchRosterPeriodContext,
  type PairingSearchRosterPeriodContext,
} from "./roster-period-context-query.js";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const PAIRING_SEARCH_CACHE_GROUP = "pairing-search";
const PAIRING_SEARCH_CACHE_VERSION = "v3";
const ACTOR_CONTEXT_CACHE_TTL_SECONDS = 60;
const ROSTER_PERIOD_CONTEXT_CACHE_TTL_SECONDS = 10 * 60;
const AIRPORT_OPTIONS_CACHE_TTL_SECONDS = 10 * 60;
const AIRPORT_OPTIONS_CACHE_VERSION = "v2";
const PREVIEW_CACHE_TTL_SECONDS = 30;
const SINGLE_PROPERTY_PREVIEW_CACHE_VERSION = "v4";
const CURRENT_RULE_COUNTS_CACHE_TTL_SECONDS = 30;
const CURRENT_RULE_TIER_POOLS_CACHE_TTL_SECONDS = 30;
const EFFICIENT_FLYING_CONFIG_CACHE_TTL_SECONDS = 30;
const PAIRING_SEARCH_STAMPEDE_PROTECTION = {
  stampedeProtection: {
    enabled: true as const,
  },
};

const normalizeFilterValues = (values: string[] | undefined) => Array.from(new Set(
  values?.map((value) => value.trim().toUpperCase()).filter(Boolean) ?? [],
));
const normalizeContextCode = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length > 0 ? normalized : null;
};
const normalizeContextZone = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};
const EMPTY_POOL_COUNT: PbsPairingPoolCountValue = {
  pairingIdCount: 0,
  totalItems: 0,
};

const resolveCountPropertyKey = (property: { propertyGroupKey?: string; rowSeq: number }) =>
  property.propertyGroupKey?.trim() || `row-${property.rowSeq}`;

const combinePairingPoolConditions = (conditions: string[]) => {
  if (conditions.length === 0) {
    return "false";
  }

  return conditions.length === 1
    ? `(${conditions[0]})`
    : conditions.map((condition) => `(${condition})`).join(" or ");
};

const getPairingPoolErrorMessage = (error: unknown) => (
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Unable to calculate this Tx pairing pool."
);

const buildValidatedZoneLiteral = (zoneId: string | null | undefined): string | null => {
  const normalized = zoneId?.trim();

  return normalized && /^[A-Za-z0-9_+./-]+$/.test(normalized)
    ? `'${normalized}'`
    : null;
};

const requireValidatedZoneLiteral = (zoneId: string | null | undefined): string => {
  const literal = buildValidatedZoneLiteral(zoneId);

  if (!literal) {
    throw new LineholderBidServiceError(
      409,
      "The crew base timezone is missing or invalid.",
      "PAIRING_BASE_TIMEZONE_REQUIRED",
    );
  }

  return literal;
};

const includesEfficientFlying = (
  properties: ReadonlyArray<Pick<PbsPairingDraftProperty, "propertyCode">>,
) => properties.some((property) => property.propertyCode === 428);

const includesRedeye = (
  properties: ReadonlyArray<Pick<PbsPairingDraftProperty, "propertyCode">>,
) => properties.some((property) => property.propertyCode === 117);

export const createPbsPairingSearchService = ({
  pgPool,
  liveSchema,
  pbsSchema,
  cache,
}: CreatePbsPairingSearchServiceOptions): PbsPairingSearchService => {
  const schema = validateSchemaName(liveSchema, "live schema name");
  const pbsSchemaName = validateSchemaName(pbsSchema, "PBS schema name");
  const db = drizzle(pgPool);
  const resolveRedeyeConfig = async (
    properties: ReadonlyArray<Pick<PbsPairingDraftProperty, "propertyCode">>,
  ) => includesRedeye(properties) ? loadRedeyeConfig(db) : undefined;
  const resolveActorBase = (actor: Parameters<PbsPairingSearchService["previewPairings"]>[0]) =>
    resolvePairingSearchActorBase({
      pgPool,
      schema,
      pbsSchema: pbsSchemaName,
      actor,
    });
  const resolveActorContext = (actor: Parameters<PbsPairingSearchService["previewPairings"]>[0]) =>
    cache
      ? cache.getOrSet(
        cache.key(
          PAIRING_SEARCH_CACHE_GROUP,
          "actor-context",
          PAIRING_SEARCH_CACHE_VERSION,
          schema,
          stableHash({ crewId: actor.crewId, userCode: actor.userCode }),
        ),
        ACTOR_CONTEXT_CACHE_TTL_SECONDS,
        () => resolvePairingSearchActorContext({
          pgPool,
          schema,
          pbsSchema: pbsSchemaName,
          actor,
        }),
        PAIRING_SEARCH_STAMPEDE_PROTECTION,
      )
      : resolvePairingSearchActorContext({
        pgPool,
        schema,
        pbsSchema: pbsSchemaName,
        actor,
      });
  const resolveRosterPeriodContext = async (
    request: { rosterPeriodId: number; periodCode?: string | null },
  ): Promise<PairingSearchRosterPeriodContext> => {
    const load = () => loadPairingSearchRosterPeriodContext({
        pgPool,
        schema,
        rosterPeriodId: request.rosterPeriodId,
      });
    const period = cache
      ? await cache.getOrSet(
        cache.key(PAIRING_SEARCH_CACHE_GROUP, "roster-period", PAIRING_SEARCH_CACHE_VERSION, schema, request.rosterPeriodId),
        ROSTER_PERIOD_CONTEXT_CACHE_TTL_SECONDS,
        load,
        PAIRING_SEARCH_STAMPEDE_PROTECTION,
      )
      : await load();
    const requestedLabel = request.periodCode?.trim();

    if (requestedLabel && requestedLabel !== period.periodCode) {
      throw new LineholderBidServiceError(
        409,
        "The requested period does not match the selected roster period.",
        "PERIOD_CONTEXT_REQUIRED",
      );
    }

    return period;
  };
  const resolveFeedbackPeriodContext = async (
    request: Parameters<PbsPairingSearchService["matchFeedbackPairings"]>[1],
  ): Promise<PairingSearchRosterPeriodContext> => {
    const resolvedPeriod = request.resolvedContext?.period;
    if (!resolvedPeriod) {
      return resolveRosterPeriodContext(request);
    }
    if (resolvedPeriod.rosterPeriodId !== request.rosterPeriodId) {
      throw new LineholderBidServiceError(
        409,
        "The requested period does not match the selected roster period.",
        "PERIOD_CONTEXT_REQUIRED",
      );
    }
    const requestedLabel = request.periodCode?.trim();
    if (requestedLabel && requestedLabel !== resolvedPeriod.periodCode) {
      throw new LineholderBidServiceError(
        409,
        "The requested period does not match the selected roster period.",
        "PERIOD_CONTEXT_REQUIRED",
      );
    }

    return {
      rosterPeriodId: resolvedPeriod.rosterPeriodId,
      rosterPeriodKey: resolvedPeriod.rosterPeriodKey,
      periodCode: resolvedPeriod.periodCode,
      rpStartLocal: resolvedPeriod.rpStartLocal,
      rpEndLocal: resolvedPeriod.rpEndLocal,
    };
  };
  const resolveFeedbackActorContext = (
    actor: Parameters<PbsPairingSearchService["matchFeedbackPairings"]>[0],
    request: Parameters<PbsPairingSearchService["matchFeedbackPairings"]>[1],
  ) => {
    const resolvedActor = request.resolvedContext?.actor;
    const base = normalizeContextCode(resolvedActor?.base);
    const zoneId = normalizeContextZone(resolvedActor?.zoneId);
    if (base && zoneId) {
      return Promise.resolve({
        base,
        rank: normalizeContextCode(resolvedActor?.rank),
        zoneId,
      });
    }

    return resolveActorContext(actor);
  };
  const resolveActorBaseForAutocomplete = async (
    actor: Parameters<PbsPairingSearchService["previewPairings"]>[0],
    query?: string,
  ) => (query?.trim() ? resolveActorBase(actor) : "");
  const resolveActorContextForAutocomplete = async (
    actor: Parameters<PbsPairingSearchService["previewPairings"]>[0],
    query?: string,
  ) => (query?.trim() ? resolveActorContext(actor) : { base: "", rank: null });
  const getOrLoadActorScoped = <TValue>(
    resource: string,
    ttlSeconds: number,
    actorBase: string,
    actorRank: string | null,
    payload: unknown,
    load: () => Promise<TValue>,
  ) => cache
    ? cache.getOrSet(
      cache.key(
        PAIRING_SEARCH_CACHE_GROUP,
        resource,
        PAIRING_SEARCH_CACHE_VERSION,
        schema,
        actorBase,
        actorRank,
        stableHash(payload),
      ),
      ttlSeconds,
      load,
      PAIRING_SEARCH_STAMPEDE_PROTECTION,
    )
    : load();
  const getOrLoadSinglePropertyPreview = <TValue>(
    actor: Parameters<PbsPairingSearchService["previewPairings"]>[0],
    actorRank: string,
    payload: unknown,
    load: () => Promise<TValue>,
  ) => cache
    ? cache.getOrSet(
      cache.key(
        PAIRING_SEARCH_CACHE_GROUP,
        "preview-single-property",
        SINGLE_PROPERTY_PREVIEW_CACHE_VERSION,
        schema,
        actor.crewId,
        actorRank,
        stableHash(payload),
      ),
      PREVIEW_CACHE_TTL_SECONDS,
      load,
      PAIRING_SEARCH_STAMPEDE_PROTECTION,
    )
    : load();
  const getOrLoadAirportOptions = <TValue>(
    actorBase: string,
    periodStartDate: string,
    periodEndDate: string,
    load: () => Promise<TValue>,
  ) => cache
    ? cache.getOrSet(
      cache.key(
        PAIRING_SEARCH_CACHE_GROUP,
        "airport-options",
        AIRPORT_OPTIONS_CACHE_VERSION,
        schema,
        actorBase,
        periodStartDate,
        periodEndDate,
      ),
      AIRPORT_OPTIONS_CACHE_TTL_SECONDS,
      load,
      PAIRING_SEARCH_STAMPEDE_PROTECTION,
    )
    : load();
  const getOrLoadEfficientFlyingConfig = () => cache
    ? cache.getOrSet(
      cache.key(
        PAIRING_SEARCH_CACHE_GROUP,
        "efficient-flying-config",
        "v1",
        schema,
      ),
      EFFICIENT_FLYING_CONFIG_CACHE_TTL_SECONDS,
      () => loadEfficientFlyingConfig(pgPool, schema),
      PAIRING_SEARCH_STAMPEDE_PROTECTION,
    )
    : loadEfficientFlyingConfig(pgPool, schema);
  const resolveEfficientFlyingContext = async (
    properties: ReadonlyArray<Pick<PbsPairingDraftProperty, "propertyCode">>,
    period: PairingSearchRosterPeriodContext,
    actorRank: string | null,
    baseScope: {
      mode: "fixed" | "partitioned";
      bases: readonly string[];
    },
  ) => {
    if (!includesEfficientFlying(properties)) {
      return undefined;
    }

    const config = await getOrLoadEfficientFlyingConfig();
    return {
      percentile: config.percentile,
      periodStartDate: period.rpStartLocal,
      periodEndDate: period.rpEndLocal,
      baseScopeMode: baseScope.mode,
      bases: baseScope.bases,
      actorRank,
    };
  };

  return {
    async matchFeedbackPairings(actor, request) {
      if (request.properties.length === 0) return [];

      const [{ base: actorBase, rank: actorRank, zoneId: actorZoneId }, period] = await Promise.all([
        resolveFeedbackActorContext(actor, request),
        resolveFeedbackPeriodContext(request),
      ]);
      const properties = request.properties.map((entry) => entry.property);
      const useCurrentRulesFacts = false;
      const [efficientFlying, redeye] = await Promise.all([
        resolveEfficientFlyingContext(
          properties,
          period,
          actorRank,
          { mode: "fixed", bases: [actorBase] },
        ),
        resolveRedeyeConfig(properties),
      ]);
      const conditionContext: PairingSearchConditionContext = {
        pairingBaseZoneExpression: requireValidatedZoneLiteral(actorZoneId),
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
        useCurrentRulesFacts,
        efficientFlying,
        redeye,
      };
      const sqlBuilder = createPairingSearchSqlBuilder();
      const leaves: PairingSearchFeedbackLeaf[] = request.properties.map((entry, index) => {
        const leafIdentity = {
          alias: `match_${index + 1}`,
          key: entry.key,
        };

        if (entry.property.bid.type === "pairing-occurrence-list") {
          return {
            ...leafIdentity,
            occurrences: entry.property.bid.occurrences.map((occurrence) => ({
              pairingId: occurrence.pairingId,
              originDate: occurrence.originDate,
            })),
          };
        }

        return {
          ...leafIdentity,
          condition: buildPreviewCondition(entry.property, schema, sqlBuilder, conditionContext),
        };
      });

      return executeFeedbackMatchQuery({
        leaves,
        periodEndDate: period.rpEndLocal,
        periodStartDate: period.rpStartLocal,
        pgPool,
        schema,
        sqlBuilder,
        useCurrentRulesFacts,
      });
    },

    async searchPairingIds(actor, request) {
      const [actorContext, period] = await Promise.all([
        resolveActorContextForAutocomplete(actor, request.query),
        resolveRosterPeriodContext(request),
      ]);
      const { base: actorBase, rank: actorRank } = actorContext;

      return searchPairingIdOptions({
        pgPool,
        schema,
        actorBase,
        actorRank,
        query: request.query,
        limit: request.limit,
        rosterPeriodId: period.rosterPeriodId,
        periodCode: period.periodCode,
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
      });
    },

    async getPairingNumberFilterOptions(actor, request) {
      const [{ base: actorBase, rank: actorRank }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);

      return queryPairingNumberFilterOptions({
        pgPool,
        schema,
        actorBase,
        actorRank,
        rosterPeriodId: period.rosterPeriodId,
        periodCode: period.periodCode,
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
        query: request.query,
        cursor: request.cursor,
        limit: request.limit,
      });
    },

    async searchCrewIds(actor, request) {
      return searchCrewIdOptions({
        pgPool,
        schema,
        pbsSchema: pbsSchemaName,
        actor,
        query: request.query,
        limit: request.limit,
      });
    },

    async searchFlightNumbers(actor, request) {
      const typeRanges = request.type
        ? await loadFlightNumberCategoryRanges(pgPool, schema, request.type)
        : undefined;

      return searchFlightNumberOptions({
        pgPool,
        schema,
        actorBase: await resolveActorBaseForAutocomplete(actor, request.query),
        query: request.query,
        limit: request.limit,
        typeRanges,
      });
    },

    async searchPairingOccurrences(actor, request) {
      const [{ base: actorBase, rank: actorRank }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);

      return searchPairingOccurrences({
        pgPool,
        schema,
        actorBase,
        actorRank,
        pairingId: request.pairingId,
        rosterPeriodId: period.rosterPeriodId,
        periodCode: period.periodCode,
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
      });
    },

    async searchPairingOccurrencesByDate(actor, request) {
      const [{ base: actorBase, rank: actorRank }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);

      return searchPairingOccurrencesByDate({
        pgPool,
        schema,
        actorBase,
        actorRank,
        originDate: request.originDate,
        rosterPeriodId: period.rosterPeriodId,
        periodCode: period.periodCode,
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
      });
    },

    async getPairingDetails(actor, request) {
      const [{ base: actorBase, rank: actorRank }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);

      return executePairingDetailsQuery({
        pgPool,
        request,
        schema,
        actorBase,
        actorRank,
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
      });
    },

    async previewPairings(actor, request) {
      const page = Math.max(1, request.preview.page ?? 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, request.preview.pageSize ?? DEFAULT_PAGE_SIZE));
      const sqlBuilder = createPairingSearchSqlBuilder();
      const preview = request.preview;
      const isSinglePropertyPreview = !("mode" in preview);
      const [actorContext, period] = await Promise.all([
        isSinglePropertyPreview
          ? Promise.resolve({ base: "", rank: null, zoneId: null })
          : resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);
      const { base: actorBase, rank: actorRank, zoneId: actorZoneId } = actorContext;
      const conditionContext: PairingSearchConditionContext = {
        pairingBaseZoneExpression: isSinglePropertyPreview
          ? undefined
          : requireValidatedZoneLiteral(actorZoneId),
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
      };

      if ("mode" in preview && preview.mode === "current_rules") {
        const tier = parsePreviewTier(preview.tier);
        const properties = normalizeCurrentRulePreviewProperties(tier, preview.properties);

        if (properties.length === 0) {
          throw new LineholderBidServiceError(400, `No pairing search rules are active in ${tier}.`);
        }
        conditionContext.efficientFlying = await resolveEfficientFlyingContext(
          properties,
          period,
          actorRank,
          { mode: "fixed", bases: [actorBase] },
        );
        conditionContext.redeye = await resolveRedeyeConfig(properties);

        return getOrLoadActorScoped(
          "preview",
          PREVIEW_CACHE_TTL_SECONDS,
          actorBase,
          actorRank,
          {
            rosterPeriodId: period.rosterPeriodId,
            preview: {
              mode: "current_rules",
              tier,
              properties: preview.properties,
              efficientFlyingPercentile: conditionContext.efficientFlying?.percentile,
              redeyeDefinitionVersion: conditionContext.redeye?.available ? conditionContext.redeye.version : undefined,
              page,
              pageSize,
            },
          },
          () => executePreviewQuery({
            condition: buildCurrentRulesCondition(properties, schema, sqlBuilder, conditionContext),
            metadata: {
              mode: "current_rules_preview",
              tier,
              properties,
            },
            page,
            pageSize,
            periodStartDate: period.rpStartLocal,
            periodEndDate: period.rpEndLocal,
            pgPool,
            schema,
            sqlBuilder,
            actorBase,
            actorRank,
          }),
        );
      }

      if ("mode" in preview && preview.mode === "criteria") {
        const properties = normalizeCriteriaPreviewProperties(preview.properties);

        if (properties.length === 0) {
          throw new LineholderBidServiceError(400, "Add at least one pairing search criterion.");
        }
        conditionContext.efficientFlying = await resolveEfficientFlyingContext(
          properties,
          period,
          actorRank,
          { mode: "fixed", bases: [actorBase] },
        );
        conditionContext.redeye = await resolveRedeyeConfig(properties);

        return getOrLoadActorScoped(
          "preview",
          PREVIEW_CACHE_TTL_SECONDS,
          actorBase,
          actorRank,
          {
            rosterPeriodId: period.rosterPeriodId,
            preview: {
              mode: "criteria",
              properties: preview.properties,
              efficientFlyingPercentile: conditionContext.efficientFlying?.percentile,
              redeyeDefinitionVersion: conditionContext.redeye?.available ? conditionContext.redeye.version : undefined,
              page,
              pageSize,
            },
          },
          () => executePreviewQuery({
            condition: buildCurrentRulesCondition(properties, schema, sqlBuilder, conditionContext),
            metadata: {
              mode: "criteria_preview",
              properties,
            },
            page,
            pageSize,
            periodStartDate: period.rpStartLocal,
            periodEndDate: period.rpEndLocal,
            pgPool,
            schema,
            sqlBuilder,
            actorBase,
            actorRank,
          }),
        );
      }

      if ("mode" in preview && preview.mode === "all_pairings") {
        const filters = preview.filters
          ? {
            ...preview.filters,
            pairingNumbers: normalizeFilterValues(preview.filters.pairingNumbers),
            airports: normalizeFilterValues(preview.filters.airports),
            layoverAirports: normalizeFilterValues(preview.filters.layoverAirports),
          }
          : undefined;
        const resultRedeye = filters?.hasRedeye ? await loadRedeyeConfig(db) : undefined;

        return getOrLoadActorScoped(
          "preview",
          PREVIEW_CACHE_TTL_SECONDS,
          actorBase,
          actorRank,
          {
            rosterPeriodId: period.rosterPeriodId,
            preview: {
              mode: "all_pairings",
              filters,
              redeyeDefinitionVersion: resultRedeye?.available ? resultRedeye.version : undefined,
              page,
              pageSize,
            },
          },
          () => executePreviewQuery({
            condition: "true",
            metadata: {
              mode: "all_pairings_preview",
            },
            page,
            pageSize,
            periodStartDate: period.rpStartLocal,
            periodEndDate: period.rpEndLocal,
            pgPool,
            schema,
            sqlBuilder,
            actorBase,
            actorRank,
            resultFilters: filters,
            resultRedeye,
          }),
        );
      }

      if (!("property" in preview)) {
        throw new LineholderBidServiceError(400, "Invalid pairing search preview payload.");
      }

      const property = preview.property;
      const singlePropertyActorContext = await resolveSinglePropertyPreviewActorContext({
        pgPool,
        schema,
        pbsSchema: pbsSchemaName,
        actor,
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
      });
      const singlePropertyConditionContext = {
        ...conditionContext,
        pairingBaseZoneExpression: requireValidatedZoneLiteral(singlePropertyActorContext.zoneId),
        efficientFlying: await resolveEfficientFlyingContext(
          [property],
          period,
          singlePropertyActorContext.rank,
          { mode: "partitioned", bases: singlePropertyActorContext.bases },
        ),
        redeye: await resolveRedeyeConfig([property]),
      };

      return getOrLoadSinglePropertyPreview(
        actor,
        singlePropertyActorContext.rank,
        {
          rosterPeriodId: period.rosterPeriodId,
          preview: {
            mode: "single_property",
            property,
            efficientFlyingPercentile: singlePropertyConditionContext.efficientFlying?.percentile,
            redeyeDefinitionVersion: singlePropertyConditionContext.redeye?.available
              ? singlePropertyConditionContext.redeye.version
              : undefined,
            effectiveBaseScope: singlePropertyActorContext.bases,
            page,
            pageSize,
          },
        },
        () => executePreviewQuery({
          condition: buildPreviewCondition(property, schema, sqlBuilder, singlePropertyConditionContext),
          metadata: {
            mode: "single_property_preview",
            property,
          },
          page,
          pageSize,
          periodStartDate: period.rpStartLocal,
          periodEndDate: period.rpEndLocal,
          pgPool,
          schema,
          sqlBuilder,
          actorRank: singlePropertyActorContext.rank,
          effectiveCrewBaseCrewId: actor.crewId,
        }),
      );
    },

    async countCurrentRules(actor, request): Promise<PbsPairingCurrentRulesCountsResponse> {
      const [{ base: actorBase, rank: actorRank, zoneId: actorZoneId }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);
      const tier = parsePreviewTier(request.tier);
      const rowProperties = normalizeCriteriaPreviewProperties(request.properties);
      const activeTierProperties = normalizeCurrentRulePreviewProperties(tier, request.properties);
      const periodCode = period.periodCode;

      if (rowProperties.length === 0) {
        return {
          mode: "current_rules_counts",
          ...(periodCode ? { periodCode } : {}),
          tier,
          computedAt: new Date().toISOString(),
          summary: {
            activePropertyCount: 0,
            allRules: null,
          },
          rows: [],
        };
      }

      const useCurrentRulesFacts = rowProperties.some((property) =>
        property.bid.type === "pairing-check-time"
        || property.bid.type === "flight-legs-per-duty"
        || property.bid.type === "airport-preference");
      const conditionContext = {
        pairingBaseZoneExpression: requireValidatedZoneLiteral(actorZoneId),
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
        useCurrentRulesFacts,
        efficientFlying: await resolveEfficientFlyingContext(
          rowProperties,
          period,
          actorRank,
          { mode: "fixed", bases: [actorBase] },
        ),
        redeye: await resolveRedeyeConfig(rowProperties),
      };
      const sqlBuilder = createPairingSearchSqlBuilder();
      const propertyAliasByKey = new Map<string, string>();
      const countLeaves: PairingSearchEvaluatedCountLeaf[] = rowProperties.map((property, index) => {
        const propertyKey = resolveCountPropertyKey(property);
        const alias = `match_${index + 1}`;

        propertyAliasByKey.set(propertyKey, alias);

        return {
          alias,
          condition: buildPreviewCondition(property, schema, sqlBuilder, conditionContext),
        };
      });
      const resolveEvaluatedLeaf = (property: (typeof rowProperties)[number]): string => {
        const propertyKey = resolveCountPropertyKey(property);
        const alias = propertyAliasByKey.get(propertyKey);

        if (!alias) {
          throw new Error(`Missing evaluated pairing count leaf for ${propertyKey}`);
        }

        return `evaluated.${alias}`;
      };
      const rowRuleTargets: PairingSearchEvaluatedCountTarget[] = rowProperties.map((property) => {
        const propertyKey = resolveCountPropertyKey(property);

        return {
          key: `rule:${propertyKey}`,
          expression: resolveEvaluatedLeaf(property),
        };
      });
      const activeFunnelTargets: PairingSearchEvaluatedCountTarget[] = activeTierProperties.map((property, index) => {
        const propertyKey = resolveCountPropertyKey(property);

        return {
          key: `funnel:${propertyKey}`,
          expression: buildCurrentRulesExpression(
            activeTierProperties.slice(0, index + 1),
            resolveEvaluatedLeaf,
          ),
        };
      });
      const countTargets = [...rowRuleTargets, ...activeFunnelTargets];
      return getOrLoadActorScoped(
        "current-rules-counts",
        CURRENT_RULE_COUNTS_CACHE_TTL_SECONDS,
        actorBase,
        actorRank,
        {
          rosterPeriodId: period.rosterPeriodId,
          tier,
          properties: request.properties,
          efficientFlyingPercentile: conditionContext.efficientFlying?.percentile,
          redeyeDefinitionVersion: conditionContext.redeye?.available ? conditionContext.redeye.version : undefined,
        },
        async () => {
          const countResults = await executeCurrentRulesCountQuery({
            leaves: countLeaves,
            targets: countTargets,
            pgPool,
            schema,
            sqlBuilder,
            actorBase,
            actorRank,
            periodStartDate: period.rpStartLocal,
            periodEndDate: period.rpEndLocal,
            useCurrentRulesFacts,
          });
          const rows: PbsPairingCurrentRulesCountRow[] = rowProperties.map((property) => {
            const propertyKey = resolveCountPropertyKey(property);

            return {
              propertyGroupKey: propertyKey,
              rowSeq: property.rowSeq,
              propertyCode: property.propertyCode,
              name: property.name,
              rule: countResults.get(`rule:${propertyKey}`) ?? EMPTY_POOL_COUNT,
              funnel: countResults.get(`funnel:${propertyKey}`) ?? EMPTY_POOL_COUNT,
            };
          });
          const lastActiveProperty = activeTierProperties.at(-1);
          const lastActivePropertyKey = lastActiveProperty
            ? resolveCountPropertyKey(lastActiveProperty)
            : null;

          return {
            mode: "current_rules_counts",
            ...(periodCode ? { periodCode } : {}),
            tier,
            computedAt: new Date().toISOString(),
            summary: {
              activePropertyCount: activeTierProperties.length,
              allRules: lastActivePropertyKey
                ? countResults.get(`funnel:${lastActivePropertyKey}`) ?? EMPTY_POOL_COUNT
                : null,
            },
            rows,
          };
        },
      );
    },

    async countCurrentRuleTierPools(actor, request): Promise<PbsPairingTierPoolsResponse> {
      const [{ base: actorBase, rank: actorRank, zoneId: actorZoneId }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);
      const tiers = Array.from(new Set(request.tiers.map(parsePreviewTier)));
      const periodCode = period.periodCode;

      if (tiers.length === 0) {
        throw new LineholderBidServiceError(400, "Add at least one Tx to calculate pairing pools.");
      }

      const conditionContext = {
        pairingBaseZoneExpression: requireValidatedZoneLiteral(actorZoneId),
        periodStartDate: period.rpStartLocal,
        periodEndDate: period.rpEndLocal,
        efficientFlying: await resolveEfficientFlyingContext(
          request.properties,
          period,
          actorRank,
          { mode: "fixed", bases: [actorBase] },
        ),
        redeye: await resolveRedeyeConfig(request.properties),
      };
      const sqlBuilder = createPairingSearchSqlBuilder();
      const countTargets: PairingSearchCountTarget[] = [
        {
          key: "package",
          condition: "true",
        },
      ];
      const rowInputs: Array<{
        tier: string;
        activePropertyCount: number;
        status: PbsPairingTierPoolRow["status"];
        message?: string;
      }> = [];
      const cumulativeConditions: string[] = [];

      for (const tier of tiers) {
        const activeProperties = normalizeCurrentRulePreviewProperties(tier, request.properties);

        if (activeProperties.length === 0) {
          rowInputs.push({
            tier,
            activePropertyCount: 0,
            status: "no_pairing_rules",
          });
          continue;
        }

        try {
          const txCondition = buildCurrentRulesCondition(activeProperties, schema, sqlBuilder, conditionContext);
          const previousUnionCondition = combinePairingPoolConditions(cumulativeConditions);
          const totalCondition = combinePairingPoolConditions([...cumulativeConditions, txCondition]);
          const pairingsByTxCondition = cumulativeConditions.length === 0
            ? txCondition
            : `(${txCondition}) and (${previousUnionCondition}) is not true`;

          countTargets.push(
            {
              key: `tx:${tier}`,
              condition: txCondition,
            },
            {
              key: `total:${tier}`,
              condition: totalCondition,
            },
            {
              key: `by:${tier}`,
              condition: pairingsByTxCondition,
            },
          );
          rowInputs.push({
            tier,
            activePropertyCount: activeProperties.length,
            status: "success",
          });
          cumulativeConditions.push(txCondition);
        } catch (error) {
          if (!(error instanceof LineholderBidServiceError)) {
            throw error;
          }

          rowInputs.push({
            tier,
            activePropertyCount: activeProperties.length,
            status: "error",
            message: getPairingPoolErrorMessage(error),
          });
        }
      }

      return getOrLoadActorScoped(
        "current-rules-tier-pools",
        CURRENT_RULE_TIER_POOLS_CACHE_TTL_SECONDS,
        actorBase,
        actorRank,
        {
          rosterPeriodId: period.rosterPeriodId,
          tiers,
          properties: request.properties,
          efficientFlyingPercentile: conditionContext.efficientFlying?.percentile,
          redeyeDefinitionVersion: conditionContext.redeye?.available ? conditionContext.redeye.version : undefined,
        },
        async () => {
          const countResults = await executePreviewCountQueries({
            targets: countTargets,
            pgPool,
            schema,
            sqlBuilder,
            actorBase,
            actorRank,
            periodStartDate: period.rpStartLocal,
            periodEndDate: period.rpEndLocal,
          });
          let lastTotalPairings: PbsPairingPoolCountValue = EMPTY_POOL_COUNT;
          const rows: PbsPairingTierPoolRow[] = rowInputs.map((input) => {
            if (input.status !== "success") {
              return {
                tier: input.tier,
                activePropertyCount: input.activePropertyCount,
                txSet: null,
                totalPairings: lastTotalPairings,
                pairingsByTx: null,
                status: input.status,
                ...(input.message ? { message: input.message } : {}),
              };
            }

            const totalPairings = countResults.get(`total:${input.tier}`) ?? lastTotalPairings;
            lastTotalPairings = totalPairings;

            return {
              tier: input.tier,
              activePropertyCount: input.activePropertyCount,
              txSet: countResults.get(`tx:${input.tier}`) ?? EMPTY_POOL_COUNT,
              totalPairings,
              pairingsByTx: countResults.get(`by:${input.tier}`) ?? EMPTY_POOL_COUNT,
              status: "success",
            };
          });

          return {
            mode: "current_rules_tier_pools",
            ...(periodCode ? { periodCode } : {}),
            computedAt: new Date().toISOString(),
            packageTotal: countResults.get("package") ?? EMPTY_POOL_COUNT,
            rows,
          };
        },
      );
    },

    async getAirportOptions(actor, request) {
      const [{ base: actorBase }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);

      return getOrLoadAirportOptions(
        actorBase,
        period.rpStartLocal,
        period.rpEndLocal,
        () => executePairingAirportOptionsQuery({
          pgPool,
          schema,
          actorBase,
          periodStartDate: period.rpStartLocal,
          periodEndDate: period.rpEndLocal,
        }),
      );
    },

    async getTimeBetweenFlightsBounds(actor, request): Promise<PbsTimeBetweenFlightsBoundsResponse> {
      const [{ base: actorBase, rank: actorRank }, period] = await Promise.all([
        resolveActorContext(actor),
        resolveRosterPeriodContext(request),
      ]);

      return executeTimeBetweenFlightsBoundsQuery({
        actorBase,
        actorRank,
        periodEndDate: period.rpEndLocal,
        periodStartDate: period.rpStartLocal,
        pgPool,
        schema,
      });
    },
  };
};
