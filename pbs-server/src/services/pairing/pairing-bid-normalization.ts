import { randomUUID } from "node:crypto";
import {
  isPbsPairingCreditPriorityProperty,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type {
  PbsAddPairingCurrentPropertyRequest,
  PbsPairingBidAction,
  PbsPairingBidQuantifier,
  PbsPairingDraftDocument,
  PbsPairingDraftProperty,
  PbsPairingPropertyDefinition,
  PbsSavePairingCurrentDraftRequest,
  PbsPatchPairingCurrentPropertyRequest,
  PbsSavePairingFavoritePropertyRequest,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  CURRENT_BID_CONTEXT,
  buildDraftIdentity,
  normalizeCurrentDraftVersion,
  normalizeTiers,
  type CurrentDraftReference,
  type LineholderPeriodContext,
} from "../lineholder/shared.js";
import {
  cloneRuleBidValue,
  deserializeRuleBid,
} from "../lineholder/rule-bid-value.js";
import { PairingBidServiceError } from "./pairing-bid-errors.js";
import {
  isPairingPreferenceBid,
  normalizePairingPreferenceBid,
} from "./pairing-preference.js";
import { PAIRING_NUMBER_PROPERTY_CODE } from "./pairing-specific-date.js";

type NormalizedCurrentDraftMutationReference = Omit<CurrentDraftReference, "draftVersion"> & {
  draftVersion: number;
};

export type NormalizedPairingAddPropertyRequest = NormalizedCurrentDraftMutationReference
  & Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq">
  & {
    remarks: string;
    periodCode: string;
  };

export type NormalizedPairingPatchPropertyRequest = NormalizedCurrentDraftMutationReference
  & Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq">
  & {
    periodCode: string;
  };

export type NormalizedPairingFavoritePropertyRequest = NormalizedCurrentDraftMutationReference
  & Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq" | "tiers">
  & {
    periodCode: string;
  };

const PROPERTY_GROUP_KEY_MAX_LENGTH = 36;
type PairingCreditPriority = "higher" | "lower";
type PairingBidPreferenceJson = {
  creditPriority?: PairingCreditPriority;
} | null;
type PairingBidWithCreditPriority = PbsPairingDraftProperty["bid"] & {
  creditPriority?: unknown;
};

export const normalizePropertyGroupKey = (propertyGroupKey?: string | null) => {
  const normalizedKey = propertyGroupKey?.trim() ?? "";

  if (normalizedKey.length > 0 && normalizedKey.length <= PROPERTY_GROUP_KEY_MAX_LENGTH) {
    return normalizedKey;
  }

  return randomUUID();
};

export const normalizeExistingPropertyGroupKey = (propertyGroupKey: string) => {
  const normalizedKey = propertyGroupKey.trim();

  if (normalizedKey.length === 0 || normalizedKey.length > PROPERTY_GROUP_KEY_MAX_LENGTH) {
    throw new PairingBidServiceError(400, "Invalid pairing property key.");
  }

  return normalizedKey;
};

export const normalizePairingPropertyTiers = (tiers: string[]) => {
  const normalizedTiers = normalizeTiers(tiers);

  if (normalizedTiers.length === 0) {
    throw new PairingBidServiceError(400, "Pairing properties require at least one tier.");
  }

  return normalizedTiers;
};

const normalizePairingPatchPropertyTiers = (tiers: string[]) => normalizeTiers(tiers);

const resolveUniquePropertyGroupKey = (
  propertyGroupKey: string | undefined,
  usedPropertyGroupKeys: Set<string>,
) => {
  let normalizedKey = normalizePropertyGroupKey(propertyGroupKey);

  while (usedPropertyGroupKeys.has(normalizedKey)) {
    normalizedKey = randomUUID();
  }

  usedPropertyGroupKeys.add(normalizedKey);
  return normalizedKey;
};

export const buildEmptyPairingDraft = (period: LineholderPeriodContext): PbsPairingDraftDocument => ({
  ...buildDraftIdentity(period),
  bidContext: CURRENT_BID_CONTEXT,
  remarks: "",
  properties: [],
});

export const mapPairingActionFromId = (actionId: number | null): PbsPairingBidAction | null => {
  if (actionId === 1) {
    return "award";
  }

  if (actionId === 2) {
    return "avoid";
  }

  return null;
};

export const mapPairingActionToId = (action?: PbsPairingBidAction | null) => {
  if (action === "award") {
    return 1;
  }

  if (action === "avoid") {
    return 2;
  }

  return null;
};

export const mapPairingQuantifier = (
  quantifier?: string | null,
): PbsPairingBidQuantifier | null => {
  if (quantifier === "any" || quantifier === "every") {
    return quantifier;
  }

  return null;
};

const normalizeCreditPriority = (value: unknown): PairingCreditPriority | undefined =>
  value === "higher" || value === "lower" ? value : undefined;

export const buildPairingBidPreferenceJson = (
  propertyCode: number,
  bid: PbsPairingDraftProperty["bid"],
): PairingBidPreferenceJson => {
  if (!isPbsPairingCreditPriorityProperty(propertyCode)) {
    return null;
  }

  const creditPriority = normalizeCreditPriority((bid as PairingBidWithCreditPriority).creditPriority);

  return creditPriority ? { creditPriority } : null;
};

export const applyPairingBidPreferenceJson = (
  propertyCode: number,
  bid: PbsPairingDraftProperty["bid"],
  preferenceJson: PairingBidPreferenceJson,
): PbsPairingDraftProperty["bid"] => {
  const creditPriority = normalizeCreditPriority(preferenceJson?.creditPriority);

  if (!creditPriority || !isPbsPairingCreditPriorityProperty(propertyCode)) {
    return bid;
  }

  return {
    ...bid,
    creditPriority,
  } as PbsPairingDraftProperty["bid"];
};

export const deserializePairingDraftBid = (
  definition: PbsPairingPropertyDefinition,
  serialized: {
    operator: string | null;
    paramA: string | null;
    paramB: string | null;
    paramC: string | null;
  },
) => {
  return deserializeRuleBid(definition, serialized);
};

export const resolvePairingQuantifier = (
  property: Pick<PbsPairingDraftProperty, "quantifier">,
  definition: PbsPairingPropertyDefinition,
) => {
  const requestedQuantifier = property.quantifier ?? null;

  if (!definition.supportedQuantifiers || definition.supportedQuantifiers.length === 0) {
    if (requestedQuantifier !== null) {
      throw new PairingBidServiceError(
        400,
        `Pairing property ${definition.propertyCode} does not support any/every quantifiers.`,
      );
    }

    return null;
  }

  if (requestedQuantifier === null) {
    return definition.defaultQuantifier ?? null;
  }

  if (!definition.supportedQuantifiers.includes(requestedQuantifier)) {
    throw new PairingBidServiceError(
      400,
      `Unsupported any/every quantifier for pairing property ${definition.propertyCode}.`,
    );
  }

  return requestedQuantifier;
};

export const ensureSupportedPropertyCode = (
  propertyCode: number,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
) => {
  if (!catalogByCode.has(propertyCode)) {
    throw new PairingBidServiceError(400, `Unsupported pairing property code: ${propertyCode}`);
  }
};

const normalizePairingBidValue = (
  propertyCode: number,
  bid: PbsPairingDraftProperty["bid"],
) => {
  if (propertyCode === PAIRING_NUMBER_PROPERTY_CODE && isPairingPreferenceBid(bid)) {
    return normalizePairingPreferenceBid(bid);
  }

  if (propertyCode === PAIRING_NUMBER_PROPERTY_CODE) {
    throw new PairingBidServiceError(400, "Pairing Preference must use Pairing IDs selected from the list.");
  }

  const clonedBid = cloneRuleBidValue(bid);
  const { creditPriority, ...bidWithoutCreditPriority } = clonedBid as PairingBidWithCreditPriority;
  const normalizedCreditPriority = isPbsPairingCreditPriorityProperty(propertyCode)
    ? normalizeCreditPriority(creditPriority)
    : undefined;

  return normalizedCreditPriority
    ? {
      ...bidWithoutCreditPriority,
      creditPriority: normalizedCreditPriority,
    } as PbsPairingDraftProperty["bid"]
    : bidWithoutCreditPriority as PbsPairingDraftProperty["bid"];
};

export const normalizeDraftRequest = (
  request: PbsSavePairingCurrentDraftRequest,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
): PbsPairingDraftDocument => {
  if (request.draft.bidContext !== CURRENT_BID_CONTEXT) {
    throw new PairingBidServiceError(400, "Only the Current pairing draft context is supported.");
  }

  const usedPropertyGroupKeys = new Set<string>();
  const normalizedProperties = request.draft.properties
    .map((property, index) => {
      const definition = catalogByCode.get(property.propertyCode);

      if (!definition) {
        throw new PairingBidServiceError(400, `Unsupported pairing property code: ${property.propertyCode}`);
      }

      const tiers = normalizePairingPropertyTiers(property.tiers);

      return {
        propertyGroupKey: resolveUniquePropertyGroupKey(property.propertyGroupKey, usedPropertyGroupKeys),
        rowSeq: property.rowSeq > 0 ? property.rowSeq : index + 1,
        propertyCode: property.propertyCode,
        name: definition.name,
        action: property.action ?? null,
        quantifier: resolvePairingQuantifier(property, definition),
        bid: normalizePairingBidValue(property.propertyCode, property.bid),
        tiers,
      };
    })
    .sort((left, right) => left.rowSeq - right.rowSeq)
    .map((property, index) => ({
      ...property,
      rowSeq: index + 1,
    }));

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

export const normalizeAddPropertyRequest = (
  request: PbsAddPairingCurrentPropertyRequest,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
): NormalizedPairingAddPropertyRequest => {
  if (request.bidContext !== CURRENT_BID_CONTEXT) {
    throw new PairingBidServiceError(400, "Only the Current pairing draft context is supported.");
  }

  const definition = catalogByCode.get(request.property.propertyCode);

  if (!definition) {
    throw new PairingBidServiceError(400, `Unsupported pairing property code: ${request.property.propertyCode}`);
  }

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    periodCode: request.periodCode?.trim() ?? "",
    remarks: request.remarks?.trim() ?? "",
    propertyCode: request.property.propertyCode,
    name: definition.name,
    action: request.property.action ?? null,
    quantifier: resolvePairingQuantifier(request.property, definition),
    bid: normalizePairingBidValue(request.property.propertyCode, request.property.bid),
    tiers: normalizePairingPropertyTiers(request.property.tiers),
  };
};

export const normalizePatchPropertyRequest = (
  request: PbsPatchPairingCurrentPropertyRequest,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
): NormalizedPairingPatchPropertyRequest => {
  if (request.bidContext !== CURRENT_BID_CONTEXT) {
    throw new PairingBidServiceError(400, "Only the Current pairing draft context is supported.");
  }

  const definition = catalogByCode.get(request.property.propertyCode);

  if (!definition) {
    throw new PairingBidServiceError(400, `Unsupported pairing property code: ${request.property.propertyCode}`);
  }

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    periodCode: request.periodCode?.trim() ?? "",
    propertyCode: request.property.propertyCode,
    name: definition.name,
    action: request.property.action ?? null,
    quantifier: resolvePairingQuantifier(request.property, definition),
    bid: normalizePairingBidValue(request.property.propertyCode, request.property.bid),
    tiers: normalizePairingPatchPropertyTiers(request.property.tiers),
  };
};

