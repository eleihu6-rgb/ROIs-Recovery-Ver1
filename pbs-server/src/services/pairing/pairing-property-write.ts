import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type {
  PbsPairingDraftProperty,
  PbsPairingPropertyDefinition,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  pbsBid,
  pbsBidCondition,
  pbsBidGroup,
  pbsBidTier,
} from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
  parseTierKey,
  requireLineholderPropertyIdentity,
  syncBidTiersByBidId,
  type CurrentDraftReference,
  type LineholderPropertyIdentity,
} from "../lineholder/shared.js";
import { serializeRuleBid } from "../lineholder/rule-bid-value.js";
import type { PairingDraftActor } from "./types.js";
import { PairingBidServiceError } from "./pairing-bid-errors.js";
import {
  buildPairingBidPreferenceJson,
  mapPairingActionToId,
  normalizePropertyGroupKey,
  resolvePairingQuantifier,
} from "./pairing-bid-normalization.js";

type Database = ReturnType<typeof drizzle>;

export const replaceDraftProperty = (
  properties: PbsPairingDraftProperty[],
  nextProperty: PbsPairingDraftProperty,
) =>
  properties.map((property) =>
    property.propertyGroupKey === nextProperty.propertyGroupKey ? nextProperty : property,
  );

export const resolveTierNumbersForProperties = (properties: PbsPairingDraftProperty[]) =>
  Array.from(
    new Set(
      properties.flatMap((property) =>
        property.tiers.map((tier) => parseTierKey(tier).number),
      ),
    ),
  ).sort((left, right) => left - right);

export const buildGroupValuesForProperty = (
  property: PbsPairingDraftProperty,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>,
  tierIdByNumber: Map<number, number>,
  bidId: number,
  actor: PairingDraftActor,
  now: Date,
): (typeof pbsBidGroup.$inferInsert)[] => {
  const definition = catalogByCode.get(property.propertyCode);

  if (!definition) {
    return [];
  }

  const propertyIdentity = requireLineholderPropertyIdentity(
    property.propertyCode,
    propertyIdentityByCode,
    "Pairing",
  );
  const serializedBid = serializeRuleBid(property.bid);
  const preferenceJson = buildPairingBidPreferenceJson(property.propertyCode, property.bid);
  const quantifier = resolvePairingQuantifier(property, definition);
  const propertyGroupKey = normalizePropertyGroupKey(property.propertyGroupKey);

  return property.tiers.map((tier) => {
    const tierNumber = parseTierKey(tier).number;
    const tierId = tierIdByNumber.get(tierNumber);

    if (!tierId) {
      throw new PairingBidServiceError(500, `Missing pairing tier ${tier} during draft save.`);
    }

    return {
      tierId,
      bidId,
      groupSeq: property.rowSeq,
      propertyGroupKey,
      bidType: "Pairing",
      actionId: mapPairingActionToId(property.action),
      legacyPropertyCode: propertyIdentity.propertyCode,
      propertyDefinitionId: propertyIdentity.propertyDefinitionId,
      operator: serializedBid.operator,
      paramA: serializedBid.paramA,
      paramB: serializedBid.paramB,
      paramC: quantifier ?? serializedBid.paramC,
      preferenceJson,
      totalConditions: 0,
      createdBy: actor.userCode,
      updatedBy: actor.userCode,
      updatedAt: now,
    };
  });
};

type PairingPropertyWriteResult = {
  targetBid: {
    draftKey: string;
    bidId: number;
    periodId: number | null;
    periodCode: string;
    draftVersion: number;
  };
  rowSeq: number;
};

const buildTierArraySql = (tierNumbers: number[]) =>
  sql`array[${sql.join(tierNumbers.map((tierNumber) => sql`${tierNumber}`), sql`, `)}]::integer[]`;

export const parsePairingCurrentDraftBidId = (reference: CurrentDraftReference): number | null => {
  if (typeof reference.bidId === "number" && Number.isSafeInteger(reference.bidId) && reference.bidId > 0) {
    return reference.bidId;
  }

  const draftKey = reference.draftKey?.trim();

  if (!draftKey) {
    return null;
  }

  if (!/^[1-9]\d*$/.test(draftKey)) {
    throw new PairingBidServiceError(400, "Invalid current draft key.");
  }

  const bidId = Number.parseInt(draftKey, 10);

  if (!Number.isSafeInteger(bidId)) {
    throw new PairingBidServiceError(400, "Invalid current draft key.");
  }

  return bidId;
};

const buildTargetBidPredicate = (bidId: number | null | undefined, periodCode: string) =>
  bidId
    ? sql`${pbsBid.id} = ${bidId}`
    : sql`${pbsBid.periodCode} = ${periodCode}`;

