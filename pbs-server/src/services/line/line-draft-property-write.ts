import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type {
  PbsLineDraftDocument,
  PbsLineDraftProperty,
} from "../../../../packages/contracts/pbs-line-bids.js";
import {
  pbsBid,
  pbsBidCondition,
  pbsBidGroup,
  pbsBidTier,
} from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  ensureBidTiers,
  ensureCurrentBidByReference,
  parseTierKey,
  requireLineholderPropertyIdentity,
  syncBidTiers,
  syncBidTiersByBidId,
  type LineholderDraftActor,
  type LineholderPeriodContext,
} from "../lineholder/shared.js";
import { serializeRuleBid } from "../lineholder/rule-bid-value.js";
import type { LinePropertyCatalogContext } from "./line-property-catalog.js";
import {
  LINE_BID_TYPE,
  buildLineDraftPropertyGroupKey,
  mapLineActionToId,
  normalizeLinePropertyGroupKey,
} from "./line-draft-property-helpers.js";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const buildTierArraySql = (tierNumbers: number[]) =>
  sql`array[${sql.join(tierNumbers.map((tierNumber) => sql`${tierNumber}`), sql`, `)}]::integer[]`;

const buildTargetBidPredicate = (bidId: number | null | undefined, periodCode: string) =>
  bidId
    ? sql`${pbsBid.id} = ${bidId}`
    : sql`${pbsBid.periodCode} = ${periodCode}`;

