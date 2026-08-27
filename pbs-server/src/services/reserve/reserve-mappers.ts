import { randomUUID } from "node:crypto";
import type {
  PbsAddReserveCurrentPropertyRequest,
  PbsReserveDraftDocument,
  PbsReserveDraftMutationResponse,
  PbsReserveDraftProperty,
  PbsPatchReserveCurrentPropertyRequest,
  PbsSaveReserveCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  normalizeCurrentDraftVersion,
  normalizeTiers,
  type CurrentBidTarget,
} from "../lineholder/shared.js";
import { cloneRuleBidValue } from "../lineholder/rule-bid-value.js";
import type { ReservePropertyCatalogContext } from "./reserve-property-catalog.js";
import { applyReserveCallTypeOptionsToDraftProperties } from "./reserve-call-type-options.js";
import { validateReserveDraftProperties } from "./reserve-validation.js";

export const RESERVE_BID_TYPE = "Reserve";
const PROPERTY_GROUP_KEY_MAX_LENGTH = 36;

type ReserveDraftPropertyInput = Omit<PbsReserveDraftProperty, "rowSeq"> & {
  rowSeq?: number;
};

export const normalizeReservePropertyGroupKey = (propertyGroupKey?: string | null) => {
  const normalizedKey = propertyGroupKey?.trim() ?? "";

  if (normalizedKey.length === 0 || normalizedKey.length > PROPERTY_GROUP_KEY_MAX_LENGTH) {
    return "";
  }

  return normalizedKey;
};

const resolveUniqueReservePropertyGroupKey = (
  propertyGroupKey: string | undefined,
  usedPropertyGroupKeys: Set<string>,
) => {
  let normalizedKey = normalizeReservePropertyGroupKey(propertyGroupKey);

  while (!normalizedKey || usedPropertyGroupKeys.has(normalizedKey)) {
    normalizedKey = randomUUID();
  }

  usedPropertyGroupKeys.add(normalizedKey);
  return normalizedKey;
};

export const normalizeReserveDraftProperty = (
  property: ReserveDraftPropertyInput,
  rowSeq: number,
  catalogByCode: ReservePropertyCatalogContext["catalogByCode"],
): PbsReserveDraftProperty => {
  const definition = catalogByCode.get(property.propertyCode);

  if (!definition) {
    throw new LineholderBidServiceError(400, `Unsupported reserve property code: ${property.propertyCode}`);
  }

  return {
    propertyGroupKey: normalizeReservePropertyGroupKey(property.propertyGroupKey) || undefined,
    rowSeq,
    propertyCode: property.propertyCode,
    name: definition.name,
    bid: cloneRuleBidValue(property.bid),
    tiers: normalizeTiers(property.tiers),
  };
};

export const normalizeReserveDraftRequest = (
  request: PbsSaveReserveCurrentDraftRequest,
  catalogByCode: ReservePropertyCatalogContext["catalogByCode"],
  allowedCallTypes?: readonly string[],
): PbsReserveDraftDocument => {
  if (request.draft.bidContext !== CURRENT_BID_CONTEXT) {
    throw new LineholderBidServiceError(400, "Only the Current reserve draft context is supported.");
  }

  if (request.draft.mode !== "legacy" && request.draft.mode !== "aa-prefer-off") {
    throw new LineholderBidServiceError(400, "Unsupported Reserve mode.");
  }

  const usedPropertyGroupKeys = new Set<string>();
  const normalizedPropertiesWithoutOptions = request.draft.properties
    .map((property, index) => normalizeReserveDraftProperty(
      property,
      property.rowSeq > 0 ? property.rowSeq : index + 1,
      catalogByCode,
    ))
    .sort((left, right) => left.rowSeq - right.rowSeq)
    .map((property, index) => ({
      ...property,
      propertyGroupKey: resolveUniqueReservePropertyGroupKey(property.propertyGroupKey, usedPropertyGroupKeys),
      rowSeq: index + 1,
    }));
  const normalizedProperties = allowedCallTypes
    ? applyReserveCallTypeOptionsToDraftProperties(normalizedPropertiesWithoutOptions, allowedCallTypes)
    : normalizedPropertiesWithoutOptions;

  validateReserveDraftProperties(normalizedProperties, { allowedCallTypes });

  return {
    draftKey: request.draft.draftKey,
    bidId: request.draft.bidId,
    periodId: request.draft.periodId,
    draftVersion: normalizeCurrentDraftVersion(request.draft.draftVersion),
    periodCode: request.draft.periodCode.trim(),
    bidContext: CURRENT_BID_CONTEXT,
    mode: request.draft.mode,
    remarks: request.draft.remarks?.trim() ?? "",
    properties: normalizedProperties,
  };
};

export const normalizeReserveAddPropertyRequest = (
  request: PbsAddReserveCurrentPropertyRequest,
  catalogByCode: ReservePropertyCatalogContext["catalogByCode"],
  allowedCallTypes?: readonly string[],
) => {
  if (request.bidContext !== CURRENT_BID_CONTEXT) {
    throw new LineholderBidServiceError(400, "Only the Current reserve draft context is supported.");
  }

  const normalizedProperty = normalizeReserveDraftProperty(request.property, 1, catalogByCode);
  const property = allowedCallTypes
    ? applyReserveCallTypeOptionsToDraftProperties([normalizedProperty], allowedCallTypes)[0] ?? normalizedProperty
    : normalizedProperty;
  validateReserveDraftProperties([property], { allowedCallTypes });

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    periodCode: request.periodCode?.trim(),
    bidContext: CURRENT_BID_CONTEXT,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    remarks: request.remarks?.trim() ?? "",
    property,
  };
};

export const normalizeReservePatchPropertyRequest = (
  request: PbsPatchReserveCurrentPropertyRequest,
  catalogByCode: ReservePropertyCatalogContext["catalogByCode"],
  allowedCallTypes?: readonly string[],
) => normalizeReserveAddPropertyRequest(request, catalogByCode, allowedCallTypes);

type ReserveDraftMutationDetails = Partial<
  Pick<PbsReserveDraftMutationResponse, "draftKey" | "bidId" | "periodId" | "periodCode" | "draftVersion">
>;

export const savedReserveMutationResponse = (
  details: ReserveDraftMutationDetails = {},
): PbsReserveDraftMutationResponse => ({
  saved: true,
  draftKey: details.draftKey,
  bidId: details.bidId,
  periodId: details.periodId,
  periodCode: details.periodCode,
  draftVersion: details.draftVersion,
});

export const savedReserveDraftMutationResponse = (targetBid: CurrentBidTarget): PbsReserveDraftMutationResponse =>
  savedReserveMutationResponse({
    draftKey: targetBid.draftKey,
    bidId: targetBid.bidId,
    periodId: targetBid.periodId,
    periodCode: targetBid.periodCode,
    draftVersion: targetBid.draftVersion,
  });
