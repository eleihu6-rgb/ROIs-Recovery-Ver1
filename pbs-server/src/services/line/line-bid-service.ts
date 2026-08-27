import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  pbsLineF8PropertyCodes,
  pbsLineLegacyPropertyCodes,
  pbsSupportedLinePropertyCatalog,
  type PbsLineCreditWindowConfig,
  type PbsLineCurrentDraftResponse,
  type PbsLineDraftDocument,
  type PbsLineDraftProperty,
  type PbsLineFavoriteProperty,
  type PbsLineMinimumBaseLayoverConfig,
} from "../../../../packages/contracts/pbs-line-bids.js";
import {
  pbsBidProperty,
  pbsBidLineFavorite,
  pbsBidGroup,
  pbsBidTier,
} from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  assertCurrentPeriodCanEdit,
  buildDraftIdentity,
  ensureCurrentBidByReference,
  loadCurrentBidByReference,
  loadExistingBid,
  normalizeCurrentDraftVersion,
  normalizeTiers,
  parseCurrentDraftBidId,
  requireLineholderPropertyIdentity,
  resolveCurrentPeriod,
  resolvePropertyCatalogByContext,
  toPbsCurrentPeriod,
  type LineholderPeriodContext,
} from "../lineholder/shared.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import { cloneRuleBidValue, deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import {
  cloneLinePropertyCatalogContext,
  cloneLinePropertyDefinition,
  type LinePropertyCatalogContext,
} from "./line-property-catalog.js";
import { validateLineDraftProperties } from "./line-validation.js";
import type { PbsLineBidService } from "./types.js";
import {
  LINE_BID_TYPE,
  buildLineDraftPropertyMergeSignature,
  findLineDraftPropertyTierMerge,
  mapLineActionFromId,
  normalizeLineAddPropertyRequest,
  normalizeLineConfiguredFavoriteRequest,
  normalizeLineDraftRequest,
  normalizeLinePatchPropertyRequest,
  normalizeLinePropertyGroupKey,
  savedLineDraftMutationResponse,
} from "./line-draft-property-helpers.js";
import {
  deleteLineDraftPropertyWithTierSync,
  insertLineDraftPropertyWithTierSync,
  replaceLineDraftPropertyWithTierSync,
  writeLineDraft,
} from "./line-draft-property-write.js";
import { loadLineCreditWindowConfig } from "./line-credit-window-config.js";
import {
  loadLineMinimumBaseLayoverConfig,
  normalizeLineDurationPadded,
} from "./line-minimum-base-layover-config.js";
import type { PbsCache } from "../../utils/cache.js";
import { assertConfiguredFavoriteCanBeSaved } from "../favorites/favorite-eligibility.js";

type Database = ReturnType<typeof drizzle>;
type MinimumBaseLayoverBid = Extract<PbsLineDraftProperty["bid"], { type: "minimum-base-layover" }>;

const CURRENT_PERIOD_CACHE_TTL_MS = 60_000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;
const CONFIGURED_LINE_FAVORITE_KEY_PREFIX = "line-configured-";

const resolvePropertyCatalog = (db: Database) =>
  resolvePropertyCatalogByContext(db, {
    bidTypes: [LINE_BID_TYPE, "Reserve"],
    bidContext: CURRENT_BID_CONTEXT,
    propertyRegistry: pbsSupportedLinePropertyCatalog,
    clonePropertyDefinition: cloneLinePropertyDefinition,
  });

const isLineCreditWindowProperty = (property: Pick<PbsLineDraftProperty, "propertyCode">) =>
  property.propertyCode === pbsLineF8PropertyCodes.creditWindowPreference;

const isMinimumBaseLayoverProperty = (property: Pick<PbsLineDraftProperty, "propertyCode">) =>
  property.propertyCode === pbsLineLegacyPropertyCodes.minBaseLayover;

function assertCreditWindowConfigAvailable(
  config: PbsLineCreditWindowConfig,
): asserts config is Extract<PbsLineCreditWindowConfig, { available: true }> {
  if (!config.available) {
    throw new LineholderBidServiceError(400, "Credit Window Preference is not configured.");
  }
}