export const insertLineDraftPropertyWithTierSync = async (
  tx: Pick<Transaction, "execute">,
  property: PbsLineDraftProperty,
  propertyIdentityByCode: LinePropertyCatalogContext["propertyIdentityByCode"],
  bidId: number,
  actor: LineholderDraftActor,
  now: Date,
) => {
  const propertyIdentity = requireLineholderPropertyIdentity(
    property.propertyCode,
    propertyIdentityByCode,
    LINE_BID_TYPE,
  );
  const tierNumbers = property.tiers.map((tier) => parseTierKey(tier).number);

  if (tierNumbers.length === 0) {
    throw new LineholderBidServiceError(400, "Line properties require at least one tier.");
  }

  const serializedBid = serializeRuleBid(property.bid);
  const actionId = mapLineActionToId(property.action);
  const tierArray = buildTierArraySql(tierNumbers);
  const propertyGroupKey = normalizeLinePropertyGroupKey(property.propertyGroupKey) || randomUUID();
  const result = await tx.execute<{
    row_seq?: number;
    property_group_key?: string;
    duplicate?: boolean;
  }>(sql`
    with requested_tiers(tier_number) as (
      select distinct unnest(${tierArray})
    ),
    duplicate_property as (
      select ${pbsBidGroup.propertyGroupKey} as property_group_key
      from ${pbsBidGroup}
      inner join ${pbsBidTier}
        on ${pbsBidTier.id} = ${pbsBidGroup.tierId}
      where ${pbsBidGroup.bidId} = ${bidId}
        and ${pbsBidGroup.bidType} = ${LINE_BID_TYPE}
        and ${pbsBidGroup.propertyDefinitionId} = ${propertyIdentity.propertyDefinitionId}
        and ${pbsBidGroup.actionId} is not distinct from ${actionId}
        and ${pbsBidGroup.operator} is not distinct from ${serializedBid.operator}
        and ${pbsBidGroup.paramA} is not distinct from ${serializedBid.paramA}
        and ${pbsBidGroup.paramB} is not distinct from ${serializedBid.paramB}
        and ${pbsBidGroup.paramC} is not distinct from ${serializedBid.paramC}
      group by ${pbsBidGroup.propertyGroupKey}
      having array_agg((${pbsBidTier.tier})::integer order by (${pbsBidTier.tier})::integer) = (
        select array_agg(tier_number order by tier_number)
        from requested_tiers
      )
      limit 1
    ),
    target_seq as (
      select
        case
          when exists (select 1 from duplicate_property) then null::integer
          else (coalesce(max(${pbsBidGroup.groupSeq}), 0) + 1)::integer
        end as row_seq
      from ${pbsBidGroup}
      where ${pbsBidGroup.bidId} = ${bidId}
        and ${pbsBidGroup.bidType} = ${LINE_BID_TYPE}
    ),
    existing_tiers as (
      select
        ${pbsBidTier.id} as id,
        ${pbsBidTier.tier} as tier
      from ${pbsBidTier}
      where ${pbsBidTier.bidId} = ${bidId}
        and exists (select 1 from target_seq where row_seq is not null)
        and ${pbsBidTier.tier} in (select tier_number from requested_tiers)
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
    inserted_tiers as (
      insert into ${pbsBidTier} (
        bid_id, tier, total_groups, is_active, created_by, updated_by, updated_at
      )
      select
        ${bidId},
        requested_tiers.tier_number,
        0,
        1,
        ${actor.userCode},
        ${actor.userCode},
        ${now}
      from requested_tiers
      where exists (select 1 from target_seq where row_seq is not null)
        and not exists (
          select 1
          from existing_tiers
          where existing_tiers.tier = requested_tiers.tier_number
        )
      returning id, tier
    ),
    tier_ids as (
      select activated_existing_tiers.id, activated_existing_tiers.tier
      from activated_existing_tiers
      union all
      select inserted_tiers.id, inserted_tiers.tier
      from inserted_tiers
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
        total_conditions,
        created_by,
        updated_by,
        updated_at
      )
      select
        tier_ids.id,
        ${bidId},
        target_seq.row_seq,
        ${propertyGroupKey},
        ${LINE_BID_TYPE},
        ${actionId},
        ${propertyIdentity.propertyCode},
        ${propertyIdentity.propertyDefinitionId},
        ${serializedBid.operator},
        ${serializedBid.paramA},
        ${serializedBid.paramB},
        ${serializedBid.paramC},
        0,
        ${actor.userCode},
        ${actor.userCode},
        ${now}
      from target_seq
      inner join tier_ids
        on tier_ids.tier in (select tier_number from requested_tiers)
      where target_seq.row_seq is not null
      returning tier_id, property_group_key
    ),
    updated_tiers as (
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
        and ${pbsBidTier.id} in (select tier_id from inserted_groups)
      returning ${pbsBidTier.id}
    ),
    updated_bid as (
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
        and exists (select 1 from inserted_groups)
      returning ${pbsBid.id}
    )
    select
      target_seq.row_seq::integer as row_seq,
      (select property_group_key from inserted_groups limit 1)::varchar as property_group_key,
      exists (select 1 from duplicate_property)::boolean as duplicate
    from target_seq
  `);

  const inserted = result.rows[0];

  if (inserted?.duplicate) {
    throw new LineholderBidServiceError(409, "This line property already exists.");
  }

  if (!inserted?.row_seq || !inserted.property_group_key) {
    throw new LineholderBidServiceError(500, "Unable to add the current line property.");
  }

  return {
    rowSeq: inserted.row_seq,
    propertyGroupKey: inserted.property_group_key,
  };
};

