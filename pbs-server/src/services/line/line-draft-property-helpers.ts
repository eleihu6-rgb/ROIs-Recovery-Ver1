import { randomUUID } from "node:crypto";
import {
  type PbsAddLineCurrentPropertyRequest,
  type PbsLineBidAction,
  type PbsLineDraftDocument,
  type PbsLineDraftMutationResponse,
  type PbsLineDraftProperty,
  type PbsPatchLineCurrentPropertyRequest,
  type PbsSaveLineConfiguredFavoritePropertyRequest,
  type PbsSaveLineCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-line-bids.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  normalizeCurrentDraftVersion,
  normalizeTiers,
  type CurrentBidTarget,
} from "../lineholder/shared.js";
import { cloneRuleBidValue } from "../lineholder/rule-bid-value.js";
import type { LinePropertyCatalogContext } from "./line-property-catalog.js";
import { validateLineDraftProperties } from "./line-validation.js";

export const LINE_BID_TYPE = "Line";

const PROPERTY_GROUP_KEY_MAX_LENGTH = 36;

export const mapLineActionToId = (action?: PbsLineBidAction | null) => {
  if (action === "award") {
    return 1;
  }

  if (action === "avoid") {
    return 2;
  }

  return null;
};

export const mapLineActionFromId = (actionId: number | null): PbsLineBidAction | null => {
  if (actionId === 1) {
    return "award";
  }

  if (actionId === 2) {
    return "avoid";
  }

  return null;
};

type LineDraftPropertyInput = Omit<PbsLineDraftProperty, "rowSeq"> & {
  rowSeq?: number;
};

export const normalizeLinePropertyGroupKey = (propertyGroupKey?: string | null) => {
  const normalizedKey = propertyGroupKey?.trim() ?? "";

  if (normalizedKey.length === 0) {
    return "";
  }

  if (normalizedKey.length > PROPERTY_GROUP_KEY_MAX_LENGTH) {
    return "";
  }

  return normalizedKey;
};

export const resolveUniqueLinePropertyGroupKey = (
  propertyGroupKey: string | undefined,
  usedPropertyGroupKeys: Set<string>,
) => {
  let normalizedKey = normalizeLinePropertyGroupKey(propertyGroupKey);

  while (!normalizedKey || usedPropertyGroupKeys.has(normalizedKey)) {
    normalizedKey = randomUUID();
  }

  usedPropertyGroupKeys.add(normalizedKey);
  return normalizedKey;
};

export const normalizeLineDraftProperty = (
  property: LineDraftPropertyInput,
  rowSeq: number,
  catalogByCode: LinePropertyCatalogContext["catalogByCode"],
): PbsLineDraftProperty => {
  const definition = catalogByCode.get(property.propertyCode);

  if (!definition) {
    throw new LineholderBidServiceError(400, `Unsupported line property code: ${property.propertyCode}`);
  }

  const normalizedProperty = {
    propertyGroupKey: normalizeLinePropertyGroupKey(property.propertyGroupKey) || undefined,
    rowSeq,
    propertyCode: property.propertyCode,
    name: definition.name,
    action: property.action ?? null,
    bid: cloneRuleBidValue(property.bid),
    tiers: normalizeTiers(property.tiers),
  };

  if (
    normalizedProperty.action
    && definition.supportedActions
    && !definition.supportedActions.includes(normalizedProperty.action)
  ) {
    throw new LineholderBidServiceError(400, `${definition.name} does not support ${normalizedProperty.action}.`);
  }

  return normalizedProperty;
};

export const normalizeLineDraftRequest = (
  request: PbsSaveLineCurrentDraftRequest,
  catalogByCode: LinePropertyCatalogContext["catalogByCode"],
): PbsLineDraftDocument => {
  if (request.draft.bidContext !== CURRENT_BID_CONTEXT) {
    throw new LineholderBidServiceError(400, "Only the Current line draft context is supported.");
  }

  const usedPropertyGroupKeys = new Set<string>();
  const normalizedProperties = request.draft.properties
    .map((property, index) => normalizeLineDraftProperty(
      property,
      property.rowSeq > 0 ? property.rowSeq : index + 1,
      catalogByCode,
    ))
    .sort((left, right) => left.rowSeq - right.rowSeq)
    .map((property, index) => ({
      ...property,
      propertyGroupKey: resolveUniqueLinePropertyGroupKey(property.propertyGroupKey, usedPropertyGroupKeys),
      rowSeq: index + 1,
    }));

  validateLineDraftProperties(normalizedProperties);

  return {
    draftKey: request.draft.draftKey,
    bidId: request.draft.bidId,
    periodId: request.draft.periodId,
    draftVersion: normalizeCurrentDraftVersion(request.draft.draftVersion),
    periodCode: request.draft.periodCode.trim(),
    bidContext: CURRENT_BID_CONTEXT,
    remarks: request.draft.remarks?.trim() ?? "",
    properties: normalizedProperties,
  };
};

