import { randomUUID } from "node:crypto";
import type {
  PbsAddDaysOffCurrentPropertyRequest,
  PbsDaysOffDraftDocument,
  PbsDaysOffDraftProperty,
  PbsDaysOffPropertyDefinition,
  PbsLegacyDaysOffCurrentPropertyMutationRequest,
  PbsPatchDaysOffCurrentPropertyRequest,
  PbsSaveDaysOffCurrentDraftRequest,
  PbsSaveDaysOffFavoritePropertyRequest,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  cloneRuleBidValue,
  deserializeRuleBid,
} from "../lineholder/rule-bid-value.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  buildDraftIdentity,
  normalizeCurrentDraftVersion,
  normalizeTiers,
  type CurrentDraftReference,
  type LineholderPeriodContext,
} from "../lineholder/shared.js";
import { validateDaysOffDraftProperties } from "./days-off-validation.js";
import { normalizePreferOffProperty } from "./prefer-off-property.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";

const PROPERTY_GROUP_KEY_MAX_LENGTH = 36;
const LONG_STRETCH_OFF_PROPERTY_CODE = 204;

export type NormalizedDaysOffDraftProperty = PbsDaysOffDraftProperty & {
  propertyGroupKey: string;
};

type NormalizedCurrentDraftMutationReference = Omit<CurrentDraftReference, "draftVersion"> & {
  draftVersion: number;
};

export type NormalizedDaysOffAddPropertyRequest = NormalizedCurrentDraftMutationReference
  & Omit<NormalizedDaysOffDraftProperty, "propertyGroupKey" | "rowSeq">
  & {
    remarks?: string;
  };

export type NormalizedDaysOffFavoriteRequest = NormalizedCurrentDraftMutationReference
  & Omit<NormalizedDaysOffDraftProperty, "propertyGroupKey" | "rowSeq" | "tiers">;

export type NormalizedDaysOffPatchPropertyRequest = NormalizedCurrentDraftMutationReference
  & Pick<NormalizedDaysOffDraftProperty, "action" | "bid" | "tiers" | "allOrNothing" | "minimumN" | "maximumN">;

export type AddPropertyDraftSnapshotRow = {
  draft_key?: string;
  bid_id?: number;
  period_id?: number | null;
  period_code?: string;
  draft_version?: number;
  next_row_seq?: number;
  property_group_key?: string | null;
  group_seq?: number | null;
  property_code?: number | null;
  action_id?: number | null;
  operator?: string | null;
  param_a?: string | null;
  param_b?: string | null;
  param_c?: string | null;
  all_or_nothing?: number | null;
  minimum_n?: number | null;
  limit_n?: number | null;
  tier?: number | null;
};

export const normalizeDaysOffAction = (
  propertyCode: number,
  action: PbsDaysOffDraftProperty["action"],
): PbsDaysOffDraftProperty["action"] => {
  if (propertyCode !== LONG_STRETCH_OFF_PROPERTY_CODE) {
    return null;
  }

  void action;
  return "award";
};

export const mapDaysOffActionToId = (action?: PbsDaysOffDraftProperty["action"]) => {
  if (action === "award") {
    return 1;
  }

  if (action === "avoid") {
    return 2;
  }

  return null;
};

export const mapDaysOffActionFromId = (
  propertyCode: number,
  actionId: number | null | undefined,
): PbsDaysOffDraftProperty["action"] => {
  if (propertyCode !== LONG_STRETCH_OFF_PROPERTY_CODE) {
    return null;
  }

  void actionId;
  return "award";
};

const hasLegacyMutationProperty = (
  request: PbsPatchDaysOffCurrentPropertyRequest,
): request is PbsLegacyDaysOffCurrentPropertyMutationRequest => "property" in request;

const requireNonEmptyTiers = (tiers: string[]) => {
  if (tiers.length === 0) {
    throw new LineholderBidServiceError(400, "Days off properties require at least one tier.");
  }

  return tiers;
};

export const buildEmptyDaysOffDraft = (
  period: LineholderPeriodContext,
): PbsDaysOffDraftDocument => ({
  ...buildDraftIdentity(period),
  bidContext: CURRENT_BID_CONTEXT,
  remarks: "",
  properties: [],
});

export const normalizeDaysOffPropertyGroupKey = (propertyGroupKey?: string | null) => {
  const normalizedKey = propertyGroupKey?.trim() ?? "";

  if (normalizedKey.length === 0) {
    return "";
  }

  if (normalizedKey.length > PROPERTY_GROUP_KEY_MAX_LENGTH) {
    return "";
  }

  return normalizedKey;
};