export const replaceLineDraftPropertyWithTierSync = async (
  db: Pick<Database, "execute">,
  property: PbsLineDraftProperty,
  propertyIdentityByCode: LinePropertyCatalogContext["propertyIdentityByCode"],
  options: {
    actor: LineholderDraftActor;
    bidId?: number | null;
    periodCode: string;
    expectedDraftVersion: number;
    propertyGroupKey: string;
    now: Date;
    remarks?: string;
  },
) => {
  const propertyIdentity = requireLineholderPropertyIdentity(
    property.propertyCode,
    propertyIdentityByCode,
    LINE_BID_TYPE,
  );
  const requestedTierNumbers = property.tiers.map((tier) => parseTierKey(tier).number);

  if (requestedTierNumbers.length === 0) {
    throw new LineholderBidServiceError(400, "Line properties require at least one tier.");
  }

  const serializedBid = serializeRuleBid(property.bid);
  const actionId = mapLineActionToId(property.action);
  const tierArray = buildTierArraySql(requestedTierNumbers);
  const remarksUpdate = options.remarks === undefined
    ? sql``
    : sql`, remarks = ${options.remarks}`;
  const result = await db.execute<{
    draft_key?: string;
    bid_id?: number;
    period_id?: number | null;
    period_code?: string;
    draft_version?: number;
    row_seq?: number | null;
  }>(sql`
    with target_bid as (
      select
        ${pbsBid.id} as id
      from ${pbsBid}
      where ${pbsBid.crewId} = ${options.actor.crewId}
        and ${pbsBid.bidContext} = ${CURRENT_BID_CONTEXT}
        and ${pbsBid.draftVersion} = ${options.expectedDraftVersion}
        and ${buildTargetBidPredicate(options.bidId, options.periodCode)}
      for update
    ),
    target_groups as (
      select
        ${pbsBidGroup.id} as id,
        ${pbsBidGroup.tierId} as tier_id,
        ${pbsBidGroup.groupSeq} as group_seq,
        ${pbsBidTier.tier} as tier
      from ${pbsBidGroup}
      inner join ${pbsBidTier}
        on ${pbsBidTier.id} = ${pbsBidGroup.tierId}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${LINE_BID_TYPE}
        and ${pbsBidGroup.propertyGroupKey} = ${options.propertyGroupKey}
    ),
    duplicate_groups as (
      select
        ${pbsBidGroup.id} as id,
        ${pbsBidGroup.tierId} as tier_id,
        ${pbsBidGroup.groupSeq} as group_seq,
        ${pbsBidTier.tier} as tier
      from ${pbsBidGroup}
      inner join ${pbsBidTier}
        on ${pbsBidTier.id} = ${pbsBidGroup.tierId}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${LINE_BID_TYPE}
        and ${pbsBidGroup.propertyGroupKey} <> ${options.propertyGroupKey}
        and ${pbsBidGroup.propertyDefinitionId} = ${propertyIdentity.propertyDefinitionId}
        and ${pbsBidGroup.actionId} is not distinct from ${actionId}
        and ${pbsBidGroup.operator} is not distinct from ${serializedBid.operator}
        and ${pbsBidGroup.paramA} is not distinct from ${serializedBid.paramA}
        and ${pbsBidGroup.paramB} is not distinct from ${serializedBid.paramB}
        and ${pbsBidGroup.paramC} is not distinct from ${serializedBid.paramC}
    ),
    mutation_groups as (
      select target_groups.id, target_groups.tier_id, target_groups.group_seq, target_groups.tier
      from target_groups
      union all
      select duplicate_groups.id, duplicate_groups.tier_id, duplicate_groups.group_seq, duplicate_groups.tier
      from duplicate_groups
    ),
    target_seq as (
      select min(group_seq)::smallint as row_seq
      from mutation_groups
    ),
    requested_tiers(tier_number) as (
      select distinct unnest(${tierArray})
    ),
    removed_conditions as (
      delete from ${pbsBidCondition}
      where ${pbsBidCondition.groupId} in (select id from mutation_groups)
      returning ${pbsBidCondition.id}
    ),
    removed_duplicate_groups as (
      delete from ${pbsBidGroup}
      where ${pbsBidGroup.id} in (select id from duplicate_groups)
      returning ${pbsBidGroup.tierId} as tier_id
    ),
    removed_groups as (
      delete from ${pbsBidGroup}
      where ${pbsBidGroup.id} in (
        select id
        from target_groups
        where tier not in (select tier_number from requested_tiers)
      )
      returning ${pbsBidGroup.tierId} as tier_id
    ),
    existing_tiers as (
      select
        ${pbsBidTier.id} as id,
        ${pbsBidTier.tier} as tier
      from ${pbsBidTier}
      where ${pbsBidTier.bidId} = (select id from target_bid)
        and exists (select 1 from target_seq where row_seq is not null)
        and ${pbsBidTier.tier} in (select tier_number from requested_tiers)
    ),
    activated_existing_tiers as (
      update ${pbsBidTier}
      set
        is_active = 1,
        updated_by = ${options.actor.userCode},
        updated_at = ${options.now}
      where ${pbsBidTier.id} in (select id from existing_tiers)
      returning ${pbsBidTier.id} as id, ${pbsBidTier.tier} as tier
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
        ${options.actor.userCode},
        ${options.actor.userCode},
        ${options.now}
      from target_bid
      cross join target_seq
      cross join requested_tiers
      where target_seq.row_seq is not null
        and not exists (
          select 1
          from existing_tiers
          where existing_tiers.tier = requested_tiers.tier_number
        )
      returning id, tier
    ),
    tier_ids as (
      select activated_existing_tiers.id, activated_existing_tiers.tier
      from activated_existing_tiers
      union all
      select inserted_tiers.id, inserted_tiers.tier
      from inserted_tiers
    ),
    upserted_groups as (
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
        total_conditions,
        created_by,
        updated_by,
        updated_at
      )
      select
        tier_ids.id,
        target_bid.id,
        target_seq.row_seq,
        ${options.propertyGroupKey},
        ${LINE_BID_TYPE},
        ${actionId},
        ${propertyIdentity.propertyCode},
        ${propertyIdentity.propertyDefinitionId},
        ${serializedBid.operator},
        ${serializedBid.paramA},
        ${serializedBid.paramB},
        ${serializedBid.paramC},
        0,
        ${options.actor.userCode},
        ${options.actor.userCode},
        ${options.now}
      from target_bid
      cross join target_seq
      inner join tier_ids
        on tier_ids.tier in (select tier_number from requested_tiers)
      where target_seq.row_seq is not null
      on conflict (bid_id, bid_type, property_group_key, tier_id)
      do update set
        group_seq = excluded.group_seq,
        action_id = excluded.action_id,
        property_id = excluded.property_id,
        property_definition_id = excluded.property_definition_id,
        operator = excluded.operator,
        param_a = excluded.param_a,
        param_b = excluded.param_b,
        param_c = excluded.param_c,
        total_conditions = 0,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
      returning tier_id
    ),
    updated_tiers as (
      update ${pbsBidTier}
      set
        total_groups = coalesce((
          select count(*)::smallint
          from ${pbsBidGroup}
          where ${pbsBidGroup.tierId} = ${pbsBidTier.id}
        ), 0::smallint),
        is_active = 1,
        updated_by = ${options.actor.userCode},
        updated_at = ${options.now}
      where ${pbsBidTier.bidId} = (select id from target_bid)
        and ${pbsBidTier.id} in (
          select tier_id from upserted_groups
          union
          select tier_id from removed_groups
          union
          select tier_id from removed_duplicate_groups
        )
      returning ${pbsBidTier.id}
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
        last_modified_at = ${options.now}
        ${remarksUpdate},
        updated_by = ${options.actor.userCode},
        updated_at = ${options.now}
      where ${pbsBid.id} = (select id from target_bid)
        and exists (select 1 from target_seq where row_seq is not null)
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
      updated_bid.draft_version,
      target_seq.row_seq::integer as row_seq
    from target_seq
    left join updated_bid on true
  `);
  const savedProperty = result.rows[0];

  if (!savedProperty?.draft_key || !savedProperty.bid_id || !savedProperty.row_seq) {
    return null;
  }

  await syncBidTiersByBidId(db, savedProperty.bid_id, options.actor, options.now, {
    pruneEmptyTiers: true,
  });

  return {
    draftKey: savedProperty.draft_key,
    bidId: savedProperty.bid_id,
    periodId: savedProperty.period_id ?? null,
    periodCode: savedProperty.period_code ?? options.periodCode,
    draftVersion: savedProperty.draft_version ?? options.expectedDraftVersion + 1,
  };
};

