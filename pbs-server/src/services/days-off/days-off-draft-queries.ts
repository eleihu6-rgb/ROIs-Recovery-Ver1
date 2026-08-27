import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  pbsDaysOffAaPropertyCodeList,
  type PbsDaysOffDraftProperty,
  type PbsDaysOffFavoriteProperty,
  type PbsDaysOffPropertyDefinition,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  pbsBid,
  pbsBidDaysOffFavorite,
  pbsBidGroup,
  pbsBidProperty,
  pbsBidTier,
  pbsUser,
} from "../../models/index.js";
import { cloneRuleBidValue, deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  normalizeTiers,
  type LineholderDraftActor,
} from "../lineholder/shared.js";
import {
  buildDaysOffDraftPropertiesFromSnapshotRows,
  mapDaysOffActionFromId,
  type AddPropertyDraftSnapshotRow,
} from "./days-off-draft-mappers.js";

type Database = ReturnType<typeof drizzle>;

const DAYS_OFF_BID_TYPE = "DaysOff";
const LIGHTWEIGHT_ADD_VALIDATION_CODES = pbsDaysOffAaPropertyCodeList;
type DaysOffPropertyWithBid = { bid: PbsDaysOffDraftProperty["bid"] };

const getEmployeeSchedulePreferenceCrewId = (property: DaysOffPropertyWithBid) => {
  if (property.bid.type !== "employee-schedule-preference") {
    return "";
  }

  return property.bid.crewId ?? (property.bid as { employeeNumber?: string }).employeeNumber ?? "";
};

const enrichEmployeeSchedulePreferenceCrewNames = async <TProperty extends DaysOffPropertyWithBid>(
  db: Pick<Database, "select">,
  properties: TProperty[],
): Promise<TProperty[]> => {
  const crewIds = Array.from(new Set(
    properties
      .map((property) => getEmployeeSchedulePreferenceCrewId(property).trim())
      .filter((crewId) => crewId.length > 0),
  ));

  if (crewIds.length === 0) {
    return properties;
  }

  const rows = await db
    .select({
      crewId: pbsUser.crewId,
      userName: pbsUser.userName,
    })
    .from(pbsUser)
    .where(inArray(pbsUser.crewId, crewIds));
  const userNameByCrewId = new Map(
    rows.map((row) => [row.crewId.trim(), row.userName.trim()]),
  );

  return properties.map((property) => {
    if (property.bid.type !== "employee-schedule-preference") {
      return property;
    }

    const crewId = getEmployeeSchedulePreferenceCrewId(property).trim();
    const crewName = userNameByCrewId.get(crewId);

    if (!crewName) {
      return property;
    }

    return {
      ...property,
      bid: {
        ...property.bid,
        crewId,
        crewName,
      },
    };
  });
};

export const loadDaysOffDraftProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: Map<number, PbsDaysOffPropertyDefinition>,
): Promise<PbsDaysOffDraftProperty[]> => {
  const groupRows = await db
    .select({
      groupSeq: pbsBidGroup.groupSeq,
      propertyGroupKey: pbsBidGroup.propertyGroupKey,
      legacyPropertyCode: pbsBidGroup.legacyPropertyCode,
      propertyCode: pbsBidProperty.propertyCode,
      actionId: pbsBidGroup.actionId,
      operator: pbsBidGroup.operator,
      paramA: pbsBidGroup.paramA,
      paramB: pbsBidGroup.paramB,
      paramC: pbsBidGroup.paramC,
      allOrNothing: pbsBidGroup.allOrNothing,
      minimumN: pbsBidGroup.minimumN,
      maximumN: pbsBidGroup.limitN,
      tier: pbsBidTier.tier,
    })
    .from(pbsBidGroup)
    .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
    .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
    .where(and(
      eq(pbsBidGroup.bidId, bidId),
      eq(pbsBidGroup.bidType, DAYS_OFF_BID_TYPE),
    ))
    .orderBy(asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier));

  const propertiesByKey = new Map<string, PbsDaysOffDraftProperty>();

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
        action: mapDaysOffActionFromId(propertyCode, row.actionId),
        bid: deserializeRuleBid(definition, {
          operator: row.operator,
          paramA: row.paramA,
          paramB: row.paramB,
          paramC: row.paramC,
        }),
        tiers: [`T${row.tier}`],
        allOrNothing: row.allOrNothing === 1,
        minimumN: row.minimumN ?? null,
        maximumN: row.maximumN ?? null,
      });

      continue;
    }

    existingProperty.tiers = normalizeTiers([...existingProperty.tiers, `T${row.tier}`]);
  }

  return enrichEmployeeSchedulePreferenceCrewNames(
    db,
    Array.from(propertiesByKey.values()).sort((left, right) => left.rowSeq - right.rowSeq),
  );
};

