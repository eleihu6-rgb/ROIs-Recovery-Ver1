import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  pbsDaysOffPropertyRegistry,
  type PbsDaysOffCurrentDraftResponse,
  type PbsDaysOffDraftMutationResponse,
  type PbsDaysOffDraftProperty,
  type PbsPatchDaysOffCurrentPropertyResponse,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  pbsBid,
  pbsBidDaysOffFavorite,
  pbsBidCondition,
  pbsBidGroup,
} from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  assertCurrentPeriodCanEdit,
  buildDraftIdentity,
  ensureBidTiers,
  ensureCurrentBidByReference,
  loadCurrentBidByReference,
  loadExistingBid,
  normalizeCurrentDraftVersion,
  requireLineholderPropertyIdentity,
  resolveCurrentPeriod,
  resolveLineholderPropertyCatalog,
  type CurrentBidTarget,
  toPbsCurrentPeriod,
  syncBidTiers,
} from "../lineholder/shared.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import {
  buildDaysOffDraftPropertyFromPatchRequest,
  buildDaysOffDraftPropertyFromAddRequest,
  buildEmptyDaysOffDraft,
  normalizeDaysOffAddPropertyRequest,
  normalizeDaysOffDraftRequest,
  normalizeDaysOffFavoriteRequest,
  normalizeDaysOffPatchPropertyRequest,
  normalizeDaysOffPropertyGroupKey,
  type NormalizedDaysOffDraftProperty,
} from "./days-off-draft-mappers.js";
import {
  loadDaysOffDraftProperties,
  loadDaysOffFavoriteProperties,
  loadStableCurrentBidAddValidationProperties,
} from "./days-off-draft-queries.js";
import { saveStableCurrentDraftWithTierSync } from "./days-off-draft-write.js";
import {
  cloneDaysOffPropertyCatalogContext,
  cloneDaysOffPropertyDefinition,
  filterVisibleDaysOffPropertyCatalog,
  type DaysOffPropertyCatalogContext,
} from "./days-off-property-catalog.js";
import {
  savedDraftMutationResponse,
  savedFavoriteMutationResponse,
  savedMutationResponse,
  savedPropertyMutationResponse,
} from "./days-off-mutation-response.js";
import {
  buildDaysOffGroupValuesForProperty,
  parseStableCurrentDraftBidId,
} from "./days-off-persistence-mappers.js";
import {
  deleteDaysOffGroupsByPropertyKey,
  deleteDaysOffPropertyWithTierSync,
  insertDraftPropertyWithTierSync,
  resolveTierNumbersForDaysOffProperties,
  writeDaysOffPropertyWithTierSync,
} from "./days-off-property-write.js";
import { validateDaysOffDraftProperties } from "./days-off-validation.js";
import type { PbsDaysOffBidService } from "./types.js";
import type { PbsCache } from "../../utils/cache.js";
import {
  clonePreferOffConfig,
  loadPreferOffConfig,
} from "./prefer-off-config.js";
import { normalizePreferOffProperty } from "./prefer-off-property.js";
import {
  listPbsPeriodDates,
  type PbsPreferOffConfig,
} from "../../../../packages/contracts/pbs-prefer-off.js";
import { assertConfiguredFavoriteCanBeSaved } from "../favorites/favorite-eligibility.js";

type Database = ReturnType<typeof drizzle>;

const DAYS_OFF_BID_TYPE = "DaysOff";
const LONG_STRETCH_OFF_PROPERTY_CODE = 204;
const CURRENT_PERIOD_CACHE_TTL_MS = 60_000;
const PREFER_OFF_CONFIG_CACHE_TTL_MS = 5 * 60_000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;

type DaysOffMutationTimingEvent = {
  operation: "addCurrentDraftProperty" | "patchCurrentDraftProperty" | "removeCurrentDraftProperty";
  outcome: "saved" | "error";
  propertyGroupKey?: string;
  hasStableBidId: boolean;
  draftVersion: number | null;
  elapsedMs: number;
  steps: Record<string, number>;
};

type DaysOffMutationTimingLogger = (event: DaysOffMutationTimingEvent) => void;