export const normalizeLineAddPropertyRequest = (
  request: PbsAddLineCurrentPropertyRequest,
  catalogByCode: LinePropertyCatalogContext["catalogByCode"],
) => {
  if (request.bidContext !== CURRENT_BID_CONTEXT) {
    throw new LineholderBidServiceError(400, "Only the Current line draft context is supported.");
  }

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    periodCode: request.periodCode?.trim(),
    bidContext: CURRENT_BID_CONTEXT,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    remarks: request.remarks?.trim() ?? "",
    property: normalizeLineDraftProperty(request.property, 1, catalogByCode),
  };
};

export const normalizeLinePatchPropertyRequest = (
  request: PbsPatchLineCurrentPropertyRequest,
  catalogByCode: LinePropertyCatalogContext["catalogByCode"],
) => {
  if (request.bidContext !== CURRENT_BID_CONTEXT) {
    throw new LineholderBidServiceError(400, "Only the Current line draft context is supported.");
  }

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    periodCode: request.periodCode?.trim(),
    bidContext: CURRENT_BID_CONTEXT,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    remarks: request.remarks?.trim() ?? "",
    property: normalizeLineDraftProperty(request.property, 1, catalogByCode),
  };
};

export const normalizeLineConfiguredFavoriteRequest = (
  request: PbsSaveLineConfiguredFavoritePropertyRequest,
  catalogByCode: LinePropertyCatalogContext["catalogByCode"],
) => {
  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    periodCode: request.periodCode?.trim(),
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    property: normalizeLineDraftProperty({
      ...request.property,
      tiers: ["T1"],
    }, 1, catalogByCode),
  };
};

type LineDraftMutationDetails = Partial<
  Pick<PbsLineDraftMutationResponse, "draftKey" | "bidId" | "periodId" | "periodCode" | "draftVersion">
>;

export const savedLineMutationResponse = (
  details: LineDraftMutationDetails = {},
): PbsLineDraftMutationResponse => ({
  saved: true,
  draftKey: details.draftKey,
  bidId: details.bidId,
  periodId: details.periodId,
  periodCode: details.periodCode,
  draftVersion: details.draftVersion,
});

export const savedLineDraftMutationResponse = (targetBid: CurrentBidTarget): PbsLineDraftMutationResponse =>
  savedLineMutationResponse({
    draftKey: targetBid.draftKey,
    bidId: targetBid.bidId,
    periodId: targetBid.periodId,
    periodCode: targetBid.periodCode,
    draftVersion: targetBid.draftVersion,
  });

export const buildLineDraftPropertyGroupKey = (bidId: number, rowSeq: number) => `${bidId}-Line-${rowSeq}`;

const buildLineDraftPropertySignature = (property: PbsLineDraftProperty) => JSON.stringify({
  propertyCode: property.propertyCode,
  bid: property.bid,
  tiers: normalizeTiers(property.tiers),
});

export const buildLineDraftPropertyMergeSignature = (property: PbsLineDraftProperty) => JSON.stringify({
  propertyCode: property.propertyCode,
  bid: property.bid,
});

export const hasDuplicateLineDraftProperties = (properties: PbsLineDraftProperty[]) => {
  const signatures = new Set<string>();

  for (const property of properties) {
    const signature = buildLineDraftPropertySignature(property);

    if (signatures.has(signature)) {
      return true;
    }

    signatures.add(signature);
  }

  return false;
};

const mergeLineDraftPropertyTiers = (
  target: PbsLineDraftProperty,
  source: PbsLineDraftProperty,
): PbsLineDraftProperty => ({
  ...target,
  tiers: normalizeTiers([...target.tiers, ...source.tiers]),
});

export const findLineDraftPropertyTierMerge = (
  existingProperties: PbsLineDraftProperty[],
  candidate: PbsLineDraftProperty,
) => {
  const mergeSignature = buildLineDraftPropertyMergeSignature(candidate);
  const matchingProperties = existingProperties.filter((property) =>
    buildLineDraftPropertyMergeSignature(property) === mergeSignature);

  if (matchingProperties.length === 0) {
    return null;
  }

  const targetProperty = matchingProperties[0];
  const mergedExistingProperty = matchingProperties
    .slice(1)
    .reduce(mergeLineDraftPropertyTiers, targetProperty);
  const mergedProperty = mergeLineDraftPropertyTiers(mergedExistingProperty, candidate);

  return {
    targetProperty,
    mergedProperty,
    hasNewTier: normalizeTiers(mergedProperty.tiers).length > normalizeTiers(mergedExistingProperty.tiers).length,
  };
};