const resolveLineCreditWindowProperty = (
  property: PbsLineDraftProperty,
  config: PbsLineCreditWindowConfig,
): PbsLineDraftProperty => {
  if (!isLineCreditWindowProperty(property)) {
    return property;
  }

  assertCreditWindowConfigAvailable(config);

  if (property.bid.type !== "credit-window-preference") {
    return property;
  }

  return property;
};

const normalizeMinimumBaseLayoverBid = (
  bid: MinimumBaseLayoverBid,
  config: PbsLineMinimumBaseLayoverConfig,
): MinimumBaseLayoverBid => {
  const requestedDuration = bid.minimumDuration.trim() || (config.available ? config.minDuration : "");
  return {
    ...bid,
    minimumDuration: normalizeLineDurationPadded(requestedDuration) ?? requestedDuration,
  };
};

const resolveMinimumBaseLayoverProperty = (
  property: PbsLineDraftProperty,
  config: PbsLineMinimumBaseLayoverConfig,
): PbsLineDraftProperty => {
  if (!isMinimumBaseLayoverProperty(property) || property.bid.type !== "minimum-base-layover") {
    return property;
  }

  return {
    ...property,
    bid: normalizeMinimumBaseLayoverBid(property.bid, config),
  };
};

const buildEmptyDraft = (period: LineholderPeriodContext): PbsLineDraftDocument => ({
  ...buildDraftIdentity(period),
  bidContext: CURRENT_BID_CONTEXT,
  remarks: "",
  properties: [],
});

const loadDraftProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: LinePropertyCatalogContext["catalogByCode"],
): Promise<PbsLineDraftProperty[]> => {
  const groupRows = await db
    .select({
      propertyGroupKey: pbsBidGroup.propertyGroupKey,
      groupSeq: pbsBidGroup.groupSeq,
      legacyPropertyCode: pbsBidGroup.legacyPropertyCode,
      propertyCode: pbsBidProperty.propertyCode,
      operator: pbsBidGroup.operator,
      paramA: pbsBidGroup.paramA,
      paramB: pbsBidGroup.paramB,
      paramC: pbsBidGroup.paramC,
      actionId: pbsBidGroup.actionId,
      tier: pbsBidTier.tier,
    })
    .from(pbsBidGroup)
    .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
    .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
    .where(and(
      eq(pbsBidGroup.bidId, bidId),
      eq(pbsBidGroup.bidType, LINE_BID_TYPE),
    ))
    .orderBy(asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier));

  const propertiesByKey = new Map<string, PbsLineDraftProperty>();

  for (const row of groupRows) {
    const propertyCode = row.propertyCode ?? Number(row.legacyPropertyCode);
    const definition = catalogByCode.get(propertyCode);

    if (!definition) {
      continue;
    }

    const existingProperty = propertiesByKey.get(row.propertyGroupKey);

    if (!existingProperty) {
      propertiesByKey.set(row.propertyGroupKey, {
        propertyGroupKey: row.propertyGroupKey,
        rowSeq: row.groupSeq,
        propertyCode,
        name: definition.name,
        action: mapLineActionFromId(row.actionId),
        bid: deserializeRuleBid(definition, {
          operator: row.operator,
          paramA: row.paramA,
          paramB: row.paramB,
          paramC: row.paramC,
        }),
        tiers: [`T${row.tier}`],
      });

      continue;
    }

    existingProperty.tiers = normalizeTiers([...existingProperty.tiers, `T${row.tier}`]);
  }

  return Array.from(propertiesByKey.values()).sort((left, right) => left.rowSeq - right.rowSeq);
};

const loadLineFavoriteProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: LinePropertyCatalogContext["catalogByCode"],
): Promise<PbsLineFavoriteProperty[]> => {
  const configuredRows = await db
    .select({
      id: pbsBidLineFavorite.id,
      propertyId: pbsBidLineFavorite.propertyId,
      propertyCode: pbsBidLineFavorite.propertyCode,
      favoriteName: pbsBidLineFavorite.favoriteName,
      action: pbsBidLineFavorite.action,
      bidPayload: pbsBidLineFavorite.bidPayload,
    })
    .from(pbsBidLineFavorite)
    .where(eq(pbsBidLineFavorite.bidId, bidId))
    .orderBy(asc(pbsBidLineFavorite.propertyCode), asc(pbsBidLineFavorite.id));

  const configuredFavorites = configuredRows.flatMap((row) => {
    const definition = catalogByCode.get(row.propertyCode);
    if (!definition) {
      return [];
    }

    return [{
      favoriteKey: `${CONFIGURED_LINE_FAVORITE_KEY_PREFIX}${row.id}`,
      propertyId: row.propertyId,
      propertyCode: row.propertyCode,
      name: row.favoriteName?.trim() || definition.name,
      action: row.action ?? null,
      bid: cloneRuleBidValue(row.bidPayload),
    }];
  });

  return configuredFavorites;
};

type CreatePbsLineBidServiceOptions = {
  db: Database;
  cache?: PbsCache;
};

