import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import {
  findPbsPairingRuleConflict,
  findPbsPairingRuleConflictInProperties,
  pbsPairingPropertyCatalog,
  type PbsPairingCurrentDraftResponse,
  type PbsPairingDraftMutationResponse,
  type PbsPairingDraftPropertyMutationResponse,
  type PbsPairingDraftProperty,
  type PbsPairingFavoriteMutationResponse,
  type PbsPatchPairingCurrentPropertyResponse,
  type PbsPairingRuleConflict,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  pbsBidCondition,
  pbsBidGroup,
  pbsBidPairingOccurrence,
  pbsBidPairingConfiguredFavorite,
  pbsBidProperty,
  pbsBidTier,
} from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
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
  syncBidTiers,
  toPbsCurrentPeriod,
  type CurrentBidTarget,
  type CurrentDraftReference,
} from "../lineholder/shared.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import {
  savedPairingDraftMutationResponse,
  savedPairingFavoriteMutationResponse,
  savedPairingPropertyMutationResponse,
} from "./pairing-mutation-response.js";
import {
  clonePairingPropertyCatalogContext,
  clonePairingPropertyDefinition,
  type PairingPropertyCatalogContext,
} from "./pairing-property-catalog.js";
import { PairingBidServiceError } from "./pairing-bid-errors.js";
import {
  isPairingOccurrenceListBid,
  writePairingOccurrencesForProperty,
} from "./pairing-occurrence-list.js";
import {
  buildDraftPropertyFromAddRequest,
  buildDraftPropertyFromPatchRequest,
  buildEmptyPairingDraft,
  normalizeAddPropertyRequest,
  normalizeDraftRequest,
  normalizeExistingPropertyGroupKey,
  normalizeFavoriteRequest,
  normalizePatchPropertyRequest,
} from "./pairing-bid-normalization.js";
import {
  loadDraftProperties,
  loadFavoriteProperties,
} from "./pairing-bid-read-model.js";
import {
  validateSpecificDatePairingDayOffConflicts,
} from "./pairing-specific-date.js";
import type { PbsCache } from "../../utils/cache.js";
import { createPairingReferenceOptionsLoader } from "./pairing-reference-options.js";
import { loadEfficientFlyingConfig } from "./efficient-flying-config.js";
import { loadRedeyeConfig } from "./redeye-config.js";
import {
  loadTimeBetweenFlightsMinimumConfig,
  parseTimeBetweenFlightsDurationMinutes,
  TIME_BETWEEN_FLIGHTS_PROPERTY_CODE,
  validateTimeBetweenFlightsMinimum,
} from "./time-between-flights-config.js";
import {
  buildGroupValuesForProperty,
  deletePairingPropertyWithTierSync,
  parsePairingCurrentDraftBidId,
  replaceDraftProperty,
  resolveTierNumbersForProperties,
  writePairingPropertyWithTierSync,
} from "./pairing-property-write.js";
import type { PairingDraftActor, PbsPairingBidService } from "./types.js";
import { assertConfiguredFavoriteCanBeSaved } from "../favorites/favorite-eligibility.js";

export {
  findSpecificDatePairingDayOffConflicts,
} from "./pairing-specific-date.js";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const CURRENT_PERIOD_CACHE_TTL_MS = 60 * 1000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

const buildCurrentDraftLockKey = (actor: PairingDraftActor, reference: CurrentDraftReference) => {
  const draftKey = reference.draftKey?.trim();

  if (draftKey) {
    return `pbs-pairing-bid:${actor.crewId}:${draftKey}`;
  }

  if (reference.bidId) {
    return `pbs-pairing-bid:${actor.crewId}:${reference.bidId}`;
  }

  return `pbs-pairing:${actor.crewId}:${reference.periodCode ?? ""}:${CURRENT_BID_CONTEXT}`;
};