export const normalizeFavoriteRequest = (
  request: PbsSavePairingFavoritePropertyRequest,
  catalogByCode: Map<number, PbsPairingPropertyDefinition>,
): NormalizedPairingFavoritePropertyRequest => {
  const definition = catalogByCode.get(request.property.propertyCode);

  if (!definition) {
    throw new PairingBidServiceError(400, `Unsupported pairing property code: ${request.property.propertyCode}`);
  }

  return {
    draftKey: request.draftKey,
    bidId: request.bidId,
    draftVersion: normalizeCurrentDraftVersion(request.draftVersion),
    periodCode: request.periodCode?.trim() ?? "",
    propertyCode: request.property.propertyCode,
    name: definition.name,
    action: request.property.action ?? null,
    quantifier: resolvePairingQuantifier(request.property, definition),
    bid: normalizePairingBidValue(request.property.propertyCode, request.property.bid),
  };
};

export const buildDraftPropertyFromAddRequest = (
  request: NormalizedPairingAddPropertyRequest,
  propertyGroupKey: string,
  rowSeq: number,
): PbsPairingDraftProperty => ({
  propertyGroupKey,
  rowSeq,
  propertyCode: request.propertyCode,
  name: request.name,
  action: request.action,
  quantifier: request.quantifier,
  bid: request.bid,
  tiers: request.tiers,
});

export const buildDraftPropertyFromPatchRequest = (
  request: NormalizedPairingPatchPropertyRequest,
  propertyGroupKey: string,
  rowSeq: number,
): PbsPairingDraftProperty => ({
  propertyGroupKey,
  rowSeq,
  propertyCode: request.propertyCode,
  name: request.name,
  action: request.action,
  quantifier: request.quantifier,
  bid: request.bid,
  tiers: request.tiers,
});