export const materializeReusableLongStretchPeriod = <TProperty extends PbsDaysOffDraftProperty>(
  property: TProperty,
  rpStartLocal: string,
  rpEndLocal: string,
): TProperty => {
  if (
    property.propertyCode !== LONG_STRETCH_OFF_PROPERTY_CODE
    || property.bid.type !== "stepper-date-range"
    || property.bid.from
    || property.bid.to
  ) {
    return property;
  }

  const periodDates = listPbsPeriodDates(rpStartLocal, rpEndLocal);
  const from = periodDates[0];
  const to = periodDates.at(-1);

  return from && to
    ? { ...property, bid: { ...property.bid, from, to } } as TProperty
    : property;
};

const createDaysOffMutationTimer = (
  logger: DaysOffMutationTimingLogger | undefined,
  operation: DaysOffMutationTimingEvent["operation"],
) => {
  const startedAt = Date.now();
  let previousMarkAt = startedAt;
  const steps: Record<string, number> = {};

  return {
    mark(step: string) {
      if (!logger) {
        return;
      }

      const now = Date.now();
      steps[step] = (steps[step] ?? 0) + now - previousMarkAt;
      previousMarkAt = now;
    },
    finish(metadata: Omit<DaysOffMutationTimingEvent, "operation" | "elapsedMs" | "steps">) {
      if (!logger) {
        return;
      }

      logger({
        operation,
        ...metadata,
        elapsedMs: Date.now() - startedAt,
        steps: { ...steps },
      });
    },
  };
};

const loadStableCurrentBidById = async (
  db: Pick<Database, "select">,
  actor: { crewId: string },
  bidId: number,
) => {
  const rows = await db
    .select({
      id: pbsBid.id,
      periodCode: pbsBid.periodCode,
      rosterPeriodId: pbsBid.rosterPeriodId,
      draftVersion: pbsBid.draftVersion,
      remarks: pbsBid.remarks,
    })
    .from(pbsBid)
    .where(and(
      eq(pbsBid.id, bidId),
      eq(pbsBid.crewId, actor.crewId),
      eq(pbsBid.bidContext, CURRENT_BID_CONTEXT),
    ))
    .limit(1);

  return rows[0] ?? null;
};

const resolvePropertyCatalog = (db: Database) =>
  resolveLineholderPropertyCatalog(db, {
    bidType: DAYS_OFF_BID_TYPE,
    bidContext: CURRENT_BID_CONTEXT,
    propertyRegistry: pbsDaysOffPropertyRegistry,
    clonePropertyDefinition: cloneDaysOffPropertyDefinition,
  });

type CreatePbsDaysOffBidServiceOptions = {
  db: Database;
  cache?: PbsCache;
  mutationTimingLogger?: DaysOffMutationTimingLogger;
};