export const loadStableCurrentBidAddValidationProperties = async (
  db: Pick<Database, "execute" | "select">,
  actor: LineholderDraftActor,
  bidId: number,
  catalogByCode: Map<number, PbsDaysOffPropertyDefinition>,
): Promise<PbsDaysOffDraftProperty[]> => {
  const validationCodeArray = sql`array[${
    sql.join(LIGHTWEIGHT_ADD_VALIDATION_CODES.map((propertyCode) => sql`${propertyCode}`), sql`, `)
  }]::integer[]`;
  const rows = await db.execute<AddPropertyDraftSnapshotRow>(sql`
    with target_bid as (
      select
        ${pbsBid.id} as id
      from ${pbsBid}
      where ${pbsBid.id} = ${bidId}
        and ${pbsBid.crewId} = ${actor.crewId}
        and ${pbsBid.bidContext} = ${CURRENT_BID_CONTEXT}
      limit 1
    ),
    days_off_groups as (
      select
        ${pbsBidGroup.propertyGroupKey} as property_group_key,
        ${pbsBidGroup.groupSeq} as group_seq,
        ${pbsBidGroup.legacyPropertyCode} as property_code,
        ${pbsBidGroup.actionId} as action_id,
        ${pbsBidGroup.operator} as operator,
        ${pbsBidGroup.paramA} as param_a,
        ${pbsBidGroup.paramB} as param_b,
        ${pbsBidGroup.paramC} as param_c,
        ${pbsBidGroup.allOrNothing} as all_or_nothing,
        ${pbsBidGroup.minimumN} as minimum_n,
        ${pbsBidGroup.limitN} as limit_n,
        ${pbsBidTier.tier} as tier
      from ${pbsBidGroup}
      inner join ${pbsBidTier}
        on ${pbsBidGroup.tierId} = ${pbsBidTier.id}
      where ${pbsBidGroup.bidId} = (select id from target_bid)
        and ${pbsBidGroup.bidType} = ${DAYS_OFF_BID_TYPE}
    )
    select
      target_bid.id::integer as bid_id,
      days_off_groups.property_group_key::varchar as property_group_key,
      days_off_groups.group_seq::integer as group_seq,
      days_off_groups.property_code::integer as property_code,
      days_off_groups.action_id::integer as action_id,
      days_off_groups.operator::varchar as operator,
      days_off_groups.param_a::varchar as param_a,
      days_off_groups.param_b::varchar as param_b,
      days_off_groups.param_c::varchar as param_c,
      days_off_groups.all_or_nothing::integer as all_or_nothing,
      days_off_groups.minimum_n::integer as minimum_n,
      days_off_groups.tier::integer as tier
    from target_bid
    left join days_off_groups
      on days_off_groups.property_code = any(${validationCodeArray})
    order by days_off_groups.group_seq, days_off_groups.tier
  `);

  if (!rows.rows[0]) {
    throw new LineholderBidServiceError(404, "Current draft not found.");
  }

  return buildDaysOffDraftPropertiesFromSnapshotRows(rows.rows, catalogByCode);
};

export const loadDaysOffFavoriteProperties = async (
  db: Pick<Database, "select">,
  bidId: number,
  catalogByCode: Map<number, PbsDaysOffPropertyDefinition>,
): Promise<PbsDaysOffFavoriteProperty[]> => {
  const rows = await db
    .select({
      favoriteKey: sql<string>`${pbsBidDaysOffFavorite.id}::text`,
      propertyId: pbsBidDaysOffFavorite.propertyId,
      propertyCode: pbsBidDaysOffFavorite.propertyCode,
      favoriteName: pbsBidDaysOffFavorite.favoriteName,
      action: pbsBidDaysOffFavorite.action,
      bidPayload: pbsBidDaysOffFavorite.bidPayload,
      allOrNothing: pbsBidDaysOffFavorite.allOrNothing,
      minimumN: pbsBidDaysOffFavorite.minimumN,
      maximumN: pbsBidDaysOffFavorite.maximumN,
    })
    .from(pbsBidDaysOffFavorite)
    .where(eq(pbsBidDaysOffFavorite.bidId, bidId))
    .orderBy(asc(pbsBidDaysOffFavorite.propertyCode), asc(pbsBidDaysOffFavorite.id));

  const favoriteProperties = rows.flatMap((row) => {
    const definition = catalogByCode.get(row.propertyCode);

    if (!definition) {
      return [];
    }

    return [{
      favoriteKey: row.favoriteKey,
      propertyId: row.propertyId,
      propertyCode: row.propertyCode,
      name: row.favoriteName?.trim() || definition.name,
      action: mapDaysOffActionFromId(row.propertyCode, row.action === "avoid" ? 2 : row.action === "award" ? 1 : null),
      bid: cloneRuleBidValue(row.bidPayload),
      allOrNothing: row.allOrNothing === 1,
      minimumN: row.minimumN ?? null,
      maximumN: row.maximumN ?? null,
    }];
  });

  return enrichEmployeeSchedulePreferenceCrewNames(db, favoriteProperties);
};
