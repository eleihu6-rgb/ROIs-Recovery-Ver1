import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PbsReserveDraftDocument, PbsReserveDraftProperty } from "../../../../packages/contracts/pbs-reserve-bids.js";
import { pbsBidGroup, pbsBidTier } from "../../models/index.js";
import {
  LineholderBidServiceError,
  ensureBidTiers,
  ensureCurrentBidByReference,
  parseTierKey,
  requireLineholderPropertyIdentity,
  syncBidTiers,
  type LineholderDraftActor,
  type LineholderPeriodContext,
} from "../lineholder/shared.js";
import { serializeRuleBid } from "../lineholder/rule-bid-value.js";
import type { ReservePropertyCatalogContext } from "./reserve-property-catalog.js";
import { RESERVE_BID_TYPE, normalizeReservePropertyGroupKey } from "./reserve-mappers.js";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const resolveTierNumbers = (property: PbsReserveDraftProperty) =>
  property.tiers.map((tier) => parseTierKey(tier).number);

const nextReserveGroupSeq = async (tx: Pick<Transaction, "select">, bidId: number) => {
  const rows = await tx
    .select({ maxSeq: sql<number>`coalesce(max(${pbsBidGroup.groupSeq}), 0)::integer` })
    .from(pbsBidGroup)
    .where(and(
      eq(pbsBidGroup.bidId, bidId),
      eq(pbsBidGroup.bidType, RESERVE_BID_TYPE),
    ));

  return (rows[0]?.maxSeq ?? 0) + 1;
};

export const insertReserveDraftPropertyWithTierSync = async (
  tx: Transaction,
  property: PbsReserveDraftProperty,
  propertyIdentityByCode: ReservePropertyCatalogContext["propertyIdentityByCode"],
  bidId: number,
  actor: LineholderDraftActor,
  now: Date,
) => {
  const propertyIdentity = requireLineholderPropertyIdentity(
    property.propertyCode,
    propertyIdentityByCode,
    RESERVE_BID_TYPE,
  );
  const tierNumbers = resolveTierNumbers(property);

  if (tierNumbers.length === 0) {
    throw new LineholderBidServiceError(400, "Reserve properties require at least one tier.");
  }

  const serializedBid = serializeRuleBid(property.bid);
  const duplicateRows = await tx
    .select({
      propertyGroupKey: pbsBidGroup.propertyGroupKey,
      tier: pbsBidTier.tier,
    })
    .from(pbsBidGroup)
    .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
    .where(and(
      eq(pbsBidGroup.bidId, bidId),
      eq(pbsBidGroup.bidType, RESERVE_BID_TYPE),
      eq(pbsBidGroup.propertyDefinitionId, propertyIdentity.propertyDefinitionId),
      sql`${pbsBidGroup.operator} is not distinct from ${serializedBid.operator}`,
      sql`${pbsBidGroup.paramA} is not distinct from ${serializedBid.paramA}`,
      sql`${pbsBidGroup.paramB} is not distinct from ${serializedBid.paramB}`,
      sql`${pbsBidGroup.paramC} is not distinct from ${serializedBid.paramC}`,
    ));

  const tierKey = tierNumbers.slice().sort((left, right) => left - right).join(",");
  const groupedTiers = new Map<string, number[]>();

  for (const row of duplicateRows) {
    const current = groupedTiers.get(row.propertyGroupKey) ?? [];
    groupedTiers.set(row.propertyGroupKey, [...current, row.tier]);
  }

  for (const tiers of groupedTiers.values()) {
    if (Array.from(new Set(tiers)).sort((left, right) => left - right).join(",") === tierKey) {
      throw new LineholderBidServiceError(409, "This reserve property already exists.");
    }
  }

  const tierIdByNumber = await ensureBidTiers(tx, bidId, tierNumbers, actor, now);
  const groupSeq = await nextReserveGroupSeq(tx, bidId);
  const propertyGroupKey = normalizeReservePropertyGroupKey(property.propertyGroupKey) || randomUUID();

  await tx.insert(pbsBidGroup).values(tierNumbers.map((tierNumber) => {
    const tierId = tierIdByNumber.get(tierNumber);

    if (!tierId) {
      throw new LineholderBidServiceError(500, "Unable to resolve reserve tier.");
    }

    return {
      tierId,
      bidId,
      groupSeq,
      propertyGroupKey,
      bidType: RESERVE_BID_TYPE,
      actionId: null,
      legacyPropertyCode: propertyIdentity.propertyCode,
      propertyDefinitionId: propertyIdentity.propertyDefinitionId,
      operator: serializedBid.operator,
      paramA: serializedBid.paramA,
      paramB: serializedBid.paramB,
      paramC: serializedBid.paramC,
      totalConditions: 0,
      createdBy: actor.userCode,
      updatedBy: actor.userCode,
      updatedAt: now,
    };
  }));

  await syncBidTiers(tx, bidId, actor, now);

  return {
    rowSeq: groupSeq,
    propertyGroupKey,
  };
};

