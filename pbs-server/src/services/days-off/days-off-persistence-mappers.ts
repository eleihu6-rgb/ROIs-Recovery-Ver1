import { randomUUID } from "node:crypto";
import type {
  PbsDaysOffDraftDocument,
  PbsDaysOffDraftProperty,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  serializeRuleBid,
} from "../lineholder/rule-bid-value.js";
import {
  LineholderBidServiceError,
  parseCurrentDraftBidId,
  parseTierKey,
  requireLineholderPropertyIdentity,
  type LineholderDraftActor,
  type LineholderPropertyIdentity,
} from "../lineholder/shared.js";
import { mapDaysOffActionToId, type NormalizedDaysOffDraftProperty } from "./days-off-draft-mappers.js";

const DAYS_OFF_BID_TYPE = "DaysOff";
const PREFER_OFF_PROPERTY_CODE = 201;
const LONG_STRETCH_OFF_PROPERTY_CODE = 204;

const buildQuantityFieldsForProperty = (
  property: Pick<PbsDaysOffDraftProperty, "propertyCode" | "allOrNothing" | "minimumN" | "maximumN">,
) => property.propertyCode === PREFER_OFF_PROPERTY_CODE
  ? {
      allOrNothing: 1,
      minimumN: null,
      limitN: null,
    }
  : {
      allOrNothing: property.allOrNothing ? 1 : 0,
      minimumN: property.minimumN ?? null,
      limitN: property.maximumN ?? null,
    };

const buildActionIdForProperty = (
  property: Pick<PbsDaysOffDraftProperty, "propertyCode" | "action">,
) => property.propertyCode === LONG_STRETCH_OFF_PROPERTY_CODE
  ? 1
  : mapDaysOffActionToId(property.action);

export const parseStableCurrentDraftBidId = parseCurrentDraftBidId;

export const buildDaysOffGroupValuesForProperty = (
  property: NormalizedDaysOffDraftProperty,
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>,
  tierIdByNumber: Map<number, number>,
  bidId: number,
  actor: LineholderDraftActor,
  now: Date,
) => {
  const propertyIdentity = requireLineholderPropertyIdentity(
    property.propertyCode,
    propertyIdentityByCode,
    DAYS_OFF_BID_TYPE,
  );
  const serializedBid = serializeRuleBid(property.bid);

  return property.tiers.map((tier) => {
    const tierNumber = parseTierKey(tier).number;
    const tierId = tierIdByNumber.get(tierNumber);

    if (!tierId) {
      throw new LineholderBidServiceError(500, `Missing days off tier ${tier} during draft save.`);
    }
    const quantityFields = buildQuantityFieldsForProperty(property);

    return {
      tierId,
      bidId,
      groupSeq: property.rowSeq,
      propertyGroupKey: property.propertyGroupKey,
      bidType: DAYS_OFF_BID_TYPE,
      actionId: buildActionIdForProperty(property),
      legacyPropertyCode: propertyIdentity.propertyCode,
      propertyDefinitionId: propertyIdentity.propertyDefinitionId,
      operator: serializedBid.operator,
      paramA: serializedBid.paramA,
      paramB: serializedBid.paramB,
      paramC: serializedBid.paramC,
      allOrNothing: quantityFields.allOrNothing,
      minimumN: quantityFields.minimumN,
      limitN: quantityFields.limitN,
      totalConditions: 0,
      createdBy: actor.userCode,
      updatedBy: actor.userCode,
      updatedAt: now,
    };
  });
};

export type StableDaysOffGroupRow = {
  tierNumber: number;
  groupSeq: number;
  propertyGroupKey: string;
  propertyCode: number;
  propertyDefinitionId: number;
  actionId: number | null;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
  allOrNothing: number;
  minimumN: number | null;
  limitN: number | null;
};

const buildStableDaysOffGroupRowsForProperty = (
  property: PbsDaysOffDraftProperty,
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>,
): StableDaysOffGroupRow[] => {
  const propertyIdentity = requireLineholderPropertyIdentity(
    property.propertyCode,
    propertyIdentityByCode,
    DAYS_OFF_BID_TYPE,
  );
  const serializedBid = serializeRuleBid(property.bid);

  return property.tiers.map((tier) => {
    const quantityFields = buildQuantityFieldsForProperty(property);

    return {
      tierNumber: parseTierKey(tier).number,
      groupSeq: property.rowSeq,
      propertyGroupKey: property.propertyGroupKey ?? randomUUID(),
      propertyCode: propertyIdentity.propertyCode,
      propertyDefinitionId: propertyIdentity.propertyDefinitionId,
      actionId: buildActionIdForProperty(property),
      operator: serializedBid.operator,
      paramA: serializedBid.paramA,
      paramB: serializedBid.paramB,
      paramC: serializedBid.paramC,
      allOrNothing: quantityFields.allOrNothing,
      minimumN: quantityFields.minimumN,
      limitN: quantityFields.limitN,
    };
  });
};

export const buildStableDaysOffGroupRows = (
  draft: Pick<PbsDaysOffDraftDocument, "properties">,
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>,
): StableDaysOffGroupRow[] =>
  draft.properties.flatMap((property) =>
    buildStableDaysOffGroupRowsForProperty(property, propertyIdentityByCode),
  );
