import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import {
  pbsReservePropertyRegistry,
  type PbsReserveCurrentDraftResponse,
  type PbsReserveDraftDocument,
  type PbsReserveDraftProperty,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import { pbsBidGroup, pbsBidProperty, pbsBidTier } from "../../models/index.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import {
  CURRENT_BID_CONTEXT,
  buildDraftIdentity,
  ensureCurrentBidByReference,
  loadExistingBid,
  normalizeCurrentDraftVersion,
  parseCurrentDraftBidId,
  resolveCurrentPeriod,
  resolveLineholderPropertyCatalog,
  toPbsCurrentPeriod,
} from "../lineholder/shared.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import { deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { createPbsReserveCoverageService } from "./reserve-coverage-service.js";
import {
  cloneReservePropertyCatalogContext,
  cloneReservePropertyDefinition,
  type ReservePropertyCatalogContext,
} from "./reserve-property-catalog.js";
import {
  applyReserveCallTypeOptionsToCatalogContext,
  applyReserveCallTypeOptionsToDraftProperties,
  resolveReserveCallTypeOptions,
} from "./reserve-call-type-options.js";
import {
  RESERVE_BID_TYPE,
  normalizeReserveAddPropertyRequest,
  normalizeReserveDraftRequest,
  normalizeReservePatchPropertyRequest,
  savedReserveDraftMutationResponse,
} from "./reserve-mappers.js";
import {
  deleteReserveDraftPropertyWithTierSync,
  insertReserveDraftPropertyWithTierSync,
  replaceReserveDraftPropertyWithTierSync,
  writeReserveDraft,
} from "./reserve-draft-write.js";
import type { PbsReserveBidService } from "./types.js";
import type { PbsCache } from "../../utils/cache.js";

type Database = ReturnType<typeof drizzle>;

const CURRENT_PERIOD_CACHE_TTL_MS = 60_000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;

const resolvePropertyCatalog = (db: Database) =>
  resolveLineholderPropertyCatalog(db, {
    bidType: RESERVE_BID_TYPE,
    bidContext: CURRENT_BID_CONTEXT,
    propertyRegistry: pbsReservePropertyRegistry,
    clonePropertyDefinition: cloneReservePropertyDefinition,
  });

const buildEmptyDraft = (
  period: Awaited<ReturnType<typeof resolveCurrentPeriod>>,
): PbsReserveDraftDocument => ({
  ...buildDraftIdentity(period),
  bidContext: CURRENT_BID_CONTEXT,
  mode: "legacy",
  remarks: "",
  properties: [],
});

const loadDraftProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: ReservePropertyCatalogContext["catalogByCode"],
): Promise<PbsReserveDraftProperty[]> => {
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
      tier: pbsBidTier.tier,
    })
    .from(pbsBidGroup)
    .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
    .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
    .where(and(
      eq(pbsBidGroup.bidId, bidId),
      eq(pbsBidGroup.bidType, RESERVE_BID_TYPE),
    ))
    .orderBy(asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier));

  const propertiesByKey = new Map<string, PbsReserveDraftProperty>();

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

    existingProperty.tiers = Array.from(new Set([...existingProperty.tiers, `T${row.tier}`]))
      .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
  }

  return Array.from(propertiesByKey.values()).sort((left, right) => left.rowSeq - right.rowSeq);
};

type CreatePbsReserveBidServiceOptions = {
  db: Database;
  pgPool: Pool;
  liveSchema: string;
  pbsSchema: string;
  cache?: PbsCache;
};

