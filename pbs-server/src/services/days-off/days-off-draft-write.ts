import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PbsDaysOffDraftDocument } from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  pbsBid,
  pbsBidCondition,
  pbsBidGroup,
  pbsBidTier,
} from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  syncBidTiersByBidId,
  type LineholderDraftActor,
  type LineholderPropertyIdentity,
} from "../lineholder/shared.js";
import {
  buildStableDaysOffGroupRows,
  parseStableCurrentDraftBidId,
} from "./days-off-persistence-mappers.js";
import { resolveTierNumbersForDaysOffProperties } from "./days-off-property-write.js";

type Database = ReturnType<typeof drizzle>;

const DAYS_OFF_BID_TYPE = "DaysOff";

const buildTierArraySql = (tierNumbers: number[]) =>
  sql`array[${sql.join(tierNumbers.map((tierNumber) => sql`${tierNumber}`), sql`, `)}]::integer[]`;

export const saveStableCurrentDraftWithTierSync = async (
  db: Pick<Database, "execute" | "select">,
  actor: LineholderDraftActor,
  draft: PbsDaysOffDraftDocument,
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>,
  now: Date,
) => {
  const bidId = parseStableCurrentDraftBidId(draft);

  if (bidId === null) {
    throw new LineholderBidServiceError(400, "Current draft key is required.");
  }

  const tierNumbers = resolveTierNumbersForDaysOffProperties(draft.properties);
  const tierArray = buildTierArraySql(tierNumbers);
  const groupRows = buildStableDaysOffGroupRows(draft, propertyIdentityByCode);
  const groupInput = groupRows.length > 0
    ? sql`values ${sql.join(
      groupRows.map((row) => sql`(
        ${row.tierNumber}::integer,
        ${row.groupSeq}::integer,
        ${row.propertyGroupKey}::varchar,
        ${row.propertyCode}::integer,
        ${row.propertyDefinitionId}::bigint,
        ${row.actionId}::integer,
        ${row.operator}::varchar,
        ${row.paramA}::varchar,
        ${row.paramB}::varchar,
        ${row.paramC}::varchar,
        ${row.allOrNothing}::integer,
        ${row.minimumN}::integer,
        ${row.limitN}::integer
      )`),
      sql`, `,
    )}`
    : sql`select
        null::integer,
        null::integer,
        null::varchar,
        null::integer,
        null::bigint,
        null::integer,
        null::varchar,
        null::varchar,
        null::varchar,
        null::varchar,
        null::integer,
        null::integer,
        null::integer
      where false`;
  const result = await db.execute<{
    draft_key?: string;
    bid_id?: number;
    period_id?: number | null;
    period_code?: string;
    draft_version?: number;
  }>(sql`
    with target_bid as (
      select
        ${pbsBid.id} as id
      from ${pbsBid}
      where ${pbsBid.id} = ${bidId}
        and ${pbsBid.crewId} = ${actor.crewId}
        and ${pbsBid.bidContext} = ${CURRENT_BID_CONTEXT}
        and ${pbsBid.draftVersion} = ${draft.draftVersion}
      for update
    ),
    existing_groups as (
      select
        ${pbsBidGroup.id} as id
      from ${pbsBidGroup}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${DAYS_OFF_BID_TYPE}
    ),
    removed_conditions as (
      delete from ${pbsBidCondition}
      where ${pbsBidCondition.groupId} in (select id from existing_groups)
      returning ${pbsBidCondition.id}
    ),
    removed_groups as (
      delete from ${pbsBidGroup}
      where ${pbsBidGroup.id} in (select id from existing_groups)
      returning ${pbsBidGroup.id}
    ),
    requested_tiers(tier_number) as (
      select distinct unnest(${tierArray})
    ),
    existing_tiers as (
      select
        ${pbsBidTier.id} as id,
        ${pbsBidTier.tier} as tier
      from ${pbsBidTier}
      where ${pbsBidTier.bidId} = (select id from target_bid)
        and ${pbsBidTier.tier} in (select tier_number from requested_tiers)
    ),
    inserted_tiers as (
      insert into ${pbsBidTier} (
        bid_id, tier, total_groups, is_active, created_by, updated_by, updated_at
      )
      select
        target_bid.id,
        requested_tiers.tier_number,
        0,
        1,
        ${actor.userCode},
        ${actor.userCode},
        ${now}
      from target_bid
      cross join requested_tiers
      where not exists (
        select 1
        from existing_tiers
        where existing_tiers.tier = requested_tiers.tier_number
      )
      returning id, tier
    ),
    activated_existing_tiers as (
      update ${pbsBidTier}
      set
        is_active = 1,
        updated_by = ${actor.userCode},
        updated_at = ${now}
      where ${pbsBidTier.id} in (select id from existing_tiers)
      returning ${pbsBidTier.id} as id, ${pbsBidTier.tier} as tier
    ),
    tier_ids as (
      select inserted_tiers.id, inserted_tiers.tier
      from inserted_tiers
      union all
      select activated_existing_tiers.id, activated_existing_tiers.tier
      from activated_existing_tiers
    ),
    group_input (
      tier_number,
      group_seq,
      property_group_key,
      property_code,
      property_definition_id,
      action_id,
      operator,
      param_a,
      param_b,
      param_c,
      all_or_nothing,
      minimum_n,
      limit_n
    ) as (
      ${groupInput}
    ),
    inserted_groups as (
      insert into ${pbsBidGroup} (
        tier_id,
        bid_id,
        group_seq,
        property_group_key,
        bid_type,
        action_id,
        property_id,
        property_definition_id,
        operator,
        param_a,
        param_b,
        param_c,
        all_or_nothing,
        minimum_n,
        limit_n,
        total_conditions,
        created_by,
        updated_by,
        updated_at
      )
      select
        tier_ids.id,
        target_bid.id,
        group_input.group_seq,
        group_input.property_group_key,
        ${DAYS_OFF_BID_TYPE},
        group_input.action_id,
        group_input.property_code,
        group_input.property_definition_id,
        group_input.operator,
        group_input.param_a,
        group_input.param_b,
        group_input.param_c,
        group_input.all_or_nothing,
        group_input.minimum_n,
        group_input.limit_n,
        0,
        ${actor.userCode},
        ${actor.userCode},
        ${now}
      from group_input
      inner join tier_ids
        on tier_ids.tier = group_input.tier_number
      cross join target_bid
      returning tier_id
    ),
    updated_bid as (
      update ${pbsBid}
      set
        total_tiers = (
          select count(*)::smallint
          from ${pbsBidTier}
          where ${pbsBidTier.bidId} = (select id from target_bid)
        ),
        draft_version = ${pbsBid.draftVersion} + 1,
        status = ${"DRAFT"},
        remarks = ${draft.remarks?.trim() ?? ""},
        last_modified_at = ${now},
        updated_by = ${actor.userCode},
        updated_at = ${now}
      where ${pbsBid.id} = (select id from target_bid)
      returning
        ${pbsBid.id}::text as draft_key,
        ${pbsBid.id}::integer as bid_id,
        ${pbsBid.rosterPeriodId}::integer as period_id,
        ${pbsBid.periodCode}::varchar as period_code,
        ${pbsBid.draftVersion}::integer as draft_version
    )
    select
      updated_bid.draft_key,
      updated_bid.bid_id,
      updated_bid.period_id,
      updated_bid.period_code,
      updated_bid.draft_version
    from updated_bid
  `);
  const savedDraft = result.rows[0];

  if (!savedDraft) {
    const existingBids = await db
      .select({ id: pbsBid.id })
      .from(pbsBid)
      .where(and(
        eq(pbsBid.id, bidId),
        eq(pbsBid.crewId, actor.crewId),
        eq(pbsBid.bidContext, CURRENT_BID_CONTEXT),
      ))
      .limit(1);

    if (existingBids[0]) {
      throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
    }

    throw new LineholderBidServiceError(404, "Current draft not found.");
  }

  await syncBidTiersByBidId(db, savedDraft.bid_id ?? bidId, actor, now, {
    pruneEmptyTiers: true,
  });

  return {
    draftKey: savedDraft.draft_key ?? String(bidId),
    bidId: savedDraft.bid_id ?? bidId,
    periodId: savedDraft.period_id ?? null,
    periodCode: savedDraft.period_code ?? draft.periodCode,
    draftVersion: savedDraft.draft_version ?? draft.draftVersion + 1,
  };
};