const lockCurrentDraftMutation = async (
  tx: Transaction,
  actor: PairingDraftActor,
  reference: CurrentDraftReference,
) => {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${buildCurrentDraftLockKey(actor, reference)}, 0))
  `);
};

const resolvePropertyCatalog = (db: Database) =>
  resolveLineholderPropertyCatalog(db, {
    bidType: "Pairing",
    bidContext: CURRENT_BID_CONTEXT,
    propertyRegistry: pbsPairingPropertyCatalog,
    clonePropertyDefinition: clonePairingPropertyDefinition,
  });

const formatPairingRuleConflictError = (conflict: PbsPairingRuleConflict) => {
  if (conflict.type === "duplicate") {
    return `This pairing condition already exists in ${conflict.tier}.`;
  }

  return `${conflict.propertyName} can only be used once in ${conflict.tier}.`;
};

const assertPairingRulePropertiesValid = (properties: PbsPairingDraftProperty[]) => {
  const conflict = findPbsPairingRuleConflictInProperties(properties);

  if (conflict) {
    throw new PairingBidServiceError(409, formatPairingRuleConflictError(conflict));
  }
};

const assertPairingPropertyCanBeAdded = (
  existingProperties: PbsPairingDraftProperty[],
  candidateProperty: PbsPairingDraftProperty,
) => {
  const conflict = findPbsPairingRuleConflict(existingProperties, candidateProperty);

  if (conflict) {
    throw new PairingBidServiceError(409, formatPairingRuleConflictError(conflict));
  }
};

const timeBetweenFlightsDurationByKey = (properties: PbsPairingDraftProperty[]) =>
  new Map<string, number>(properties.flatMap((property) => {
    if (
      property.propertyCode !== TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
      || !property.propertyGroupKey
      || property.bid.type !== "duration"
    ) {
      return [];
    }
    const duration = parseTimeBetweenFlightsDurationMinutes(property.bid.value);
    return duration === null ? [] : [[property.propertyGroupKey, duration] as const];
  }));

const assertTimeBetweenFlightsPropertiesValid = (
  properties: PbsPairingDraftProperty[],
  config: Awaited<ReturnType<typeof loadTimeBetweenFlightsMinimumConfig>> | null,
  existingDurationByKey: ReadonlyMap<string, number> = new Map(),
) => {
  for (const property of properties) {
    if (property.propertyCode !== TIME_BETWEEN_FLIGHTS_PROPERTY_CODE) continue;
    const duration = property.bid.type === "duration"
      ? parseTimeBetweenFlightsDurationMinutes(property.bid.value)
      : null;
    const isGrandfathered = Boolean(
      property.propertyGroupKey
      && duration !== null
      && existingDurationByKey.get(property.propertyGroupKey) === duration,
    );
    const message = validateTimeBetweenFlightsMinimum(property, config, isGrandfathered);
    if (message) throw new PairingBidServiceError(400, message);
  }
};

const warmCurrentDraftReadModel = async (db: Pick<Database, "execute">) => {
  await Promise.all([
    db.execute(sql`
      select ${pbsBidGroup.id}
      from ${pbsBidGroup}
      inner join ${pbsBidTier} on ${pbsBidGroup.tierId} = ${pbsBidTier.id}
      left join ${pbsBidProperty} on ${pbsBidGroup.propertyDefinitionId} = ${pbsBidProperty.id}
      where ${pbsBidGroup.bidId} = -1
        and ${pbsBidGroup.bidType} = 'Pairing'
      order by ${pbsBidGroup.groupSeq}, ${pbsBidTier.tier}
      limit 1
    `),
    db.execute(sql`
      select ${pbsBidPairingOccurrence.propertyGroupKey}
      from ${pbsBidPairingOccurrence}
      where ${pbsBidPairingOccurrence.bidId} = -1
        and ${pbsBidPairingOccurrence.isDeleted} = 0
      order by
        ${pbsBidPairingOccurrence.propertyGroupKey},
        ${pbsBidPairingOccurrence.tier},
        ${pbsBidPairingOccurrence.pairingNumber},
        ${pbsBidPairingOccurrence.originDate}
      limit 1
    `),
    db.execute(sql`
      select ${pbsBidPairingConfiguredFavorite.id}
      from ${pbsBidPairingConfiguredFavorite}
      where ${pbsBidPairingConfiguredFavorite.bidId} = -1
      order by
        ${pbsBidPairingConfiguredFavorite.propertyCode},
        ${pbsBidPairingConfiguredFavorite.id}
      limit 1
    `),
  ]);
};

type CreatePbsPairingBidServiceOptions = {
  db: Database;
  pgPool?: Pool;
  liveSchema?: string;
  cache?: PbsCache;
};

export const createPbsPairingBidService = ({
  db,
  pgPool,
  liveSchema,
  cache,
}: CreatePbsPairingBidServiceOptions): PbsPairingBidService => {
  const schema = pgPool && liveSchema ? validateLiveSchema(liveSchema) : null;
  const businessClock = createPbsBusinessClock({ db });
  const loadReferenceOptions = createPairingReferenceOptionsLoader({ pgPool, liveSchema });
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;

  const getPropertyCatalog = async (): Promise<PairingPropertyCatalogContext> =>
    clonePairingPropertyCatalogContext(await resolvePropertyCatalog(db));

  const getCurrentPeriod = async (actor: PairingDraftActor): Promise<Awaited<ReturnType<typeof resolveCurrentPeriod>>> => {
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

  return {
    async warmUp() {
      await Promise.all([
        businessClock.getBusinessNow(),
        warmCurrentDraftReadModel(db),
      ]);
    },

    async getReferenceOptions() {
      return loadReferenceOptions();
    },

    async getEfficientFlyingConfig() {
      if (!pgPool || !schema) {
        throw new PairingBidServiceError(503, "Efficient flying configuration is unavailable.");
      }

      return loadEfficientFlyingConfig(pgPool, schema);
    },

    async getRedeyeConfig() {
      return loadRedeyeConfig(db);
    },

    async getCurrentDraft(actor): Promise<PbsPairingCurrentDraftResponse> {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalog, catalogByCode, recommendedPropertyCodes } = catalogContext;
      const existingBid = await loadExistingBid(db, actor, period);

      if (!existingBid) {
        return {
          currentPeriod: toPbsCurrentPeriod(period),
          draft: buildEmptyPairingDraft(period),
          propertyCatalog: catalog,
          favoriteProperties: [],
          recommendedPropertyCodes,
        };
      }

      const [properties, favoriteProperties] = await Promise.all([
        loadDraftProperties(db, existingBid.id, catalogByCode),
        loadFavoriteProperties(db, existingBid.id, catalogByCode),
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

    async saveCurrentDraft(actor, request): Promise<PbsPairingDraftMutationResponse> {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedDraft = normalizeDraftRequest(request, catalogByCode);
      const now = new Date();

      assertPairingRulePropertiesValid(normalizedDraft.properties);
      const needsTimeBetweenFlightsConfig = normalizedDraft.properties.some((property) =>
        property.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE);
      if (needsTimeBetweenFlightsConfig) {
        const existingBid = await loadCurrentBidByReference(db, actor, period, normalizedDraft);
        const [config, existingProperties] = await Promise.all([
          loadTimeBetweenFlightsMinimumConfig(db),
          existingBid
            ? loadDraftProperties(db, existingBid.id, catalogByCode)
            : Promise.resolve([]),
        ]);
        assertTimeBetweenFlightsPropertiesValid(
          normalizedDraft.properties,
          config,
          timeBetweenFlightsDurationByKey(existingProperties),
        );
      }

      const targetBid = await db.transaction(async (tx) => {
        await lockCurrentDraftMutation(tx, actor, {
          draftKey: normalizedDraft.draftKey,
          bidId: normalizedDraft.bidId,
          periodCode: normalizedDraft.periodCode || period.periodCode,
        });
        const nextTargetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedDraft, now, {
          expectedDraftVersion: normalizedDraft.draftVersion,
          remarks: normalizedDraft.remarks,
        });
        const bidId = nextTargetBid.bidId;

        await validateSpecificDatePairingDayOffConflicts({
          db: tx,
          pgPool,
          schema,
          bidId,
          rpStartLocal: period.rpStartLocal,
          rpEndLocal: period.rpEndLocal,
          properties: normalizedDraft.properties,
          actor,
        });

        const existingGroups = await tx
          .select({
            id: pbsBidGroup.id,
          })
          .from(pbsBidGroup)
          .where(and(
            eq(pbsBidGroup.bidId, bidId),
            eq(pbsBidGroup.bidType, "Pairing"),
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
            eq(pbsBidGroup.bidType, "Pairing"),
          ));

        const tierNumbers = resolveTierNumbersForProperties(normalizedDraft.properties);
        const tierIdByNumber = await ensureBidTiers(tx, bidId, tierNumbers, actor, now);
        const groupValues = normalizedDraft.properties.flatMap((property) =>
          buildGroupValuesForProperty(
            property,
            catalogByCode,
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

        for (const property of normalizedDraft.properties) {
          if (isPairingOccurrenceListBid(property.bid)) {
            await writePairingOccurrencesForProperty(tx, property, {
              actor,
              bidId,
              now,
            });
          }
        }

        await syncBidTiers(tx, bidId, actor, now);
        return nextTargetBid;
      });

      return savedPairingDraftMutationResponse(targetBid);
    },

    async addCurrentDraftProperty(actor, request): Promise<PbsPairingDraftPropertyMutationResponse> {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedPropertyRequest = normalizeAddPropertyRequest(request, catalogByCode);
      const now = new Date();
      const propertyGroupKey = randomUUID();
      const referenceBidId = parsePairingCurrentDraftBidId(normalizedPropertyRequest);
      let targetBid: CurrentBidTarget;

      if (referenceBidId !== null) {
        const existingBid = await loadCurrentBidByReference(db, actor, period, {
          ...normalizedPropertyRequest,
          bidId: referenceBidId,
        });

        if (!existingBid) {
          throw new PairingBidServiceError(404, "Current draft not found.");
        }

        if (existingBid.draftVersion !== normalizedPropertyRequest.draftVersion) {
          throw new PairingBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);

        targetBid = {
          draftKey: String(existingBid.id),
          bidId: existingBid.id,
          periodId: existingBid.rosterPeriodId,
          periodCode: existingBid.periodCode,
          draftVersion: existingBid.draftVersion,
        };
      } else {
        const periodCode = normalizedPropertyRequest.periodCode || period.periodCode;
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
      }

      const existingProperties = targetBid.draftVersion === 0
        ? []
        : await loadDraftProperties(db, targetBid.bidId, catalogByCode);
      const propertyToInsert = buildDraftPropertyFromAddRequest(
        normalizedPropertyRequest,
        propertyGroupKey,
        existingProperties.length + 1,
      );
      const savedPropertyGroupKey = propertyToInsert.propertyGroupKey ?? propertyGroupKey;
      const propertyToSave = {
        ...propertyToInsert,
        propertyGroupKey: savedPropertyGroupKey,
      };
      const replacePropertyGroupKey = undefined;

      assertPairingPropertyCanBeAdded(existingProperties, propertyToInsert);
      if (propertyToSave.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE) {
        assertTimeBetweenFlightsPropertiesValid(
          [propertyToSave],
          await loadTimeBetweenFlightsMinimumConfig(db),
        );
      }

      await validateSpecificDatePairingDayOffConflicts({
        db,
        pgPool,
        schema,
        bidId: targetBid.bidId,
        rpStartLocal: period.rpStartLocal,
        rpEndLocal: period.rpEndLocal,
        properties: [propertyToSave],
        actor,
      });

      const mutationResult = await db.transaction(async (tx) => {
        const result = await writePairingPropertyWithTierSync(
          tx,
          propertyToSave,
          catalogByCode,
          propertyIdentityByCode,
          {
            actor,
            bidId: targetBid.bidId,
            periodCode: targetBid.periodCode,
            expectedDraftVersion: targetBid.draftVersion,
            now,
            replacePropertyGroupKey,
            remarks: normalizedPropertyRequest.remarks,
          },
        );

        if (result) {
          await writePairingOccurrencesForProperty(tx, propertyToSave, {
            actor,
            bidId: targetBid.bidId,
            now,
          });
        }

        return result;
      });

      if (!mutationResult) {
        throw new PairingBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      }

      return savedPairingPropertyMutationResponse(
        savedPropertyGroupKey,
        mutationResult.rowSeq,
        savedPairingDraftMutationResponse(mutationResult.targetBid),
      );
    },

    async removeCurrentDraftProperty(actor, propertyGroupKey, reference = {}): Promise<PbsPairingDraftMutationResponse> {
      const period = await getCurrentPeriod(actor);
      const normalizedPropertyGroupKey = normalizeExistingPropertyGroupKey(propertyGroupKey);
      const expectedDraftVersion = normalizeCurrentDraftVersion(reference.draftVersion);
      const now = new Date();
      const referenceBidId = parsePairingCurrentDraftBidId(reference);
      const periodCode = reference.periodCode?.trim() || period.periodCode;

      if (referenceBidId !== null) {
        const existingBid = await loadCurrentBidByReference(db, actor, period, {
          ...reference,
          bidId: referenceBidId,
        });

        if (!existingBid) {
          throw new PairingBidServiceError(404, "Current pairing property not found.");
        }

        if (existingBid.draftVersion !== expectedDraftVersion) {
          throw new PairingBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);
      } else {
        assertCurrentPeriodCanEdit(period, periodCode);
      }

      const targetBid = await deletePairingPropertyWithTierSync(db, {
        actor,
        bidId: referenceBidId,
        periodCode,
        expectedDraftVersion,
        propertyGroupKey: normalizedPropertyGroupKey,
        now,
      });

      if (!targetBid) {
        const existingBid = await loadCurrentBidByReference(db, actor, period, {
          ...reference,
          bidId: referenceBidId ?? reference.bidId,
          periodCode,
        });

        if (!existingBid) {
          throw new PairingBidServiceError(404, "Current pairing property not found.");
        }

        if (existingBid.draftVersion !== expectedDraftVersion) {
          throw new PairingBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
        }

        throw new PairingBidServiceError(404, "Current pairing property not found.");
      }

      return savedPairingDraftMutationResponse(targetBid);
    },

    async patchCurrentDraftProperty(
      actor,
      propertyGroupKey,
      request,
    ): Promise<PbsPatchPairingCurrentPropertyResponse> {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedPropertyGroupKey = normalizeExistingPropertyGroupKey(propertyGroupKey);
      const normalizedRequest = normalizePatchPropertyRequest(request, catalogByCode);
      const now = new Date();
      const existingBid = await loadCurrentBidByReference(db, actor, period, normalizedRequest);

      if (!existingBid) {
        throw new PairingBidServiceError(404, "Current pairing property not found.");
      }

      if (existingBid.draftVersion !== normalizedRequest.draftVersion) {
        throw new PairingBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      }

      assertCurrentPeriodCanEdit(period, existingBid.periodCode);

      if (normalizedRequest.tiers.length === 0) {
        const deletedBid = await deletePairingPropertyWithTierSync(db, {
          actor,
          bidId: existingBid.id,
          periodCode: existingBid.periodCode,
          expectedDraftVersion: normalizedRequest.draftVersion,
          propertyGroupKey: normalizedPropertyGroupKey,
          now,
        });

        if (!deletedBid) {
          throw new PairingBidServiceError(404, "Current pairing property not found.");
        }

        return {
          ...savedPairingDraftMutationResponse(deletedBid),
          propertyGroupKey: normalizedPropertyGroupKey,
          deleted: true,
          tiers: [],
        };
      }

      const existingProperties = await loadDraftProperties(db, existingBid.id, catalogByCode);
      const targetProperty = existingProperties.find((property) =>
        property.propertyGroupKey === normalizedPropertyGroupKey);

      if (!targetProperty) {
        throw new PairingBidServiceError(404, "Current pairing property not found.");
      }

      const nextProperty = buildDraftPropertyFromPatchRequest(
        normalizedRequest,
        normalizedPropertyGroupKey,
        targetProperty.rowSeq,
      );
      const nextProperties = replaceDraftProperty(existingProperties, nextProperty);

      assertPairingRulePropertiesValid(nextProperties);
      if (nextProperty.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE) {
        assertTimeBetweenFlightsPropertiesValid(
          [nextProperty],
          await loadTimeBetweenFlightsMinimumConfig(db),
          timeBetweenFlightsDurationByKey([targetProperty]),
        );
      }
      await validateSpecificDatePairingDayOffConflicts({
        db,
        pgPool,
        schema,
        bidId: existingBid.id,
        rpStartLocal: period.rpStartLocal,
        rpEndLocal: period.rpEndLocal,
        properties: [nextProperty],
        actor,
      });

      const mutationResult = await db.transaction(async (tx) => {
        const result = await writePairingPropertyWithTierSync(
          tx,
          nextProperty,
          catalogByCode,
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

        if (result) {
          await writePairingOccurrencesForProperty(tx, nextProperty, {
            actor,
            bidId: existingBid.id,
            now,
          });
        }

        return result;
      });

      if (!mutationResult) {
        throw new PairingBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      }

      return {
        ...savedPairingDraftMutationResponse(mutationResult.targetBid),
        propertyGroupKey: normalizedPropertyGroupKey,
        deleted: false,
        tiers: nextProperty.tiers,
      };
    },

    async saveConfiguredFavoriteProperty(actor, request): Promise<PbsPairingFavoriteMutationResponse> {
      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedRequest = normalizeFavoriteRequest(request, catalogByCode);
      const propertyIdentity = requireLineholderPropertyIdentity(
        normalizedRequest.propertyCode,
        propertyIdentityByCode,
        "Pairing",
      );
      assertConfiguredFavoriteCanBeSaved(
        normalizedRequest.bid,
        { kind: "generic" },
        (message) => new PairingBidServiceError(400, message),
      );
      if (normalizedRequest.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE) {
        const message = validateTimeBetweenFlightsMinimum(
          { propertyCode: normalizedRequest.propertyCode, bid: normalizedRequest.bid },
          await loadTimeBetweenFlightsMinimumConfig(db),
        );
        if (message) throw new PairingBidServiceError(400, message);
      }
      const now = new Date();

      const mutationResult = await db.transaction(async (tx) => {
        const targetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedRequest, now, {
          bumpDraftVersion: true,
          expectedDraftVersion: normalizedRequest.draftVersion,
        });
        const favoriteRows = await tx
          .insert(pbsBidPairingConfiguredFavorite)
          .values({
            bidId: targetBid.bidId,
            propertyId: propertyIdentity.propertyDefinitionId,
            propertyCode: propertyIdentity.propertyCode,
            favoriteName: normalizedRequest.name,
            action: normalizedRequest.action,
            quantifier: normalizedRequest.quantifier,
            bidPayload: normalizedRequest.bid,
            createdBy: actor.userCode,
            updatedBy: actor.userCode,
            updatedAt: now,
          })
          .returning({
            favoriteKey: sql<string>`${pbsBidPairingConfiguredFavorite.id}::text`,
            propertyId: pbsBidPairingConfiguredFavorite.propertyId,
            propertyCode: pbsBidPairingConfiguredFavorite.propertyCode,
          });
        const savedFavorite = favoriteRows[0];

        if (!savedFavorite) {
          throw new PairingBidServiceError(500, "Unable to save the current pairing favorite.");
        }

        return {
          favorite: savedFavorite,
          draftIdentity: targetBid,
        };
      });

      return savedPairingFavoriteMutationResponse(
        {
          ...mutationResult.favorite,
          name: normalizedRequest.name,
          action: normalizedRequest.action,
          quantifier: normalizedRequest.quantifier,
          bid: normalizedRequest.bid,
        },
        mutationResult.draftIdentity,
      );
    },

    async patchFavoritePropertyByKey(actor, favoriteKey, request): Promise<PbsPairingFavoriteMutationResponse> {
      const favoriteId = Number.parseInt(favoriteKey, 10);

      if (!Number.isSafeInteger(favoriteId) || favoriteId <= 0) {
        throw new PairingBidServiceError(400, "Invalid pairing favorite key.");
      }

      const [period, catalogContext] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(),
      ]);
      const { catalogByCode, propertyIdentityByCode } = catalogContext;
      const normalizedRequest = normalizeFavoriteRequest(request, catalogByCode);
      const propertyIdentity = requireLineholderPropertyIdentity(
        normalizedRequest.propertyCode,
        propertyIdentityByCode,
        "Pairing",
      );
      assertConfiguredFavoriteCanBeSaved(
        normalizedRequest.bid,
        { kind: "generic" },
        (message) => new PairingBidServiceError(400, message),
      );
      const timeBetweenFlightsConfig = normalizedRequest.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE
        ? await loadTimeBetweenFlightsMinimumConfig(db)
        : null;
      const now = new Date();
      const mutationResult = await db.transaction(async (tx) => {
        const existingBid = await loadCurrentBidByReference(tx, actor, period, normalizedRequest);

        if (!existingBid) {
          throw new PairingBidServiceError(404, "Current pairing favorite not found.");
        }

        assertCurrentPeriodCanEdit(period, existingBid.periodCode);

        const existingFavoriteRows = await tx
          .select({
            propertyCode: pbsBidPairingConfiguredFavorite.propertyCode,
            bidPayload: pbsBidPairingConfiguredFavorite.bidPayload,
          })
          .from(pbsBidPairingConfiguredFavorite)
          .where(and(
            eq(pbsBidPairingConfiguredFavorite.id, favoriteId),
            eq(pbsBidPairingConfiguredFavorite.bidId, existingBid.id),
          ))
          .limit(1);
        const existingFavorite = existingFavoriteRows[0];

        if (!existingFavorite) {
          throw new PairingBidServiceError(404, "Current pairing favorite not found.");
        }

        if (existingFavorite.propertyCode !== propertyIdentity.propertyCode) {
          throw new PairingBidServiceError(400, "A pairing favorite cannot change its property type.");
        }
        if (normalizedRequest.propertyCode === TIME_BETWEEN_FLIGHTS_PROPERTY_CODE) {
          const nextDuration = normalizedRequest.bid.type === "duration"
            ? parseTimeBetweenFlightsDurationMinutes(normalizedRequest.bid.value)
            : null;
          const existingDuration = existingFavorite.bidPayload.type === "duration"
            ? parseTimeBetweenFlightsDurationMinutes(existingFavorite.bidPayload.value)
            : null;
          const message = validateTimeBetweenFlightsMinimum(
            { propertyCode: normalizedRequest.propertyCode, bid: normalizedRequest.bid },
            timeBetweenFlightsConfig,
            nextDuration !== null && nextDuration === existingDuration,
          );
          if (message) throw new PairingBidServiceError(400, message);
        }

        const targetBid = await ensureCurrentBidByReference(tx, actor, period, {
          ...normalizedRequest,
          bidId: existingBid.id,
        }, now, {
          bumpDraftVersion: true,
          expectedDraftVersion: normalizedRequest.draftVersion,
        });
        const favoriteRows = await tx
          .update(pbsBidPairingConfiguredFavorite)
          .set({
            favoriteName: normalizedRequest.name,
            action: normalizedRequest.action,
            quantifier: normalizedRequest.quantifier,
            bidPayload: normalizedRequest.bid,
            updatedBy: actor.userCode,
            updatedAt: now,
          })
          .where(and(
            eq(pbsBidPairingConfiguredFavorite.id, favoriteId),
            eq(pbsBidPairingConfiguredFavorite.bidId, existingBid.id),
          ))
          .returning({
            favoriteKey: sql<string>`${pbsBidPairingConfiguredFavorite.id}::text`,
            propertyId: pbsBidPairingConfiguredFavorite.propertyId,
            propertyCode: pbsBidPairingConfiguredFavorite.propertyCode,
          });
        const savedFavorite = favoriteRows[0];

        if (!savedFavorite) {
          throw new PairingBidServiceError(404, "Current pairing favorite not found.");
        }

        return { favorite: savedFavorite, draftIdentity: targetBid };
      });

      return savedPairingFavoriteMutationResponse(
        {
          ...mutationResult.favorite,
          name: normalizedRequest.name,
          action: normalizedRequest.action,
          quantifier: normalizedRequest.quantifier,
          bid: normalizedRequest.bid,
        },
        mutationResult.draftIdentity,
      );
    },

    async removeFavoritePropertyByKey(actor, favoriteKey, reference = {}): Promise<PbsPairingDraftMutationResponse> {
      const favoriteId = Number.parseInt(favoriteKey, 10);

      if (!Number.isSafeInteger(favoriteId) || favoriteId <= 0) {
        throw new PairingBidServiceError(400, "Invalid pairing favorite key.");
      }

      const period = await getCurrentPeriod(actor);

      const targetBid = await db.transaction(async (tx) => {
        const existingBid = await loadCurrentBidByReference(tx, actor, period, reference);

        if (!existingBid) {
          throw new PairingBidServiceError(404, "Current pairing favorite not found.");
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
          .delete(pbsBidPairingConfiguredFavorite)
          .where(and(
            eq(pbsBidPairingConfiguredFavorite.id, favoriteId),
            eq(pbsBidPairingConfiguredFavorite.bidId, existingBid.id),
          ))
          .returning({ id: pbsBidPairingConfiguredFavorite.id });

        if (deletedRows.length === 0) {
          throw new PairingBidServiceError(404, "Current pairing favorite not found.");
        }

        return nextTargetBid;
      });

      return savedPairingDraftMutationResponse(targetBid);
    },

  };
};

export { PairingBidServiceError };