const resolveUniquePropertyGroupKey = (
  propertyGroupKey: string | undefined,
  usedPropertyGroupKeys: Set<string>,
) => {
  let normalizedKey = normalizeDaysOffPropertyGroupKey(propertyGroupKey);

  while (!normalizedKey || usedPropertyGroupKeys.has(normalizedKey)) {
    normalizedKey = randomUUID();
  }

  usedPropertyGroupKeys.add(normalizedKey);
  return normalizedKey;
};

export const buildDaysOffDraftPropertiesFromSnapshotRows = (
  rows: AddPropertyDraftSnapshotRow[],
  catalogByCode: Map<number, PbsDaysOffPropertyDefinition>,
): PbsDaysOffDraftProperty[] => {
  const propertiesByKey = new Map<string, PbsDaysOffDraftProperty>();

  for (const row of rows) {
    if (
      !row.property_group_key
      || row.group_seq === null
      || row.group_seq === undefined
      || row.property_code === null
      || row.property_code === undefined
      || row.tier === null
      || row.tier === undefined
    ) {
      continue;
    }

    const definition = catalogByCode.get(row.property_code);

    if (!definition) {
      continue;
    }

    const existingProperty = propertiesByKey.get(row.property_group_key);

    if (!existingProperty) {
      propertiesByKey.set(row.property_group_key, {
        propertyGroupKey: row.property_group_key,
        rowSeq: row.group_seq,
        propertyCode: row.property_code,
        name: definition.name,
        action: mapDaysOffActionFromId(row.property_code, row.action_id),
        bid: deserializeRuleBid(definition, {
          operator: row.operator ?? null,
          paramA: row.param_a ?? null,
          paramB: row.param_b ?? null,
          paramC: row.param_c ?? null,
        }),
        tiers: [`T${row.tier}`],
        allOrNothing: row.all_or_nothing === 1,
        minimumN: row.minimum_n ?? null,
        maximumN: row.limit_n ?? null,
      });

      continue;
    }

    existingProperty.tiers = normalizeTiers([...existingProperty.tiers, `T${row.tier}`]);
  }

  return Array.from(propertiesByKey.values()).sort((left, right) => left.rowSeq - right.rowSeq);
};

export const normalizeDaysOffDraftRequest = (
  request: PbsSaveDaysOffCurrentDraftRequest,
  catalogByCode: Map<number, PbsDaysOffPropertyDefinition>,
  preferOffConfig?: PbsPreferOffConfig,
  rosterPeriodRange?: { rpStartLocal: string; rpEndLocal: string },
): PbsDaysOffDraftDocument => {
  if (request.draft.bidContext !== CURRENT_BID_CONTEXT) {
    throw new LineholderBidServiceError(400, "Only the Current days off draft context is supported.");
  }

  const usedPropertyGroupKeys = new Set<string>();
  const periodCode = request.draft.periodCode.trim();
  const normalizedProperties = request.draft.properties
    .map((property, index) => {
      const definition = catalogByCode.get(property.propertyCode);

      if (!definition) {
        throw new LineholderBidServiceError(400, `Unsupported days off property code: ${property.propertyCode}`);
      }

      return {
        propertyGroupKey: resolveUniquePropertyGroupKey(property.propertyGroupKey, usedPropertyGroupKeys),
        rowSeq: property.rowSeq > 0 ? property.rowSeq : index + 1,
        propertyCode: property.propertyCode,
        name: definition.name,
        action: normalizeDaysOffAction(property.propertyCode, property.action ?? null),
        bid: cloneRuleBidValue(property.bid),
        tiers: normalizeTiers(property.tiers),
        allOrNothing: property.allOrNothing ?? false,
        minimumN: property.minimumN ?? null,
        maximumN: property.maximumN ?? null,
      };
    })
    .sort((left, right) => left.rowSeq - right.rowSeq)
    .map((property, index) => ({
      ...property,
      rowSeq: index + 1,
    }))
    .map((property) => normalizePreferOffProperty(property, { periodCode, preferOffConfig }));

  validateDaysOffDraftProperties(normalizedProperties, {
    rpStartLocal: rosterPeriodRange?.rpStartLocal,
    rpEndLocal: rosterPeriodRange?.rpEndLocal,
    preferOffConfig,
  });

  return {
    draftKey: request.draft.draftKey,
    bidId: request.draft.bidId,
    periodId: request.draft.periodId,
    draftVersion: normalizeCurrentDraftVersion(request.draft.draftVersion),
    periodCode,
    bidContext: CURRENT_BID_CONTEXT,
    remarks: request.draft.remarks?.trim() ?? "",
    properties: normalizedProperties,
  };
};