export const createPbsReserveBidService = ({
  db,
  pgPool,
  liveSchema,
  pbsSchema,
  cache,
}: CreatePbsReserveBidServiceOptions): PbsReserveBidService => {
  const businessClock = createPbsBusinessClock({ db });
  const coverageService = createPbsReserveCoverageService({
    pgPool,
    liveSchema,
    pbsSchema,
  });
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;

  const getPropertyCatalog = async (
    actor: { crewId: string; userCode: string },
  ): Promise<{
    catalogContext: ReservePropertyCatalogContext;
    allowedCallTypes: readonly string[];
  }> => {
    const [catalogContext, callTypeContext] = await Promise.all([
      (async () => cloneReservePropertyCatalogContext(await resolvePropertyCatalog(db)))(),
      resolveReserveCallTypeOptions({ actor, pgPool, liveSchema, pbsSchema }),
    ]);

    return {
      catalogContext: applyReserveCallTypeOptionsToCatalogContext(catalogContext, callTypeContext.options),
      allowedCallTypes: callTypeContext.options,
    };
  };

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

  return {
    async getCurrentDraft(actor): Promise<PbsReserveCurrentDraftResponse> {
      const [period, catalogState] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(actor),
      ]);
      const { catalogContext, allowedCallTypes } = catalogState;
      const { catalog, catalogByCode } = catalogContext;
      const existingBid = await loadExistingBid(db, actor, period);

      if (!existingBid) {
        return {
          currentPeriod: toPbsCurrentPeriod(period),
          draft: buildEmptyDraft(period),
          propertyCatalog: catalog,
        };
      }

      return {
        currentPeriod: toPbsCurrentPeriod(period),
        draft: {
          ...buildDraftIdentity(period, existingBid),
          periodCode: existingBid.periodCode,
          bidContext: CURRENT_BID_CONTEXT,
          mode: "legacy",
          remarks: existingBid.remarks ?? "",
          properties: applyReserveCallTypeOptionsToDraftProperties(
            await loadDraftProperties(db, existingBid.id, catalogByCode),
            allowedCallTypes,
          ),
        },
        propertyCatalog: catalog,
      };
    },

    async saveCurrentDraft(actor, request): Promise<PbsReserveCurrentDraftResponse> {
      const [period, catalogState] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(actor),
      ]);
      const { catalogContext, allowedCallTypes } = catalogState;
      const { catalog, catalogByCode } = catalogContext;
      const normalizedDraft = normalizeReserveDraftRequest(request, catalogByCode, allowedCallTypes);
      const targetBid = await writeReserveDraft(db, {
        actor,
        period,
        catalogContext,
        normalizedDraft,
        now: new Date(),
      });

      return {
        currentPeriod: toPbsCurrentPeriod(period),
        draft: {
          ...normalizedDraft,
          draftKey: targetBid.draftKey,
          bidId: targetBid.bidId,
          periodId: targetBid.periodId,
          draftVersion: targetBid.draftVersion,
          periodCode: targetBid.periodCode,
        },
        propertyCatalog: catalog,
      };
    },

    async addCurrentDraftProperty(actor, request) {
      const [period, catalogState] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(actor),
      ]);
      const { catalogContext, allowedCallTypes } = catalogState;
      const normalizedRequest = normalizeReserveAddPropertyRequest(
        request,
        catalogContext.catalogByCode,
        allowedCallTypes,
      );
      const now = new Date();
      const targetBid = await db.transaction(async (tx) => {
        const ensuredBid = await ensureCurrentBidByReference(
          tx,
          actor,
          period,
          {
            draftKey: normalizedRequest.draftKey,
            bidId: normalizedRequest.bidId,
            periodCode: normalizedRequest.periodCode,
          },
          now,
          {
            expectedDraftVersion: normalizedRequest.draftVersion,
            remarks: normalizedRequest.remarks,
            bumpDraftVersion: true,
          },
        );
        const inserted = await insertReserveDraftPropertyWithTierSync(
          tx,
          normalizedRequest.property,
          catalogContext.propertyIdentityByCode,
          ensuredBid.bidId,
          actor,
          now,
        );

        return { ensuredBid, inserted };
      });

      return {
        ...savedReserveDraftMutationResponse(targetBid.ensuredBid),
        propertyGroupKey: targetBid.inserted.propertyGroupKey,
        rowSeq: targetBid.inserted.rowSeq,
      };
    },

    async patchCurrentDraftProperty(actor, propertyGroupKey, request) {
      const [period, catalogState] = await Promise.all([
        getCurrentPeriod(actor),
        getPropertyCatalog(actor),
      ]);
      const { catalogContext, allowedCallTypes } = catalogState;
      const normalizedRequest = normalizeReservePatchPropertyRequest(
        request,
        catalogContext.catalogByCode,
        allowedCallTypes,
      );
      const result = await replaceReserveDraftPropertyWithTierSync(
        db,
        normalizedRequest.property,
        catalogContext.propertyIdentityByCode,
        {
          actor,
          bidId: normalizedRequest.bidId,
          draftKey: normalizedRequest.draftKey,
          period,
          periodCode: normalizedRequest.periodCode,
          expectedDraftVersion: normalizedRequest.draftVersion,
          propertyGroupKey,
          now: new Date(),
          remarks: normalizedRequest.remarks,
        },
      );

      return {
        ...savedReserveDraftMutationResponse(result.targetBid),
        propertyGroupKey: result.propertyGroupKey,
        tiers: normalizedRequest.property.tiers,
      };
    },

    async removeCurrentDraftProperty(actor, propertyGroupKey, reference = {}) {
      const period = await getCurrentPeriod(actor);
      const targetBid = await deleteReserveDraftPropertyWithTierSync(db, {
        actor,
        bidId: parseCurrentDraftBidId(reference),
        draftKey: reference.draftKey ?? undefined,
        period,
        periodCode: reference.periodCode ?? undefined,
        expectedDraftVersion: normalizeCurrentDraftVersion(reference.draftVersion),
        propertyGroupKey,
        now: new Date(),
      });

      return savedReserveDraftMutationResponse(targetBid);
    },

    async getCurrentCoverage(actor) {
      return coverageService.getCurrentCoverage(actor, await getCurrentPeriod(actor));
    },
  };
};