export const writeReserveDraft = async (
  db: Database,
  options: {
    actor: LineholderDraftActor;
    period: LineholderPeriodContext;
    catalogContext: ReservePropertyCatalogContext;
    normalizedDraft: PbsReserveDraftDocument;
    now: Date;
  },
) => db.transaction(async (tx) => {
  const targetBid = await ensureCurrentBidByReference(
    tx,
    options.actor,
    options.period,
    {
      draftKey: options.normalizedDraft.draftKey,
      bidId: options.normalizedDraft.bidId,
      periodCode: options.normalizedDraft.periodCode,
    },
    options.now,
    {
      expectedDraftVersion: options.normalizedDraft.draftVersion,
      remarks: options.normalizedDraft.remarks,
      bumpDraftVersion: true,
    },
  );

  await tx
    .delete(pbsBidGroup)
    .where(and(
      eq(pbsBidGroup.bidId, targetBid.bidId),
      eq(pbsBidGroup.bidType, RESERVE_BID_TYPE),
    ));

  for (const property of options.normalizedDraft.properties) {
    await insertReserveDraftPropertyWithTierSync(
      tx,
      property,
      options.catalogContext.propertyIdentityByCode,
      targetBid.bidId,
      options.actor,
      options.now,
    );
  }

  await syncBidTiers(tx, targetBid.bidId, options.actor, options.now);

  return targetBid;
});

export const replaceReserveDraftPropertyWithTierSync = async (
  db: Database,
  property: PbsReserveDraftProperty,
  propertyIdentityByCode: ReservePropertyCatalogContext["propertyIdentityByCode"],
  options: {
    actor: LineholderDraftActor;
    bidId?: number | null;
    draftKey?: string;
    period: LineholderPeriodContext;
    periodCode?: string;
    expectedDraftVersion: number;
    propertyGroupKey: string;
    now: Date;
    remarks?: string;
  },
) => db.transaction(async (tx) => {
  const targetBid = await ensureCurrentBidByReference(
    tx,
    options.actor,
    options.period,
    {
      bidId: options.bidId ?? undefined,
      draftKey: options.draftKey,
      periodCode: options.periodCode,
    },
    options.now,
    {
      expectedDraftVersion: options.expectedDraftVersion,
      remarks: options.remarks,
      bumpDraftVersion: true,
    },
  );

  const deletedRows = await tx
    .delete(pbsBidGroup)
    .where(and(
      eq(pbsBidGroup.bidId, targetBid.bidId),
      eq(pbsBidGroup.bidType, RESERVE_BID_TYPE),
      eq(pbsBidGroup.propertyGroupKey, options.propertyGroupKey),
    ))
    .returning({ groupSeq: pbsBidGroup.groupSeq });

  if (deletedRows.length === 0) {
    throw new LineholderBidServiceError(404, "Reserve property not found.");
  }

  const rowSeq = deletedRows[0]?.groupSeq ?? 1;
  const inserted = await insertReserveDraftPropertyWithTierSync(
    tx,
    { ...property, propertyGroupKey: options.propertyGroupKey, rowSeq },
    propertyIdentityByCode,
    targetBid.bidId,
    options.actor,
    options.now,
  );

  return {
    targetBid,
    propertyGroupKey: inserted.propertyGroupKey,
  };
});

export const deleteReserveDraftPropertyWithTierSync = async (
  db: Database,
  options: {
    actor: LineholderDraftActor;
    bidId?: number | null;
    draftKey?: string;
    period: LineholderPeriodContext;
    periodCode?: string;
    expectedDraftVersion: number;
    propertyGroupKey: string;
    now: Date;
  },
) => db.transaction(async (tx) => {
  const targetBid = await ensureCurrentBidByReference(
    tx,
    options.actor,
    options.period,
    {
      bidId: options.bidId ?? undefined,
      draftKey: options.draftKey,
      periodCode: options.periodCode,
    },
    options.now,
    {
      expectedDraftVersion: options.expectedDraftVersion,
      bumpDraftVersion: true,
    },
  );

  const deletedRows = await tx
    .delete(pbsBidGroup)
    .where(and(
      eq(pbsBidGroup.bidId, targetBid.bidId),
      eq(pbsBidGroup.bidType, RESERVE_BID_TYPE),
      eq(pbsBidGroup.propertyGroupKey, options.propertyGroupKey),
    ))
    .returning({ id: pbsBidGroup.id });

  if (deletedRows.length === 0) {
    throw new LineholderBidServiceError(404, "Reserve property not found.");
  }

  await syncBidTiers(tx, targetBid.bidId, options.actor, options.now);
  return targetBid;
});