export const normalizeDaysOffAddPropertyRequest = (
  request: PbsAddDaysOffCurrentPropertyRequest,
  catalogByCode: Map<number, PbsDaysOffPropertyDefinition>,
): NormalizedDaysOffAddPropertyRequest => {
  const definition = catalogByCode.get(request.propertyCode);

  if (!definition) {
    throw new LineholderBidServiceError(400, `Unsupported days off property code: ${request.propertyCode}`);
  }

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    periodCode: request.periodCode?.trim(),
    remarks: request.remarks?.trim(),
    propertyCode: request.propertyCode,
    name: definition.name,
    action: normalizeDaysOffAction(request.propertyCode, request.action ?? null),
    bid: cloneRuleBidValue(request.bid),
    tiers: requireNonEmptyTiers(normalizeTiers(request.tiers)),
    allOrNothing: request.allOrNothing ?? false,
    minimumN: request.minimumN ?? null,
    maximumN: request.maximumN ?? null,
  };
};

export const normalizeDaysOffPatchPropertyRequest = (
  request: PbsPatchDaysOffCurrentPropertyRequest,
): NormalizedDaysOffPatchPropertyRequest => {
  if (hasLegacyMutationProperty(request) && request.bidContext !== CURRENT_BID_CONTEXT) {
    throw new LineholderBidServiceError(400, "Only the Current days off draft context is supported.");
  }

  const propertyInput = hasLegacyMutationProperty(request) ? request.property : request;
  const tiers = requireNonEmptyTiers(normalizeTiers(propertyInput.tiers));

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    periodCode: request.periodCode?.trim(),
    action: propertyInput.action ?? null,
    bid: cloneRuleBidValue(propertyInput.bid),
    tiers,
    allOrNothing: propertyInput.allOrNothing ?? false,
    minimumN: propertyInput.minimumN ?? null,
    maximumN: propertyInput.maximumN ?? null,
  };
};

export const normalizeDaysOffFavoriteRequest = (
  request: PbsSaveDaysOffFavoritePropertyRequest,
  catalogByCode: Map<number, PbsDaysOffPropertyDefinition>,
): NormalizedDaysOffFavoriteRequest => {
  const definition = catalogByCode.get(request.propertyCode);

  if (!definition) {
    throw new LineholderBidServiceError(400, `Unsupported days off property code: ${request.propertyCode}`);
  }

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    periodCode: request.periodCode?.trim(),
    propertyCode: request.propertyCode,
    name: definition.name,
    action: normalizeDaysOffAction(request.propertyCode, request.action ?? null),
    bid: cloneRuleBidValue(request.bid),
    allOrNothing: request.allOrNothing ?? false,
    minimumN: request.minimumN ?? null,
    maximumN: request.maximumN ?? null,
  };
};

export const buildDaysOffDraftPropertyFromAddRequest = (
  request: NormalizedDaysOffAddPropertyRequest,
  propertyGroupKey: string,
  rowSeq: number,
): NormalizedDaysOffDraftProperty => ({
  propertyGroupKey,
  rowSeq,
  propertyCode: request.propertyCode,
  name: request.name,
  action: request.action,
  bid: request.bid,
  tiers: request.tiers,
  allOrNothing: request.allOrNothing,
  minimumN: request.minimumN,
  maximumN: request.maximumN,
});

export const buildDaysOffDraftPropertyFromPatchRequest = (
  request: NormalizedDaysOffPatchPropertyRequest,
  propertyGroupKey: string,
  rowSeq: number,
  currentProperty: Pick<NormalizedDaysOffDraftProperty, "propertyCode" | "name">,
): NormalizedDaysOffDraftProperty => ({
  propertyGroupKey,
  rowSeq,
  propertyCode: currentProperty.propertyCode,
  name: currentProperty.name,
  action: normalizeDaysOffAction(currentProperty.propertyCode, request.action ?? null),
  bid: request.bid,
  tiers: request.tiers,
  allOrNothing: request.allOrNothing,
  minimumN: request.minimumN,
  maximumN: request.maximumN,
});