export const writePairingPropertyWithTierSync = async (
  db: Pick<Database, "execute">,
  property: PbsPairingDraftProperty,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>,
  options: {
    actor: PairingDraftActor;
    bidId?: number | null;
    periodCode: string;
    expectedDraftVersion: number;
    now: Date;
    replacePropertyGroupKey?: string;
    remarks?: string;
  },
): Promise<PairingPropertyWriteResult | null> => {
  const definition = catalogByCode.get(property.propertyCode);

  if (!definition) {
    throw new PairingBidServiceError(400, `Unsupported pairing property code: ${property.propertyCode}`);
  }

  const propertyIdentity = requireLineholderPropertyIdentity(
    property.propertyCode,
    propertyIdentityByCode,
    "Pairing",
  );
  const tierNumbers = property.tiers.map((tier) => parseTierKey(tier).number);

  if (tierNumbers.length === 0) {
    throw new PairingBidServiceError(400, "Pairing properties require at least one tier.");
  }

  const tierArray = buildTierArraySql(tierNumbers);
  const serializedBid = serializeRuleBid(property.bid);
  const preferenceJson = buildPairingBidPreferenceJson(property.propertyCode, property.bid);
  const quantifier = resolvePairingQuantifier(property, definition);
  const replacePropertyGroupKey = options.replacePropertyGroupKey ?? null;
  const remarksUpdate = options.remarks === undefined
    ? sql``
    : sql`, remarks = ${options.remarks}`;
  const result = await db.execute<{
    draft_key?: string;
    bid_id?: number;
    period_id?: number | null;
    period_code?: string;
    draft_version?: number;
    row_seq?: number;
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
      where ${replacePropertyGroupKey}::varchar is not null
        and ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${"Pairing"}
        and ${pbsBidGroup.propertyGroupKey} = ${replacePropertyGroupKey}
    ),
    target_seq as (
      select
        case
          when ${replacePropertyGroupKey}::varchar is null then
            (coalesce(max(${pbsBidGroup.groupSeq}), 0) + 1)::integer
          else
            (select min(group_seq)::integer from target_groups)
        end as row_seq
      from ${pbsBidGroup}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${"Pairing"}
    ),
    requested_tiers(tier_number) as (
      select distinct unnest(${tierArray})
    ),
    removed_conditions as (
      delete from ${pbsBidCondition}
      where ${pbsBidCondition.groupId} in (select id from target_groups)
      returning ${pbsBidCondition.id}
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
        preference_json,
        total_conditions,
        created_by,
        updated_by,
        updated_at
      )
      select
        tier_ids.id,
        target_bid.id,
        target_seq.row_seq,
        ${property.propertyGroupKey},
        ${"Pairing"},
        ${mapPairingActionToId(property.action)},
        ${propertyIdentity.propertyCode},
        ${propertyIdentity.propertyDefinitionId},
        ${serializedBid.operator},
        ${serializedBid.paramA},
        ${serializedBid.paramB},
        ${quantifier ?? serializedBid.paramC},
        ${preferenceJson}::jsonb,
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
        preference_json = excluded.preference_json,
        total_conditions = excluded.total_conditions,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
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
    from updated_bid
    cross join target_seq
  `);
  const savedProperty = result.rows[0];

  if (!savedProperty) {
    return null;
  }

  await syncBidTiersByBidId(db, savedProperty.bid_id ?? options.bidId ?? 0, options.actor, options.now, {
    pruneEmptyTiers: Boolean(options.replacePropertyGroupKey),
  });

  return {
    targetBid: {
      draftKey: savedProperty.draft_key ?? String(options.bidId ?? ""),
      bidId: savedProperty.bid_id ?? options.bidId ?? 0,
      periodId: savedProperty.period_id ?? null,
      periodCode: savedProperty.period_code ?? options.periodCode,
      draftVersion: savedProperty.draft_version ?? options.expectedDraftVersion + 1,
    },
    rowSeq: savedProperty.row_seq ?? property.rowSeq,
  };
};

export const deletePairingPropertyWithTierSync = async (
  db: Pick<Database, "execute">,
  options: {
    actor: PairingDraftActor;
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
      for update
    ),
    target_groups as (
      select
        ${pbsBidGroup.id} as id,
        ${pbsBidGroup.groupSeq} as group_seq
      from ${pbsBidGroup}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${"Pairing"}
        and ${pbsBidGroup.propertyGroupKey} = ${options.propertyGroupKey}
    ),
    target_seq as (
      select min(group_seq)::smallint as group_seq
      from target_groups
    ),
    removed_conditions as (
      delete from ${pbsBidCondition}
      where ${pbsBidCondition.groupId} in (select id from target_groups)
      returning ${pbsBidCondition.id}
    ),
    removed_groups as (
      delete from ${pbsBidGroup}
      where ${pbsBidGroup.id} in (select id from target_groups)
      returning ${pbsBidGroup.tierId} as tier_id
    ),
    shifted_groups as (
      update ${pbsBidGroup}
      set
        group_seq = (group_seq - 1)::smallint,
        updated_by = ${options.actor.userCode},
        updated_at = ${options.now}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${"Pairing"}
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
      status = ${"DRAFT"},
      last_modified_at = ${options.now},
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
