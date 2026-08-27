import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  pbsBid,
  pbsBidGroup,
  pbsBidTier,
} from "../../models/index.js";
import type { LineholderDraftActor } from "./shared-types.js";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const ensureBidTiers = async (
  tx: Transaction,
  bidId: number,
  tierNumbers: number[],
  actor: LineholderDraftActor,
  now: Date,
) => {
  const existingTiers = await tx
    .select({
      id: pbsBidTier.id,
      tier: pbsBidTier.tier,
    })
    .from(pbsBidTier)
    .where(eq(pbsBidTier.bidId, bidId));

  const tierIdByNumber = new Map(existingTiers.map((tier) => [tier.tier, tier.id]));
  const missingTierNumbers = tierNumbers.filter((tierNumber) => !tierIdByNumber.has(tierNumber));

  if (missingTierNumbers.length > 0) {
    const insertedTiers = await tx
      .insert(pbsBidTier)
      .values(
        missingTierNumbers.map((tierNumber) => ({
          bidId,
          tier: tierNumber,
          totalGroups: 0,
          isActive: 1,
          createdBy: actor.userCode,
          updatedBy: actor.userCode,
          updatedAt: now,
        })),
      )
      .returning({
        id: pbsBidTier.id,
        tier: pbsBidTier.tier,
      });

    for (const tier of insertedTiers) {
      tierIdByNumber.set(tier.tier, tier.id);
    }
  }

  return tierIdByNumber;
};

export const syncBidTiers = async (
  tx: Transaction,
  bidId: number,
  actor: LineholderDraftActor,
  now: Date,
) => {
  await tx
    .delete(pbsBidTier)
    .where(and(
      eq(pbsBidTier.bidId, bidId),
      sql`not exists (
        select 1
        from ${pbsBidGroup}
        where ${pbsBidGroup.tierId} = ${pbsBidTier.id}
      )`,
    ));

  await tx
    .update(pbsBidTier)
    .set({
      totalGroups: sql`coalesce((
        select count(*)::smallint
        from ${pbsBidGroup}
        where ${pbsBidGroup.tierId} = ${pbsBidTier.id}
      ), 0::smallint)`,
      isActive: 1,
      updatedBy: actor.userCode,
      updatedAt: now,
    })
    .where(eq(pbsBidTier.bidId, bidId));

  await tx
    .update(pbsBid)
    .set({
      totalTiers: sql`(
        select count(*)::smallint
        from ${pbsBidTier}
        where ${pbsBidTier.bidId} = ${bidId}
      )`,
      lastModifiedAt: now,
      updatedBy: actor.userCode,
      updatedAt: now,
    })
    .where(eq(pbsBid.id, bidId));
};

export const syncBidTiersByBidId = async (
  db: Pick<Database, "execute">,
  bidId: number,
  actor: LineholderDraftActor,
  now: Date,
  options: { pruneEmptyTiers?: boolean } = {},
) => {
  if (options.pruneEmptyTiers) {
    await db.execute(sql`
      delete from ${pbsBidTier}
      where ${pbsBidTier.bidId} = ${bidId}
        and not exists (
          select 1
          from ${pbsBidGroup}
          where ${pbsBidGroup.tierId} = ${pbsBidTier.id}
        )
    `);
  }

  await db.execute(sql`
    with updated_tiers as (
      update ${pbsBidTier}
      set
        total_groups = coalesce((
          select count(*)::smallint
          from ${pbsBidGroup}
          where ${pbsBidGroup.tierId} = ${pbsBidTier.id}
        ), 0::smallint),
        is_active = 1,
        updated_by = ${actor.userCode},
        updated_at = ${now}
      where ${pbsBidTier.bidId} = ${bidId}
      returning ${pbsBidTier.id}
    )
    update ${pbsBid}
    set
      total_tiers = (
        select count(*)::smallint
        from ${pbsBidTier}
        where ${pbsBidTier.bidId} = ${bidId}
      ),
      last_modified_at = ${now},
      updated_by = ${actor.userCode},
      updated_at = ${now}
    where ${pbsBid.id} = ${bidId}
  `);
};
