import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type {
  PbsPairingDraftProperty,
  PbsPairingFavoriteProperty,
  PbsPairingPropertyDefinition,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  pbsBidGroup,
  pbsBidPairingConfiguredFavorite,
  pbsBidProperty,
  pbsBidTier,
} from "../../models/index.js";
import { normalizeTiers } from "../lineholder/shared.js";
import { cloneRuleBidValue } from "../lineholder/rule-bid-value.js";
import {
  applyPairingBidPreferenceJson,
  deserializePairingDraftBid,
  mapPairingActionFromId,
  mapPairingQuantifier,
} from "./pairing-bid-normalization.js";
import {
  buildOccurrenceListBidFromRows,
  loadPairingOccurrenceRows,
} from "./pairing-occurrence-list.js";

type Database = ReturnType<typeof drizzle>;

export const loadFavoriteProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
): Promise<PbsPairingFavoriteProperty[]> => {
  const favoriteRows = await db
    .select({
      favoriteKey: sql<string>`${pbsBidPairingConfiguredFavorite.id}::text`,
      propertyId: pbsBidPairingConfiguredFavorite.propertyId,
      propertyCode: pbsBidPairingConfiguredFavorite.propertyCode,
      favoriteName: pbsBidPairingConfiguredFavorite.favoriteName,
      action: pbsBidPairingConfiguredFavorite.action,
      quantifier: pbsBidPairingConfiguredFavorite.quantifier,
      bidPayload: pbsBidPairingConfiguredFavorite.bidPayload,
    })
    .from(pbsBidPairingConfiguredFavorite)
    .where(eq(pbsBidPairingConfiguredFavorite.bidId, bidId))
    .orderBy(asc(pbsBidPairingConfiguredFavorite.propertyCode), asc(pbsBidPairingConfiguredFavorite.id));

  return favoriteRows.flatMap((row) => {
    const definition = catalogByCode.get(row.propertyCode);
    if (!definition) {
      return [];
    }

    return [{
      favoriteKey: row.favoriteKey,
      propertyId: row.propertyId,
      propertyCode: row.propertyCode,
      name: row.favoriteName?.trim() || definition.name,
      action: row.action ?? null,
      quantifier: mapPairingQuantifier(row.quantifier),
      bid: cloneRuleBidValue(row.bidPayload),
    }];
  });
};

export const loadDraftProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
): Promise<PbsPairingDraftProperty[]> => {
  const [groupRows, occurrenceRows] = await Promise.all([
    db
      .select({
        propertyGroupKey: pbsBidGroup.propertyGroupKey,
        groupSeq: pbsBidGroup.groupSeq,
        legacyPropertyCode: pbsBidGroup.legacyPropertyCode,
        propertyCode: pbsBidProperty.propertyCode,
        actionId: pbsBidGroup.actionId,
        operator: pbsBidGroup.operator,
        paramA: pbsBidGroup.paramA,
        paramB: pbsBidGroup.paramB,
        paramC: pbsBidGroup.paramC,
        preferenceJson: pbsBidGroup.preferenceJson,
        tier: pbsBidTier.tier,
      })
      .from(pbsBidGroup)
      .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
      .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
      .where(and(
        eq(pbsBidGroup.bidId, bidId),
        eq(pbsBidGroup.bidType, "Pairing"),
      ))
      .orderBy(asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier)),
    loadPairingOccurrenceRows(db, bidId),
  ]);

  const propertiesByKey = new Map<string, PbsPairingDraftProperty>();
  const occurrenceRowsByKey = new Map<string, typeof occurrenceRows>();

  for (const occurrenceRow of occurrenceRows) {
    const rows = occurrenceRowsByKey.get(occurrenceRow.propertyGroupKey) ?? [];

    rows.push(occurrenceRow);
    occurrenceRowsByKey.set(occurrenceRow.propertyGroupKey, rows);
  }

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
        action: mapPairingActionFromId(row.actionId),
        quantifier: mapPairingQuantifier(row.paramC) ?? definition.defaultQuantifier ?? null,
        bid: applyPairingBidPreferenceJson(
          propertyCode,
          buildOccurrenceListBidFromRows(occurrenceRowsByKey.get(row.propertyGroupKey) ?? [])
            ?? deserializePairingDraftBid(definition, {
              operator: row.operator,
              paramA: row.paramA,
              paramB: row.paramB,
              paramC: row.paramC,
            }),
          row.preferenceJson,
        ),
        tiers: [`T${row.tier}`],
      });

      continue;
    }

    existingProperty.tiers = normalizeTiers([...existingProperty.tiers, `T${row.tier}`]);
  }

  return Array.from(propertiesByKey.values()).sort((left, right) => left.rowSeq - right.rowSeq);
};