export const createPbsDaysOffBidService = ({
  db,
  cache,
  mutationTimingLogger,
}: CreatePbsDaysOffBidServiceOptions): PbsDaysOffBidService => {
  const businessClock = createPbsBusinessClock({ db });
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;
  let preferOffConfigCache: {
    expiresAt: number;
    value: PbsPreferOffConfig;
  } | null = null;

  const getPropertyCatalog = async (): Promise<DaysOffPropertyCatalogContext> =>
    cloneDaysOffPropertyCatalogContext(await resolvePropertyCatalog(db));

  const getCurrentPeriod = async (actor: { crewId: string; userCode: string }): Promise<Awaited<ReturnType<typeof resolveCurrentPeriod>>> => {
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

  const getPreferOffConfig = async (): Promise<PbsPreferOffConfig> => {
    const now = Date.now();

    if (preferOffConfigCache && preferOffConfigCache.expiresAt > now) {
      return clonePreferOffConfig(preferOffConfigCache.value);
    }

    const config = await loadPreferOffConfig(db);
    preferOffConfigCache = {
      expiresAt: now + PREFER_OFF_CONFIG_CACHE_TTL_MS,
      value: clonePreferOffConfig(config),
    };

    return clonePreferOffConfig(config);
  };

  return {
  async getCurrentDraft(actor): Promise<PbsDaysOffCurrentDraftResponse> {
    const [period, catalogContext, preferOffConfig] = await Promise.all([
      getCurrentPeriod(actor),
      getPropertyCatalog(),
      getPreferOffConfig(),
    ]);
    const { catalog, catalogByCode, recommendedPropertyCodes } = catalogContext;
    const visibleCatalog = filterVisibleDaysOffPropertyCatalog(catalog);
    const existingBid = await loadExistingBid(db, actor, period);

    if (!existingBid) {
      return {
        currentPeriod: toPbsCurrentPeriod(period),
        preferOffConfig,
        draft: buildEmptyDaysOffDraft(period),
        propertyCatalog: visibleCatalog,
        favoriteProperties: [],
        recommendedPropertyCodes,
      };
    }

    const [properties, favoriteProperties] = await Promise.all([
      loadDaysOffDraftProperties(db, existingBid.id, catalogByCode),
      loadDaysOffFavoriteProperties(db, existingBid.id, catalogByCode),
    ]);

    return {
      currentPeriod: toPbsCurrentPeriod(period),
      preferOffConfig,
      draft: {
        ...buildDraftIdentity(period, existingBid),
        periodCode: existingBid.periodCode,
        bidContext: CURRENT_BID_CONTEXT,
        remarks: existingBid.remarks ?? "",
        properties,
      },
      propertyCatalog: visibleCatalog,
      favoriteProperties,
      recommendedPropertyCodes,
    };
  },

  async saveCurrentDraft(actor, request): Promise<PbsDaysOffDraftMutationResponse> {
    const [catalogContext, preferOffConfig, period] = await Promise.all([
      getPropertyCatalog(),
      getPreferOffConfig(),
      getCurrentPeriod(actor),
    ]);
    const { catalogByCode, propertyIdentityByCode } = catalogContext;
    const normalizedDraft = normalizeDaysOffDraftRequest(
      request,
      catalogByCode,
      preferOffConfig,
      period,
    );
    const now = new Date();
    const stableBidId = parseStableCurrentDraftBidId(normalizedDraft);

    if (stableBidId !== null) {
      const existingBid = await loadStableCurrentBidById(db, actor, stableBidId);

      if (!existingBid) {
        throw new LineholderBidServiceError(404, "Current draft not found.");
      }

      assertCurrentPeriodCanEdit(period, existingBid.periodCode);

      const targetBid = await saveStableCurrentDraftWithTierSync(
        db,
        actor,
        normalizedDraft,
        propertyIdentityByCode,
        now,
      );

      return savedDraftMutationResponse(targetBid);
    }

    const targetBid = await db.transaction(async (tx) => {
      const nextTargetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedDraft, now, {
        expectedDraftVersion: normalizedDraft.draftVersion,
      });
      const bidId = nextTargetBid.bidId;

      const existingGroups = await tx
        .select({
          id: pbsBidGroup.id,
        })
        .from(pbsBidGroup)
        .where(and(
          eq(pbsBidGroup.bidId, bidId),
          eq(pbsBidGroup.bidType, DAYS_OFF_BID_TYPE),
        ));

      if (existingGroups.length > 0) {
        await tx
          .delete(pbsBidCondition)
          .where(inArray(
            pbsBidCondition.groupId,
            existingGroups.map((group) => group.id),
          ));
      }

      await tx
        .delete(pbsBidGroup)
        .where(and(
          eq(pbsBidGroup.bidId, bidId),
          eq(pbsBidGroup.bidType, DAYS_OFF_BID_TYPE),
        ));

      const tierNumbers = resolveTierNumbersForDaysOffProperties(normalizedDraft.properties);
      const tierIdByNumber = await ensureBidTiers(tx, bidId, tierNumbers, actor, now);
      const groupValues = normalizedDraft.properties.flatMap((property) =>
        buildDaysOffGroupValuesForProperty(
          property as NormalizedDaysOffDraftProperty,
          propertyIdentityByCode,
          tierIdByNumber,
          bidId,
          actor,
          now,
        ),
      );

      if (groupValues.length > 0) {
        await tx.insert(pbsBidGroup).values(groupValues);
      }

      await syncBidTiers(tx, bidId, actor, now);
      return nextTargetBid;
    });

    return savedDraftMutationResponse(targetBid);
  },

  async addCurrentDraftProperty(actor, request) {
    const timer = createDaysOffMutationTimer(mutationTimingLogger, "addCurrentDraftProperty");
    let propertyGroupKey = "";
    let referenceBidId: number | null = null;
    let draftVersion: number | null = null;

    try {
      const [catalogContext, preferOffConfig] = await Promise.all([
        getPropertyCatalog(),
        getPreferOffConfig(),
      ]);
      timer.mark("propertyCatalog");
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedPropertyRequest = normalizeDaysOffAddPropertyRequest(request, catalogByCode);
      const now = new Date();
      propertyGroupKey = randomUUID();
      referenceBidId = parseStableCurrentDraftBidId(normalizedPropertyRequest);
      draftVersion = normalizedPropertyRequest.draftVersion;
      let targetBid: CurrentBidTarget;
      let targetPeriod: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
      let validationProperties: PbsDaysOffDraftProperty[];
      timer.mark("normalize");

      if (referenceBidId !== null) {
        const period = await getCurrentPeriod(actor);
        targetPeriod = period;
        const existingBid = await loadStableCurrentBidById(db, actor, referenceBidId);

        if (!existingBid) {
          throw new LineholderBidServiceError(404, "Current draft not found.");
        }

        if (existingBid.draftVersion !== normalizedPropertyRequest.draftVersion) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);

        targetBid = {
          draftKey: String(referenceBidId),
          bidId: referenceBidId,
          periodId: existingBid.rosterPeriodId,
          periodCode: existingBid.periodCode,
          draftVersion: normalizedPropertyRequest.draftVersion,
        };
        validationProperties = normalizedPropertyRequest.draftVersion === 0
          ? []
          : await loadStableCurrentBidAddValidationProperties(
            db,
            actor,
            referenceBidId,
            catalogByCode,
          );
        timer.mark("loadValidationProperties");
      } else {
        const period = await getCurrentPeriod(actor);
        targetPeriod = period;
        const periodCode = normalizedPropertyRequest.periodCode || period.periodCode;
        timer.mark("resolveCurrentPeriod");

        targetBid = await db.transaction((tx) =>
          ensureCurrentBidByReference(tx, actor, period, {
            draftKey: normalizedPropertyRequest.draftKey,
            bidId: normalizedPropertyRequest.bidId,
            periodCode,
          }, now, {
            bumpDraftVersion: false,
            expectedDraftVersion: normalizedPropertyRequest.draftVersion,
            remarks: normalizedPropertyRequest.remarks,
          }));
        validationProperties = targetBid.draftVersion === 0
          ? []
          : await loadDaysOffDraftProperties(db, targetBid.bidId, catalogByCode);
        timer.mark("loadValidationProperties");
      }

      const propertyToInsert = materializeReusableLongStretchPeriod(normalizePreferOffProperty(
        buildDaysOffDraftPropertyFromAddRequest(
          normalizedPropertyRequest,
          propertyGroupKey,
          validationProperties.length + 1,
        ),
        { periodCode: targetBid.periodCode, preferOffConfig },
      ), targetPeriod.rpStartLocal, targetPeriod.rpEndLocal);

      validateDaysOffDraftProperties([...validationProperties, propertyToInsert], {
        rpStartLocal: targetPeriod.rpStartLocal,
        rpEndLocal: targetPeriod.rpEndLocal,
        preferOffConfig,
      });
      timer.mark("validate");

      const mutationResult = await writeDaysOffPropertyWithTierSync(
        db,
        propertyToInsert,
        propertyIdentityByCode,
        {
          actor,
          bidId: targetBid.bidId,
          periodCode: targetBid.periodCode,
          expectedDraftVersion: targetBid.draftVersion,
          now,
          remarks: normalizedPropertyRequest.remarks,
        },
      );
      timer.mark("writeProperty");

      if (!mutationResult) {
        throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      }

      timer.finish({
        outcome: "saved",
        propertyGroupKey,
        hasStableBidId: referenceBidId !== null,
        draftVersion,
      });
      return savedPropertyMutationResponse(
        propertyGroupKey,
        mutationResult.rowSeq,
        savedDraftMutationResponse(mutationResult.targetBid),
      );
    } catch (error) {
      timer.finish({
        outcome: "error",
        propertyGroupKey,
        hasStableBidId: referenceBidId !== null,
        draftVersion,
      });
      throw error;
    }
  },

  async removeCurrentDraftProperty(actor, propertyGroupKey, reference = {}) {
    const timer = createDaysOffMutationTimer(mutationTimingLogger, "removeCurrentDraftProperty");
    let normalizedPropertyGroupKey = propertyGroupKey;
    let expectedDraftVersion: number | null = null;
    let referenceBidId: number | null = null;

    try {
      normalizedPropertyGroupKey = normalizeDaysOffPropertyGroupKey(propertyGroupKey);

      if (!normalizedPropertyGroupKey) {
        throw new LineholderBidServiceError(400, "Invalid days off property key.");
      }

      const now = new Date();
      expectedDraftVersion = normalizeCurrentDraftVersion(reference.draftVersion);
      referenceBidId = parseStableCurrentDraftBidId(reference);
      const period = await getCurrentPeriod(actor);
      let referencePeriodCode = reference.periodCode?.trim() ?? "";
      timer.mark("normalize");

      if (referenceBidId !== null) {
        const existingBid = await loadStableCurrentBidById(db, actor, referenceBidId);

        if (!existingBid) {
          throw new LineholderBidServiceError(404, "Current days off property not found.");
        }

        if (existingBid.draftVersion !== expectedDraftVersion) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);
        referencePeriodCode = existingBid.periodCode;
        timer.mark("loadTargetBid");
      } else {
        if (!referencePeriodCode) {
          referencePeriodCode = period.periodCode;
        }
        assertCurrentPeriodCanEdit(period, referencePeriodCode);
      }

      const targetBidAfterDelete = await deleteDaysOffPropertyWithTierSync(db, {
        actor,
        bidId: referenceBidId,
        periodCode: referencePeriodCode,
        expectedDraftVersion,
        propertyGroupKey: normalizedPropertyGroupKey,
        now,
      });
      timer.mark("writeProperty");

      if (!targetBidAfterDelete) {
        const existingBid = referenceBidId !== null
          ? await loadStableCurrentBidById(db, actor, referenceBidId)
          : await loadCurrentBidByReference(
            db,
            actor,
            period,
            reference,
          );
        timer.mark("loadTargetBidAfterMiss");

        if (existingBid && existingBid.draftVersion !== expectedDraftVersion) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        throw new LineholderBidServiceError(404, "Current days off property not found.");
      }

      timer.finish({
        outcome: "saved",
        propertyGroupKey: normalizedPropertyGroupKey,
        hasStableBidId: referenceBidId !== null,
        draftVersion: expectedDraftVersion,
      });
      return savedMutationResponse(targetBidAfterDelete);
    } catch (error) {
      timer.finish({
        outcome: "error",
        propertyGroupKey: normalizedPropertyGroupKey,
        hasStableBidId: referenceBidId !== null,
        draftVersion: expectedDraftVersion,
      });
      throw error;
    }
  },

  async patchCurrentDraftProperty(
    actor,
    propertyGroupKey,
    request,
  ): Promise<PbsPatchDaysOffCurrentPropertyResponse> {
    const timer = createDaysOffMutationTimer(mutationTimingLogger, "patchCurrentDraftProperty");
    let normalizedPropertyGroupKey = propertyGroupKey;
    let referenceBidId: number | null = null;
    let draftVersion: number | null = null;

    try {
      const [catalogContext, preferOffConfig] = await Promise.all([
        getPropertyCatalog(),
        getPreferOffConfig(),
      ]);
      timer.mark("propertyCatalog");
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      normalizedPropertyGroupKey = normalizeDaysOffPropertyGroupKey(propertyGroupKey);

      if (!normalizedPropertyGroupKey) {
        throw new LineholderBidServiceError(400, "Invalid days off property key.");
      }

      const normalizedRequest = normalizeDaysOffPatchPropertyRequest(request);
      const now = new Date();
      referenceBidId = parseStableCurrentDraftBidId(normalizedRequest);
      draftVersion = normalizedRequest.draftVersion;
      timer.mark("normalize");

      if (referenceBidId !== null) {
        const existingBid = await loadStableCurrentBidById(db, actor, referenceBidId);
        timer.mark("loadTargetBid");

        if (!existingBid) {
          throw new LineholderBidServiceError(404, "Current days off property not found.");
        }

        if (existingBid.draftVersion !== normalizedRequest.draftVersion) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        const period = await getCurrentPeriod(actor);
        assertCurrentPeriodCanEdit(period, existingBid.periodCode);

        const existingProperties = await loadDaysOffDraftProperties(db, existingBid.id, catalogByCode);
        timer.mark("loadExistingProperties");
        const targetProperty = existingProperties.find((property) =>
          property.propertyGroupKey === normalizedPropertyGroupKey);

        if (!targetProperty) {
          throw new LineholderBidServiceError(404, "Current days off property not found.");
        }

        const nextProperty = normalizePreferOffProperty(
          buildDaysOffDraftPropertyFromPatchRequest(
            normalizedRequest,
            normalizedPropertyGroupKey,
            targetProperty.rowSeq,
            targetProperty,
          ),
          { periodCode: existingBid.periodCode, preferOffConfig },
        );
        const nextProperties = existingProperties.map((property) =>
          property.propertyGroupKey === normalizedPropertyGroupKey ? nextProperty : property);

        validateDaysOffDraftProperties(nextProperties, {
          rpStartLocal: period.rpStartLocal,
          rpEndLocal: period.rpEndLocal,
          preferOffConfig,
        });
        timer.mark("validate");

        const mutationResult = await writeDaysOffPropertyWithTierSync(
          db,
          nextProperty,
          propertyIdentityByCode,
          {
            actor,
            bidId: existingBid.id,
            periodCode: existingBid.periodCode,
            expectedDraftVersion: normalizedRequest.draftVersion,
            now,
            replacePropertyGroupKey: normalizedPropertyGroupKey,
          },
        );
        timer.mark("writeProperty");

        if (!mutationResult) {
          throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        timer.finish({
          outcome: "saved",
          propertyGroupKey: normalizedPropertyGroupKey,
          hasStableBidId: true,
          draftVersion,
        });
        return {
          ...savedDraftMutationResponse(mutationResult.targetBid),
          propertyGroupKey: normalizedPropertyGroupKey,
          tiers: normalizedRequest.tiers,
        };
      }

      const period = await getCurrentPeriod(actor);
      timer.mark("resolveCurrentPeriod");
      const targetBid = await db.transaction(async (tx) => {
        const nextTargetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedRequest, now, {
          expectedDraftVersion: normalizedRequest.draftVersion,
        });
        const existingProperties = await loadDaysOffDraftProperties(tx, nextTargetBid.bidId, catalogByCode);
        const targetProperty = existingProperties.find((property) =>
          property.propertyGroupKey === normalizedPropertyGroupKey);

        if (!targetProperty) {
          throw new LineholderBidServiceError(404, "Current days off property not found.");
        }

        const nextProperty = normalizePreferOffProperty(
          buildDaysOffDraftPropertyFromPatchRequest(
            normalizedRequest,
            normalizedPropertyGroupKey,
            targetProperty.rowSeq,
            targetProperty,
          ),
          { periodCode: nextTargetBid.periodCode, preferOffConfig },
        );
        const nextProperties = existingProperties.map((property) =>
          property.propertyGroupKey === normalizedPropertyGroupKey ? nextProperty : property);

        validateDaysOffDraftProperties(nextProperties, {
          rpStartLocal: period.rpStartLocal,
          rpEndLocal: period.rpEndLocal,
          preferOffConfig,
        });
        await deleteDaysOffGroupsByPropertyKey(tx, nextTargetBid.bidId, normalizedPropertyGroupKey);
        await insertDraftPropertyWithTierSync(
          tx,
          nextProperty,
          propertyIdentityByCode,
          nextTargetBid.bidId,
          actor,
          now,
        );
        await syncBidTiers(tx, nextTargetBid.bidId, actor, now);

        return nextTargetBid;
      });
      timer.mark("writeProperty");

      timer.finish({
        outcome: "saved",
        propertyGroupKey: normalizedPropertyGroupKey,
        hasStableBidId: false,
        draftVersion,
      });
      return {
        ...savedDraftMutationResponse(targetBid),
        propertyGroupKey: normalizedPropertyGroupKey,
        tiers: normalizedRequest.tiers,
      };
    } catch (error) {
      timer.finish({
        outcome: "error",
        propertyGroupKey: normalizedPropertyGroupKey,
        hasStableBidId: referenceBidId !== null,
        draftVersion,
      });
      throw error;
    }
  },

  async saveFavoriteProperty(actor, request) {
    const [catalogContext, preferOffConfig, period] = await Promise.all([
      getPropertyCatalog(),
      getPreferOffConfig(),
      getCurrentPeriod(actor),
    ]);
    const { catalogByCode, propertyIdentityByCode } = catalogContext;
    let normalizedRequest = normalizeDaysOffFavoriteRequest(request, catalogByCode);
    const favoritePeriodCode = normalizedRequest.periodCode || period.periodCode;
    const normalizedFavoriteProperty = normalizePreferOffProperty(
      buildDaysOffDraftPropertyFromAddRequest({
        ...normalizedRequest,
        tiers: ["T1"],
      }, "favorite-validation", 1),
      { periodCode: favoritePeriodCode, preferOffConfig },
    );
    normalizedRequest = {
      ...normalizedRequest,
      allOrNothing: normalizedFavoriteProperty.allOrNothing,
      minimumN: normalizedFavoriteProperty.minimumN,
      maximumN: normalizedFavoriteProperty.maximumN,
    };

    const propertyIdentity = requireLineholderPropertyIdentity(
      normalizedRequest.propertyCode,
      propertyIdentityByCode,
      DAYS_OFF_BID_TYPE,
    );
    validateDaysOffDraftProperties([
      materializeReusableLongStretchPeriod(
        normalizedFavoriteProperty,
        period.rpStartLocal,
        period.rpEndLocal,
      ),
    ], {
      rpStartLocal: period.rpStartLocal,
      rpEndLocal: period.rpEndLocal,
      preferOffConfig,
    });
    assertConfiguredFavoriteCanBeSaved(
      normalizedFavoriteProperty.bid,
      normalizedRequest.propertyCode === 201
        ? { kind: "prefer-off", preferOffConfig }
        : { kind: "generic" },
      (message) => new LineholderBidServiceError(400, message),
    );
    const now = new Date();
    const mutationResult = await db.transaction(async (tx) => {
      const targetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedRequest, now, {
        bumpDraftVersion: true,
        expectedDraftVersion: normalizedRequest.draftVersion,
      });
      const favoriteRows = await tx
        .insert(pbsBidDaysOffFavorite)
        .values({
          bidId: targetBid.bidId,
          propertyId: propertyIdentity.propertyDefinitionId,
          propertyCode: propertyIdentity.propertyCode,
          action: normalizedRequest.action,
          bidPayload: normalizedRequest.bid,
          allOrNothing: normalizedRequest.allOrNothing ? 1 : 0,
          minimumN: normalizedRequest.minimumN ?? null,
          maximumN: normalizedRequest.maximumN ?? null,
          createdBy: actor.userCode,
          updatedBy: actor.userCode,
          updatedAt: now,
        })
        .returning({
          favoriteKey: sql<string>`${pbsBidDaysOffFavorite.id}::text`,
          propertyId: pbsBidDaysOffFavorite.propertyId,
          propertyCode: pbsBidDaysOffFavorite.propertyCode,
        });

      const savedFavorite = favoriteRows[0];

      if (!savedFavorite) {
        throw new LineholderBidServiceError(500, "Unable to save the current days off favorite.");
      }

      return {
        favorite: savedFavorite,
        draftIdentity: targetBid,
      };
    });

    return savedFavoriteMutationResponse(
      {
        ...mutationResult.favorite,
        name: normalizedRequest.name,
        action: normalizedRequest.action,
        bid: normalizedRequest.bid,
        allOrNothing: normalizedRequest.allOrNothing,
        minimumN: normalizedRequest.minimumN,
        maximumN: normalizedRequest.maximumN,
      },
      savedDraftMutationResponse(mutationResult.draftIdentity),
    );
  },

  async patchFavoritePropertyByKey(actor, favoriteKey, request) {
    const favoriteId = Number.parseInt(favoriteKey, 10);

    if (!Number.isSafeInteger(favoriteId) || favoriteId <= 0) {
      throw new LineholderBidServiceError(400, "Invalid days off favorite key.");
    }

    const [catalogContext, preferOffConfig, period] = await Promise.all([
      getPropertyCatalog(),
      getPreferOffConfig(),
      getCurrentPeriod(actor),
    ]);
    const { catalogByCode } = catalogContext;
    let normalizedRequest = normalizeDaysOffFavoriteRequest(request, catalogByCode);
    const favoritePeriodCode = normalizedRequest.periodCode || period.periodCode;
    const normalizedFavoriteProperty = normalizePreferOffProperty(
      buildDaysOffDraftPropertyFromAddRequest({
        ...normalizedRequest,
        tiers: ["T1"],
      }, "favorite-validation", 1),
      { periodCode: favoritePeriodCode, preferOffConfig },
    );
    normalizedRequest = {
      ...normalizedRequest,
      allOrNothing: normalizedFavoriteProperty.allOrNothing,
      minimumN: normalizedFavoriteProperty.minimumN,
      maximumN: normalizedFavoriteProperty.maximumN,
    };
    validateDaysOffDraftProperties([
      materializeReusableLongStretchPeriod(
        normalizedFavoriteProperty,
        period.rpStartLocal,
        period.rpEndLocal,
      ),
    ], {
      rpStartLocal: period.rpStartLocal,
      rpEndLocal: period.rpEndLocal,
      preferOffConfig,
    });
    assertConfiguredFavoriteCanBeSaved(
      normalizedFavoriteProperty.bid,
      normalizedRequest.propertyCode === 201
        ? { kind: "prefer-off", preferOffConfig }
        : { kind: "generic" },
      (message) => new LineholderBidServiceError(400, message),
    );

    const now = new Date();
    const mutationResult = await db.transaction(async (tx) => {
      const existingBid = await loadCurrentBidByReference(tx, actor, period, normalizedRequest);

      if (!existingBid) {
        throw new LineholderBidServiceError(404, "Current days off favorite not found.");
      }

      assertCurrentPeriodCanEdit(period, existingBid.periodCode);
      const [existingFavorite] = await tx
        .select({ propertyCode: pbsBidDaysOffFavorite.propertyCode })
        .from(pbsBidDaysOffFavorite)
        .where(and(
          eq(pbsBidDaysOffFavorite.id, favoriteId),
          eq(pbsBidDaysOffFavorite.bidId, existingBid.id),
        ))
        .limit(1);

      if (!existingFavorite) {
        throw new LineholderBidServiceError(404, "Current days off favorite not found.");
      }
      if (existingFavorite.propertyCode !== normalizedRequest.propertyCode) {
        throw new LineholderBidServiceError(400, "A days off favorite cannot change its property type.");
      }

      const targetBid = await ensureCurrentBidByReference(tx, actor, period, {
        ...normalizedRequest,
        bidId: existingBid.id,
      }, now, {
        bumpDraftVersion: true,
        expectedDraftVersion: normalizedRequest.draftVersion,
      });
      const [savedFavorite] = await tx
        .update(pbsBidDaysOffFavorite)
        .set({
          action: normalizedRequest.action,
          bidPayload: normalizedRequest.bid,
          allOrNothing: normalizedRequest.allOrNothing ? 1 : 0,
          minimumN: normalizedRequest.minimumN ?? null,
          maximumN: normalizedRequest.maximumN ?? null,
          updatedBy: actor.userCode,
          updatedAt: now,
        })
        .where(and(
          eq(pbsBidDaysOffFavorite.id, favoriteId),
          eq(pbsBidDaysOffFavorite.bidId, existingBid.id),
        ))
        .returning({
          favoriteKey: sql<string>`${pbsBidDaysOffFavorite.id}::text`,
          propertyId: pbsBidDaysOffFavorite.propertyId,
          propertyCode: pbsBidDaysOffFavorite.propertyCode,
        });

      if (!savedFavorite) {
        throw new LineholderBidServiceError(404, "Current days off favorite not found.");
      }

      return { favorite: savedFavorite, draftIdentity: targetBid };
    });

    return savedFavoriteMutationResponse(
      {
        ...mutationResult.favorite,
        name: normalizedRequest.name,
        action: normalizedRequest.action,
        bid: normalizedRequest.bid,
        allOrNothing: normalizedRequest.allOrNothing,
        minimumN: normalizedRequest.minimumN,
        maximumN: normalizedRequest.maximumN,
      },
      savedDraftMutationResponse(mutationResult.draftIdentity),
    );
  },

  async removeFavoritePropertyByKey(actor, favoriteKey, reference = {}) {
    const favoriteId = Number.parseInt(favoriteKey, 10);

    if (!Number.isSafeInteger(favoriteId) || favoriteId <= 0) {
      throw new LineholderBidServiceError(400, "Invalid days off favorite key.");
    }

    const period = await getCurrentPeriod(actor);

    const targetBid = await db.transaction(async (tx) => {
      const existingBid = await loadCurrentBidByReference(tx, actor, period, reference);

      if (!existingBid) {
        throw new LineholderBidServiceError(404, "Current days off favorite not found.");
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
        .delete(pbsBidDaysOffFavorite)
        .where(and(
          eq(pbsBidDaysOffFavorite.id, favoriteId),
          eq(pbsBidDaysOffFavorite.bidId, existingBid.id),
        ))
        .returning({ id: pbsBidDaysOffFavorite.id });

      if (deletedRows.length === 0) {
        throw new LineholderBidServiceError(404, "Current days off favorite not found.");
      }

      return nextTargetBid;
    });

    return savedDraftMutationResponse(targetBid);
  },

  };
};
