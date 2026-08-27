import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { pbsBidGroup, pbsBidPairingOccurrence, pbsBidTier } from "../../models/index.js";
import { isValidIsoDate } from "../lineholder/date-utils.js";
import { isStablePairingId } from "../pairing-search/pairing-id-utils.js";
import { PairingBidServiceError } from "./pairing-bid-errors.js";
import type { PairingDraftActor } from "./types.js";

type Database = ReturnType<typeof drizzle>;
type OccurrenceListBid = Extract<PbsPairingDraftProperty["bid"], { type: "pairing-occurrence-list" }>;

export const isPairingOccurrenceListBid = (
  bid: PbsPairingDraftProperty["bid"],
): bid is OccurrenceListBid => bid.type === "pairing-occurrence-list";

export const normalizePairingOccurrenceNumber = (value: string) => value.trim().toUpperCase();

const buildOccurrenceKey = (pairingId: string, originDate: string) => `${pairingId}|${originDate}`;

export const normalizePairingOccurrenceListBid = (bid: OccurrenceListBid): OccurrenceListBid => {
  const occurrencesByKey = new Map<string, OccurrenceListBid["occurrences"][number]>();

  for (const occurrence of bid.occurrences) {
    const pairingNumber = normalizePairingOccurrenceNumber(occurrence.pairingNumber);
    const pairingId = occurrence.pairingId.trim();
    const originDate = occurrence.originDate.trim();

    if (!pairingNumber) {
      throw new PairingBidServiceError(400, "Pairing Number is required.");
    }

    if (!isValidIsoDate(originDate)) {
      throw new PairingBidServiceError(400, "Pairing run date must be a valid date.");
    }

    if (!isStablePairingId(pairingId)) {
      throw new PairingBidServiceError(400, "Pairing Number requires a valid Pairing ID.");
    }

    occurrencesByKey.set(buildOccurrenceKey(pairingId, originDate), {
      pairingNumber,
      originDate,
      pairingId,
      ...(occurrence.occurrenceId?.trim() ? { occurrenceId: occurrence.occurrenceId.trim() } : {}),
    });
  }

  const occurrences = Array.from(occurrencesByKey.values()).sort((left, right) => {
    if (left.pairingNumber !== right.pairingNumber) {
      return left.pairingNumber.localeCompare(right.pairingNumber);
    }

    return left.originDate.localeCompare(right.originDate);
  });

  if (occurrences.length === 0) {
    throw new PairingBidServiceError(400, "Pairing Number requires at least one selected run date.");
  }

  return {
    type: "pairing-occurrence-list",
    occurrences,
    ...(bid.suggestions ? { suggestions: [...bid.suggestions] } : {}),
  };
};

export const getPairingOccurrenceListNumbers = (bid: OccurrenceListBid) =>
  Array.from(new Set(bid.occurrences.map((occurrence) => occurrence.pairingNumber))).sort();

export const getPairingOccurrenceListIds = (bid: OccurrenceListBid) =>
  Array.from(new Set(bid.occurrences.map((occurrence) => occurrence.pairingId.trim()).filter(isStablePairingId))).sort();

export type PairingOccurrenceListRow = {
  propertyGroupKey: string;
  tier: number;
  pairingNumber: string;
  originDate: string;
  pairingId: string;
  occurrenceId: string | null;
};

export const loadPairingOccurrenceRows = async (
  db: Pick<Database, "select">,
  bidId: number,
): Promise<PairingOccurrenceListRow[]> => {
  const rows = await db
    .select({
      propertyGroupKey: pbsBidPairingOccurrence.propertyGroupKey,
      tier: pbsBidPairingOccurrence.tier,
      pairingNumber: pbsBidPairingOccurrence.pairingNumber,
      originDate: pbsBidPairingOccurrence.originDate,
      pairingId: pbsBidPairingOccurrence.pairingId,
      occurrenceId: pbsBidPairingOccurrence.occurrenceId,
    })
    .from(pbsBidPairingOccurrence)
    .where(and(
      eq(pbsBidPairingOccurrence.bidId, bidId),
      eq(pbsBidPairingOccurrence.isDeleted, 0),
    ))
    .orderBy(
      asc(pbsBidPairingOccurrence.propertyGroupKey),
      asc(pbsBidPairingOccurrence.tier),
      asc(pbsBidPairingOccurrence.pairingNumber),
      asc(pbsBidPairingOccurrence.originDate),
    );

  return rows;
};

export const buildOccurrenceListBidFromRows = (
  rows: PairingOccurrenceListRow[],
): OccurrenceListBid | null => {
  if (rows.length === 0) {
    return null;
  }

  return normalizePairingOccurrenceListBid({
    type: "pairing-occurrence-list",
    occurrences: rows.map((row) => ({
      pairingNumber: row.pairingNumber,
      originDate: row.originDate,
      pairingId: row.pairingId,
      ...(row.occurrenceId ? { occurrenceId: row.occurrenceId } : {}),
    })),
  });
};

export const writePairingOccurrencesForProperty = async (
  db: Pick<Database, "delete" | "insert" | "select">,
  property: PbsPairingDraftProperty,
  options: {
    actor: PairingDraftActor;
    bidId: number;
    now: Date;
  },
) => {
  const propertyGroupKey = property.propertyGroupKey;

  if (!propertyGroupKey) {
    return;
  }

  const groupRows = await db
    .select({
      groupId: pbsBidGroup.id,
      tierId: pbsBidGroup.tierId,
      tier: pbsBidTier.tier,
    })
    .from(pbsBidGroup)
    .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
    .where(and(
      eq(pbsBidGroup.bidId, options.bidId),
      eq(pbsBidGroup.bidType, "Pairing"),
      eq(pbsBidGroup.propertyGroupKey, propertyGroupKey),
    ));

  if (groupRows.length === 0) {
    return;
  }

  await db
    .delete(pbsBidPairingOccurrence)
    .where(and(
      eq(pbsBidPairingOccurrence.bidId, options.bidId),
      eq(pbsBidPairingOccurrence.propertyGroupKey, propertyGroupKey),
    ));

  if (!isPairingOccurrenceListBid(property.bid)) {
    return;
  }

  const normalizedBid = normalizePairingOccurrenceListBid(property.bid);
  const values = groupRows.flatMap((group) =>
    normalizedBid.occurrences.map((occurrence) => ({
      bidId: options.bidId,
      groupId: group.groupId,
      propertyGroupKey,
      tierId: group.tierId,
      tier: group.tier,
      pairingNumber: occurrence.pairingNumber,
      originDate: occurrence.originDate,
      pairingId: occurrence.pairingId,
      occurrenceId: occurrence.occurrenceId,
      createdBy: options.actor.userCode,
      updatedBy: options.actor.userCode,
      updatedAt: options.now,
    })),
  );

  if (values.length > 0) {
    await db.insert(pbsBidPairingOccurrence).values(values);
  }
};

export const deletePairingOccurrencesForGroupKeys = async (
  db: Pick<Database, "delete">,
  bidId: number,
  propertyGroupKeys: string[],
) => {
  const normalizedKeys = Array.from(new Set(propertyGroupKeys.map((key) => key.trim()).filter(Boolean)));

  if (normalizedKeys.length === 0) {
    return;
  }

  await db
    .delete(pbsBidPairingOccurrence)
    .where(and(
      eq(pbsBidPairingOccurrence.bidId, bidId),
      inArray(pbsBidPairingOccurrence.propertyGroupKey, normalizedKeys),
    ));
};