export const deleteLineDraftPropertyWithTierSync = async (
  db: Pick<Database, "execute">,
  options: {
    actor: LineholderDraftActor;
    bidId?: number | null;
    periodCode: string;
    expectedDraftVersion: number;
    propertyGroupKey: string;
    now: Date;
  },
) => {
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
      where ${pbsBid.crewId} = ${options.actor.crewId}
        and ${pbsBid.bidContext} = ${CURRENT_BID_CONTEXT}
        and ${pbsBid.draftVersion} = ${options.expectedDraftVersion}
        and ${buildTargetBidPredicate(options.bidId, options.periodCode)}
      limit 1
    ),
    target_groups as (
      select
        ${pbsBidGroup.id} as id,
        ${pbsBidGroup.groupSeq} as group_seq,
        ${pbsBidGroup.tierId} as tier_id
      from ${pbsBidGroup}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${LINE_BID_TYPE}
        and ${pbsBidGroup.propertyGroupKey} = ${options.propertyGroupKey}
    ),
    target_signature as (
      select
        ${pbsBidGroup.propertyDefinitionId} as property_definition_id,
        ${pbsBidGroup.actionId} as action_id,
        ${pbsBidGroup.operator} as operator,
        ${pbsBidGroup.paramA} as param_a,
        ${pbsBidGroup.paramB} as param_b,
        ${pbsBidGroup.paramC} as param_c
      from ${pbsBidGroup}
      where ${pbsBidGroup.id} in (select id from target_groups)
      limit 1
    ),
    duplicate_groups as (
      select
        ${pbsBidGroup.id} as id,
        ${pbsBidGroup.groupSeq} as group_seq,
        ${pbsBidGroup.tierId} as tier_id
      from ${pbsBidGroup}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${LINE_BID_TYPE}
        and ${pbsBidGroup.propertyGroupKey} <> ${options.propertyGroupKey}
        and ${pbsBidGroup.propertyDefinitionId} = (select property_definition_id from target_signature)
        and ${pbsBidGroup.actionId} is not distinct from (select action_id from target_signature)
        and ${pbsBidGroup.operator} is not distinct from (select operator from target_signature)
        and ${pbsBidGroup.paramA} is not distinct from (select param_a from target_signature)
        and ${pbsBidGroup.paramB} is not distinct from (select param_b from target_signature)
        and ${pbsBidGroup.paramC} is not distinct from (select param_c from target_signature)
    ),
    mutation_groups as (
      select target_groups.id, target_groups.group_seq, target_groups.tier_id
      from target_groups
      union all
      select duplicate_groups.id, duplicate_groups.group_seq, duplicate_groups.tier_id
      from duplicate_groups
    ),
    target_seq as (
      select min(group_seq)::smallint as group_seq
      from mutation_groups
    ),
    removed_conditions as (
      delete from ${pbsBidCondition}
      where ${pbsBidCondition.groupId} in (select id from mutation_groups)
      returning ${pbsBidCondition.id}
    ),
    removed_groups as (
      delete from ${pbsBidGroup}
      where ${pbsBidGroup.id} in (select id from mutation_groups)
      returning ${pbsBidGroup.tierId} as tier_id
    ),
    shifted_groups as (
      update ${pbsBidGroup}
      set
        group_seq = (group_seq - 1)::smallint,
        updated_by = ${options.actor.userCode},
        updated_at = ${options.now}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${LINE_BID_TYPE}
        and ${pbsBidGroup.groupSeq} > coalesce((select group_seq from target_seq), 32767::smallint)
      returning ${pbsBidGroup.id}
    )
    update ${pbsBid}
    set
      total_tiers = (
        select count(*)::smallint
        from ${pbsBidTier}
        where ${pbsBidTier.bidId} = (select id from target_bid)
      ),
      draft_version = ${pbsBid.draftVersion} + 1,
      last_modified_at = ${options.now},
      status = ${"DRAFT"},
      updated_by = ${options.actor.userCode},
      updated_at = ${options.now}
    where ${pbsBid.id} = (select id from target_bid)
      and exists (select 1 from target_seq where group_seq is not null)
    returning
      ${pbsBid.id}::text as draft_key,
      ${pbsBid.id}::integer as bid_id,
      ${pbsBid.rosterPeriodId}::integer as period_id,
      ${pbsBid.periodCode}::varchar as period_code,
      ${pbsBid.draftVersion}::integer as draft_version
  `);
  const savedDraft = result.rows[0];

  if (!savedDraft) {
    return null;
  }

  await syncBidTiersByBidId(db, savedDraft.bid_id ?? options.bidId ?? 0, options.actor, options.now, {
    pruneEmptyTiers: true,
  });

  return {
    draftKey: savedDraft.draft_key ?? String(options.bidId ?? ""),
    bidId: savedDraft.bid_id ?? options.bidId ?? 0,
    periodId: savedDraft.period_id ?? null,
    periodCode: savedDraft.period_code ?? options.periodCode,
    draftVersion: savedDraft.draft_version ?? options.expectedDraftVersion + 1,
  };
};

type LineDraftWriteContext = {
  actor: LineholderDraftActor;
  period: LineholderPeriodContext;
  catalogContext: LinePropertyCatalogContext;
  normalizedDraft: PbsLineDraftDocument;
  now: Date;
};

export const writeLineDraft = async (
  db: Database,
  {
    actor,
    period,
    catalogContext,
    normalizedDraft,
    now,
  }: LineDraftWriteContext,
) => {
  const { catalogByCode, propertyIdentityByCode } = catalogContext;

  return db.transaction(async (tx) => {
    const nextTargetBid = await ensureCurrentBidByReference(tx, actor, period, normalizedDraft, now, {
      expectedDraftVersion: normalizedDraft.draftVersion,
      remarks: normalizedDraft.remarks,
    });
    const bidId = nextTargetBid.bidId;

    const existingGroups = await tx
      .select({
        id: pbsBidGroup.id,
      })
      .from(pbsBidGroup)
      .where(and(
        eq(pbsBidGroup.bidId, bidId),
        eq(pbsBidGroup.bidType, LINE_BID_TYPE),
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
        eq(pbsBidGroup.bidType, LINE_BID_TYPE),
      ));

    const tierNumbers = Array.from(
      new Set(
        normalizedDraft.properties.flatMap((property) =>
          property.tiers.map((tier) => parseTierKey(tier).number),
        ),
      ),
    ).sort((left, right) => left - right);

    const tierIdByNumber = await ensureBidTiers(tx, bidId, tierNumbers, actor, now);

    const groupValues = normalizedDraft.properties.flatMap((property) => {
      const definition = catalogByCode.get(property.propertyCode);

      if (!definition) {
        return [];
      }

      const propertyIdentity = requireLineholderPropertyIdentity(
        property.propertyCode,
        propertyIdentityByCode,
        LINE_BID_TYPE,
      );
      const serializedBid = serializeRuleBid(property.bid);
      const actionId = mapLineActionToId(property.action);

      return property.tiers.map((tier) => {
        const tierNumber = parseTierKey(tier).number;
        const tierId = tierIdByNumber.get(tierNumber);

        if (!tierId) {
          throw new LineholderBidServiceError(500, `Missing line tier ${tier} during draft save.`);
        }

        return {
          tierId,
          bidId,
          groupSeq: property.rowSeq,
          propertyGroupKey: property.propertyGroupKey ?? buildLineDraftPropertyGroupKey(bidId, property.rowSeq),
          bidType: LINE_BID_TYPE,
          actionId,
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
      });
    });

    if (groupValues.length > 0) {
      await tx.insert(pbsBidGroup).values(groupValues);
    }

    await syncBidTiers(tx, bidId, actor, now);
    return nextTargetBid;
  });
};