export const createPbsLineBidService = ({
  db,
  cache,
}: CreatePbsLineBidServiceOptions): PbsLineBidService => {
  const businessClock = createPbsBusinessClock({ db });
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;

  const getPropertyCatalog = async (): Promise<LinePropertyCatalogContext> =>
    cloneLinePropertyCatalogContext(await resolvePropertyCatalog(db));

  const getCurrentPeriod = async (actor: { crewId: string; userCode: string }) => {
    if (cache) {
      const period = await cache.getOrSet(
        cache.key("period", "current", "v3", actor.crewId),
        CURRENT_PERIOD_CACHE_TTL_SECONDS,
        async () => resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow()),
        {
          serialize: serializeLineholderPeriodContext,
          deserialize: deserializeLineholderPeriodContext,
        },
      );

      return cloneLineholderPeriodContext(period);
    }

    const now = Date.now();
    if (currentPeriodCache?.crewId === actor.crewId && currentPeriodCache.expiresAt > now) {
      return cloneLineholderPeriodContext(currentPeriodCache.value);
    }

    const period = await resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow());
    currentPeriodCache = {
      crewId: actor.crewId,
      expiresAt: now + CURRENT_PERIOD_CACHE_TTL_MS,
      value: cloneLineholderPeriodContext(period),
    };

    return cloneLineholderPeriodContext(period);
  };

  const getCreditWindowConfig = () => loadLineCreditWindowConfig(db);
  const getMinimumBaseLayoverConfig = () => loadLineMinimumBaseLayoverConfig(db);

  const resolveConfiguredLineProperties = async (
    properties: PbsLineDraftProperty[],
    isGrandfatheredMinimumBaseLayover?: (property: PbsLineDraftProperty) => boolean,
  ): Promise<PbsLineDraftProperty[]> => {
    const needsCreditWindowConfig = properties.some(isLineCreditWindowProperty);
    const needsMinimumBaseLayoverConfig = properties.some(isMinimumBaseLayoverProperty);

    if (!needsCreditWindowConfig && !needsMinimumBaseLayoverConfig) {
      return properties;
    }

    const [creditWindowConfig, minimumBaseLayoverConfig] = await Promise.all([
      needsCreditWindowConfig ? getCreditWindowConfig() : Promise.resolve(null),
      needsMinimumBaseLayoverConfig ? getMinimumBaseLayoverConfig() : Promise.resolve(null),
    ]);
    const resolvedProperties = properties.map((property) => {
      const creditResolvedProperty = creditWindowConfig
        ? resolveLineCreditWindowProperty(property, creditWindowConfig)
        : property;

      return minimumBaseLayoverConfig
        ? resolveMinimumBaseLayoverProperty(creditResolvedProperty, minimumBaseLayoverConfig)
        : creditResolvedProperty;
    });

    validateLineDraftProperties(resolvedProperties, {
      minimumBaseLayoverConfig: minimumBaseLayoverConfig ?? undefined,
      isGrandfatheredMinimumBaseLayover,
    });
    return resolvedProperties;
  };

  const resolveConfiguredLineProperty = async (
    property: PbsLineDraftProperty,
    isGrandfatheredMinimumBaseLayover?: (property: PbsLineDraftProperty) => boolean,
  ): Promise<PbsLineDraftProperty> => {
    const [resolvedProperty] = await resolveConfiguredLineProperties(
      [property],
      isGrandfatheredMinimumBaseLayover,
    );
    return resolvedProperty ?? property;
  };

  return {
    getCreditWindowConfig,
    getMinimumBaseLayoverConfig,

    async getCurrentDraft(actor): Promise<PbsLineCurrentDraftResponse> {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalog, catalogByCode, recommendedPropertyCodes } = catalogContext;
      const existingBid = await loadExistingBid(db, actor, period);

      if (!existingBid) {
        return {
          currentPeriod: toPbsCurrentPeriod(period),
          draft: buildEmptyDraft(period),
          propertyCatalog: catalog,
          favoriteProperties: [],
          recommendedPropertyCodes,
        };
      }

      const [properties, favoriteProperties] = await Promise.all([
        loadDraftProperties(db, existingBid.id, catalogByCode),
        loadLineFavoriteProperties(db, existingBid.id, catalogByCode),
      ]);

      return {
        currentPeriod: toPbsCurrentPeriod(period),
        draft: {
          ...buildDraftIdentity(period, existingBid),
          periodCode: existingBid.periodCode,
          bidContext: CURRENT_BID_CONTEXT,
          remarks: existingBid.remarks ?? "",
          properties,
        },
        propertyCatalog: catalog,
        favoriteProperties,
        recommendedPropertyCodes,
      };
    },

    async saveCurrentDraft(actor, request): Promise<PbsLineCurrentDraftResponse> {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalog, catalogByCode, recommendedPropertyCodes } = catalogContext;
      const normalizedDraft = normalizeLineDraftRequest(request, catalogByCode);
      const existingBid = await loadExistingBid(db, actor, period);
      const existingProperties = existingBid
        ? await loadDraftProperties(db, existingBid.id, catalogByCode)
        : [];
      const grandfatheredDurationByKey = new Map<string, string | null>(
        existingProperties.flatMap((property) =>
          property.bid.type === "minimum-base-layover" && property.propertyGroupKey
            ? [[property.propertyGroupKey, normalizeLineDurationPadded(property.bid.minimumDuration)] as const]
            : []),
      );
      const resolvedProperties = await resolveConfiguredLineProperties(
        normalizedDraft.properties,
        (property) => property.bid.type === "minimum-base-layover"
          && Boolean(property.propertyGroupKey)
          && grandfatheredDurationByKey.get(property.propertyGroupKey ?? "")
            === normalizeLineDurationPadded(property.bid.minimumDuration),
      );
      const draftToWrite: PbsLineDraftDocument = {
        ...normalizedDraft,
        properties: resolvedProperties,
      };
      const now = new Date();
      const targetBid = await writeLineDraft(db, {
        actor,
        period,
        catalogContext,
        normalizedDraft: draftToWrite,
        now,
      });

      return {
        currentPeriod: toPbsCurrentPeriod(period),
        draft: {
          ...draftToWrite,
          draftKey: targetBid.draftKey,
          bidId: targetBid.bidId,
          periodId: targetBid.periodId,
          draftVersion: targetBid.draftVersion,
          periodCode: targetBid.periodCode,
        },
        propertyCatalog: catalog,
        favoriteProperties: [],
        recommendedPropertyCodes,
      };
    },

    async addCurrentDraftProperty(actor, request) {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedRequest = normalizeLineAddPropertyRequest(request, catalogByCode);
      const now = new Date();
      const shouldLoadExistingDraft = normalizedRequest.bidId !== undefined
        || normalizedRequest.draftKey !== undefined
        || normalizedRequest.draftVersion > 0;
      const existingBid = shouldLoadExistingDraft
        ? await loadCurrentBidByReference(db, actor, period, normalizedRequest)
        : null;

      if (existingBid) {
        assertCurrentPeriodCanEdit(period, existingBid.periodCode);
      }

      const existingProperties = existingBid
        ? await loadDraftProperties(db, existingBid.id, catalogByCode)
        : [];
      const rowSeq = existingProperties.length + 1;
      const propertyToInsert = {
        ...(await resolveConfiguredLineProperty(normalizedRequest.property)),
        rowSeq,
      };
      const mergeResult = findLineDraftPropertyTierMerge(existingProperties, propertyToInsert);

      if (mergeResult && !mergeResult.hasNewTier) {
        throw new LineholderBidServiceError(409, "This line property already exists.");
      }

      const normalizedDraft: PbsLineDraftDocument = {
        draftKey: normalizedRequest.draftKey,
        bidId: normalizedRequest.bidId,
        draftVersion: normalizedRequest.draftVersion,
        periodCode: normalizedRequest.periodCode || existingBid?.periodCode || period.periodCode,
        bidContext: CURRENT_BID_CONTEXT,
        remarks: normalizedRequest.remarks,
        properties: mergeResult
          ? existingProperties
              .filter((property) =>
                property.propertyGroupKey === mergeResult.targetProperty.propertyGroupKey
                || buildLineDraftPropertyMergeSignature(property) !== buildLineDraftPropertyMergeSignature(propertyToInsert))
              .map((property) =>
                property.propertyGroupKey === mergeResult.targetProperty.propertyGroupKey
                  ? mergeResult.mergedProperty
                  : property)
          : [...existingProperties, propertyToInsert],
      };

      validateLineDraftProperties(normalizedDraft.properties);

      if (mergeResult?.targetProperty.propertyGroupKey) {
        const mutationTargetBid = await replaceLineDraftPropertyWithTierSync(
          db,
          {
            ...mergeResult.mergedProperty,
            propertyGroupKey: mergeResult.targetProperty.propertyGroupKey,
            rowSeq: mergeResult.targetProperty.rowSeq,
          },
          propertyIdentityByCode,
          {
            actor,
            bidId: parseCurrentDraftBidId(normalizedRequest),
            periodCode: normalizedDraft.periodCode,
            expectedDraftVersion: normalizedDraft.draftVersion,
            propertyGroupKey: mergeResult.targetProperty.propertyGroupKey,
            now,
            remarks: normalizedDraft.remarks,
          },
        );

        if (!mutationTargetBid) {
          const currentBid = await loadCurrentBidByReference(db, actor, period, normalizedRequest);

          if (currentBid && currentBid.draftVersion !== normalizedRequest.draftVersion) {
            throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
          }

          throw new LineholderBidServiceError(404, "Current line property not found.");
        }

        return {
          ...savedLineDraftMutationResponse(mutationTargetBid),
          propertyGroupKey: mergeResult.targetProperty.propertyGroupKey,
          rowSeq: mergeResult.targetProperty.rowSeq,
        };
      }

      const mutationResult = await db.transaction(async (tx) => {
        const targetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedDraft, now, {
          expectedDraftVersion: normalizedDraft.draftVersion,
          remarks: normalizedDraft.remarks,
        });
        const insertedProperty = await insertLineDraftPropertyWithTierSync(
          tx,
          propertyToInsert,
          propertyIdentityByCode,
          targetBid.bidId,
          actor,
          now,
        );

        return {
          targetBid,
          insertedProperty,
        };
      });

      return {
        ...savedLineDraftMutationResponse(mutationResult.targetBid),
        propertyGroupKey: mutationResult.insertedProperty.propertyGroupKey,
        rowSeq: mutationResult.insertedProperty.rowSeq,
      };
    },

    async removeCurrentDraftProperty(actor, propertyGroupKey, reference = {}) {
      const period = await getCurrentPeriod(actor);
      const normalizedPropertyGroupKey = normalizeLinePropertyGroupKey(propertyGroupKey);

      if (!normalizedPropertyGroupKey) {
        throw new LineholderBidServiceError(400, "Invalid line property key.");
      }

      const now = new Date();
      const expectedDraftVersion = normalizeCurrentDraftVersion(reference.draftVersion);
      const referenceBidId = parseCurrentDraftBidId(reference);
      const referencePeriodCode = reference.periodCode?.trim() || period.periodCode;

      if (referenceBidId !== null) {
        const existingBid = await loadCurrentBidByReference(db, actor, period, {
          ...reference,
          bidId: referenceBidId,
        });

        if (!existingBid) {
          throw new LineholderBidServiceError(404, "Current line property not found.");
        }

        if (existingBid.draftVersion !== expectedDraftVersion) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);
      } else {
        assertCurrentPeriodCanEdit(period, referencePeriodCode);
      }

      const targetBidAfterDelete = await deleteLineDraftPropertyWithTierSync(db, {
        actor,
        bidId: referenceBidId,
        periodCode: referencePeriodCode,
        expectedDraftVersion,
        propertyGroupKey: normalizedPropertyGroupKey,
        now,
      });

      if (!targetBidAfterDelete) {
        const existingBid = await loadCurrentBidByReference(db, actor, period, reference);

        if (existingBid && existingBid.draftVersion !== expectedDraftVersion) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        throw new LineholderBidServiceError(404, "Current line property not found.");
      }

      return savedLineDraftMutationResponse(targetBidAfterDelete);
    },

    async patchCurrentDraftProperty(actor, propertyGroupKey, request) {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedPropertyGroupKey = normalizeLinePropertyGroupKey(propertyGroupKey);

      if (!normalizedPropertyGroupKey) {
        throw new LineholderBidServiceError(400, "Invalid line property key.");
      }

      const normalizedRequest = normalizeLinePatchPropertyRequest(request, catalogByCode);
      const now = new Date();
      const existingBid = await loadCurrentBidByReference(db, actor, period, normalizedRequest);

      if (!existingBid) {
        throw new LineholderBidServiceError(404, "Current line property not found.");
      }

      if (existingBid.draftVersion !== normalizedRequest.draftVersion) {
        throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      }

      assertCurrentPeriodCanEdit(period, existingBid.periodCode);

      const existingProperties = await loadDraftProperties(db, existingBid.id, catalogByCode);
      const targetProperty = existingProperties.find((property) =>
        property.propertyGroupKey === normalizedPropertyGroupKey);

      if (!targetProperty) {
        throw new LineholderBidServiceError(404, "Current line property not found.");
      }

      const propertyToResolve: PbsLineDraftProperty = {
        ...normalizedRequest.property,
        propertyGroupKey: normalizedPropertyGroupKey,
        rowSeq: targetProperty.rowSeq,
      };
      const nextProperty = await resolveConfiguredLineProperty(
        propertyToResolve,
        (property) => property.bid.type === "minimum-base-layover"
          && targetProperty.bid.type === "minimum-base-layover"
          && normalizeLineDurationPadded(property.bid.minimumDuration)
            === normalizeLineDurationPadded(targetProperty.bid.minimumDuration),
      );
      const nextProperties = existingProperties.map((property) =>
        property.propertyGroupKey === normalizedPropertyGroupKey ? nextProperty : property);

      validateLineDraftProperties(nextProperties);

      const referenceBidId = parseCurrentDraftBidId(normalizedRequest);
      const mutationTargetBid = await replaceLineDraftPropertyWithTierSync(db, nextProperty, propertyIdentityByCode, {
        actor,
        bidId: referenceBidId,
        periodCode: normalizedRequest.periodCode || existingBid.periodCode || period.periodCode,
        expectedDraftVersion: normalizedRequest.draftVersion,
        propertyGroupKey: normalizedPropertyGroupKey,
        now,
        remarks: normalizedRequest.remarks,
      });

      if (!mutationTargetBid) {
        const currentBid = await loadCurrentBidByReference(db, actor, period, normalizedRequest);

        if (currentBid && currentBid.draftVersion !== normalizedRequest.draftVersion) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        throw new LineholderBidServiceError(404, "Current line property not found.");
      }

      return {
        ...savedLineDraftMutationResponse(mutationTargetBid),
        propertyGroupKey: normalizedPropertyGroupKey,
        tiers: nextProperty.tiers,
      };
    },

    async saveConfiguredFavoriteProperty(actor, request) {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedRequest = normalizeLineConfiguredFavoriteRequest(request, catalogByCode);
      const resolvedProperty = await resolveConfiguredLineProperty(normalizedRequest.property);
      const propertyIdentity = requireLineholderPropertyIdentity(
        resolvedProperty.propertyCode,
        propertyIdentityByCode,
        LINE_BID_TYPE,
      );

      validateLineDraftProperties([resolvedProperty]);
      assertConfiguredFavoriteCanBeSaved(
        resolvedProperty.bid,
        { kind: "generic" },
        (message) => new LineholderBidServiceError(400, message),
      );

      const now = new Date();
      const mutationResult = await db.transaction(async (tx) => {
        const targetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedRequest, now, {
          bumpDraftVersion: true,
          expectedDraftVersion: normalizedRequest.draftVersion,
        });
        const favoriteRows = await tx
          .insert(pbsBidLineFavorite)
          .values({
            bidId: targetBid.bidId,
            propertyId: propertyIdentity.propertyDefinitionId,
            propertyCode: propertyIdentity.propertyCode,
            favoriteName: resolvedProperty.name,
            action: resolvedProperty.action ?? null,
            bidPayload: resolvedProperty.bid,
            createdBy: actor.userCode,
            updatedBy: actor.userCode,
            updatedAt: now,
          })
          .returning({
            favoriteId: pbsBidLineFavorite.id,
            propertyId: pbsBidLineFavorite.propertyId,
            propertyCode: pbsBidLineFavorite.propertyCode,
          });
        const savedFavorite = favoriteRows[0];

        if (!savedFavorite) {
          throw new LineholderBidServiceError(500, "Unable to save the current line favorite.");
        }

        return {
          favorite: savedFavorite,
          draftIdentity: targetBid,
        };
      });

      return {
        ...savedLineDraftMutationResponse(mutationResult.draftIdentity),
        favoriteKey: `${CONFIGURED_LINE_FAVORITE_KEY_PREFIX}${mutationResult.favorite.favoriteId}`,
        propertyId: mutationResult.favorite.propertyId,
        propertyCode: mutationResult.favorite.propertyCode,
        name: resolvedProperty.name,
        action: resolvedProperty.action ?? null,
        bid: cloneRuleBidValue(resolvedProperty.bid),
      };
    },

    async patchFavoritePropertyByKey(actor, favoriteKey, request) {
      const configuredFavoriteId = favoriteKey.startsWith(CONFIGURED_LINE_FAVORITE_KEY_PREFIX)
        ? Number.parseInt(favoriteKey.slice(CONFIGURED_LINE_FAVORITE_KEY_PREFIX.length), 10)
        : null;
      if (configuredFavoriteId === null || !Number.isSafeInteger(configuredFavoriteId) || configuredFavoriteId <= 0) {
        throw new LineholderBidServiceError(400, "Invalid line favorite key.");
      }

      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode } = catalogContext;
      const normalizedRequest = normalizeLineConfiguredFavoriteRequest(request, catalogByCode);
      const existingBidForValidation = await loadCurrentBidByReference(db, actor, period, normalizedRequest);
      if (!existingBidForValidation) {
        throw new LineholderBidServiceError(404, "Current line favorite not found.");
      }
      const [existingFavoriteForValidation] = await db
        .select({
          propertyCode: pbsBidLineFavorite.propertyCode,
          bidPayload: pbsBidLineFavorite.bidPayload,
        })
        .from(pbsBidLineFavorite)
        .where(and(
          eq(pbsBidLineFavorite.id, configuredFavoriteId),
          eq(pbsBidLineFavorite.bidId, existingBidForValidation.id),
        ))
        .limit(1);
      if (!existingFavoriteForValidation) {
        throw new LineholderBidServiceError(404, "Current line favorite not found.");
      }
      const resolvedProperty = await resolveConfiguredLineProperty(
        normalizedRequest.property,
        (property) => property.bid.type === "minimum-base-layover"
          && existingFavoriteForValidation.propertyCode === property.propertyCode
          && existingFavoriteForValidation.bidPayload.type === "minimum-base-layover"
          && normalizeLineDurationPadded(property.bid.minimumDuration)
            === normalizeLineDurationPadded(existingFavoriteForValidation.bidPayload.minimumDuration),
      );
      validateLineDraftProperties([resolvedProperty]);
      assertConfiguredFavoriteCanBeSaved(
        resolvedProperty.bid,
        { kind: "generic" },
        (message) => new LineholderBidServiceError(400, message),
      );

      const now = new Date();
      const mutationResult = await db.transaction(async (tx) => {
        const existingBid = await loadCurrentBidByReference(tx, actor, period, normalizedRequest);

        if (!existingBid) {
          throw new LineholderBidServiceError(404, "Current line favorite not found.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);
        const [existingFavorite] = await tx
          .select({ propertyCode: pbsBidLineFavorite.propertyCode })
          .from(pbsBidLineFavorite)
          .where(and(
            eq(pbsBidLineFavorite.id, configuredFavoriteId),
            eq(pbsBidLineFavorite.bidId, existingBid.id),
          ))
          .limit(1);

        if (!existingFavorite) {
          throw new LineholderBidServiceError(404, "Current line favorite not found.");
        }
        if (existingFavorite.propertyCode !== resolvedProperty.propertyCode) {
          throw new LineholderBidServiceError(400, "A line favorite cannot change its property type.");
        }

        const targetBid = await ensureCurrentBidByReference(tx, actor, period, {
          ...normalizedRequest,
          bidId: existingBid.id,
        }, now, {
          bumpDraftVersion: true,
          expectedDraftVersion: normalizedRequest.draftVersion,
        });
        const [savedFavorite] = await tx
          .update(pbsBidLineFavorite)
          .set({
            favoriteName: resolvedProperty.name,
            action: resolvedProperty.action ?? null,
            bidPayload: resolvedProperty.bid,
            updatedBy: actor.userCode,
            updatedAt: now,
          })
          .where(and(
            eq(pbsBidLineFavorite.id, configuredFavoriteId),
            eq(pbsBidLineFavorite.bidId, existingBid.id),
          ))
          .returning({
            favoriteId: pbsBidLineFavorite.id,
            propertyId: pbsBidLineFavorite.propertyId,
            propertyCode: pbsBidLineFavorite.propertyCode,
          });

        if (!savedFavorite) {
          throw new LineholderBidServiceError(404, "Current line favorite not found.");
        }

        return { favorite: savedFavorite, draftIdentity: targetBid };
      });

      return {
        ...savedLineDraftMutationResponse(mutationResult.draftIdentity),
        favoriteKey: `${CONFIGURED_LINE_FAVORITE_KEY_PREFIX}${mutationResult.favorite.favoriteId}`,
        propertyId: mutationResult.favorite.propertyId,
        propertyCode: mutationResult.favorite.propertyCode,
        name: resolvedProperty.name,
        action: resolvedProperty.action ?? null,
        bid: cloneRuleBidValue(resolvedProperty.bid),
      };
    },

    async removeFavoritePropertyByKey(actor, favoriteKey, reference = {}) {
      const configuredFavoriteId = favoriteKey.startsWith(CONFIGURED_LINE_FAVORITE_KEY_PREFIX)
        ? Number.parseInt(favoriteKey.slice(CONFIGURED_LINE_FAVORITE_KEY_PREFIX.length), 10)
        : null;
      if (configuredFavoriteId === null || !Number.isSafeInteger(configuredFavoriteId) || configuredFavoriteId <= 0) {
        throw new LineholderBidServiceError(400, "Invalid line favorite key.");
      }

      const period = await getCurrentPeriod(actor);
      const targetBid = await db.transaction(async (tx) => {
        const existingBid = await loadCurrentBidByReference(tx, actor, period, reference);

        if (!existingBid) {
          throw new LineholderBidServiceError(404, "Current line favorite not found.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);

        const nextTargetBid = await ensureCurrentBidByReference(tx, actor, period, {
          ...reference,
          bidId: existingBid.id,
        }, new Date(), {
          bumpDraftVersion: true,
          expectedDraftVersion: normalizeCurrentDraftVersion(reference.draftVersion),
        });
        const deletedRows = await tx
          .delete(pbsBidLineFavorite)
          .where(and(
            eq(pbsBidLineFavorite.id, configuredFavoriteId),
            eq(pbsBidLineFavorite.bidId, existingBid.id),
          ))
          .returning({ id: pbsBidLineFavorite.id });

        if (deletedRows.length === 0) {
          throw new LineholderBidServiceError(404, "Current line favorite not found.");
        }

        return nextTargetBid;
      });

      return savedLineDraftMutationResponse(targetBid);
    },
  };
};
