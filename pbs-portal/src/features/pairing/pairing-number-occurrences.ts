import type {
  PairingBidValue,
  PairingOccurrenceBidItem,
  PairingTierOption,
} from "@/features/pairing/types";
import { createPairingTierOptions } from "@/features/pairing/pairing-property-transform";

export const PAIRING_NUMBER_PROPERTY_CODE = 102;

export type PairingOccurrenceMode = "entire_month" | "specific_date";
export type PairingNumberChoice = {
  pairingId: string;
  pairingNumber: string;
};

export const normalizePairingNumber = (value: string) => value.trim().toUpperCase();

export const extractPairingIdsFromBid = (bid: PairingBidValue): string[] => {
  const rawValues = (() => {
    if (bid.type === "pairing-id-list") {
      return bid.pairingIds;
    }

    if (bid.type === "pairing-preference") {
      return bid.pairingIds;
    }

    if (bid.type === "pairing-occurrence-list") {
      return bid.occurrences.map((occurrence) => occurrence.pairingId);
    }

    return bid.type === "text" ? [bid.value] : [];
  })();

  return Array.from(
    new Set(rawValues.map(normalizePairingNumber).filter((value) => value.length > 0)),
  );
};

export const extractPairingNumbersFromBid = extractPairingIdsFromBid;

export const extractPairingNumberChoicesFromBid = (bid: PairingBidValue): PairingNumberChoice[] => {
  if (bid.type === "pairing-id-list") {
    const labels = bid.pairingLabels?.length === bid.pairingIds.length ? bid.pairingLabels : undefined;

    return bid.pairingIds.flatMap((pairingId, index) => {
      const normalizedPairingId = pairingId.trim();

      if (!normalizedPairingId) {
        return [];
      }

      return [{
        pairingId: normalizedPairingId,
        pairingNumber: normalizePairingNumber(labels?.[index] ?? normalizedPairingId),
      }];
    });
  }

  if (bid.type === "pairing-preference") {
    const labels = bid.pairingLabels?.length === bid.pairingIds.length ? bid.pairingLabels : undefined;

    return bid.pairingIds.flatMap((pairingId, index) => {
      const normalizedPairingId = pairingId.trim();

      if (!normalizedPairingId) {
        return [];
      }

      return [{
        pairingId: normalizedPairingId,
        pairingNumber: normalizePairingNumber(labels?.[index] ?? normalizedPairingId),
      }];
    });
  }

  if (bid.type === "pairing-occurrence-list") {
    const choicesByNumber = new Map<string, PairingNumberChoice>();

    for (const occurrence of bid.occurrences) {
      const pairingNumber = normalizePairingNumber(occurrence.pairingNumber);
      const pairingId = occurrence.pairingId.trim();

      if (!pairingNumber || !pairingId || choicesByNumber.has(pairingNumber)) {
        continue;
      }

      choicesByNumber.set(pairingNumber, { pairingId, pairingNumber });
    }

    return Array.from(choicesByNumber.values()).sort((left, right) =>
      left.pairingNumber.localeCompare(right.pairingNumber));
  }

  if (bid.type === "text") {
    const value = normalizePairingNumber(bid.value);

    return value ? [{ pairingId: value, pairingNumber: value }] : [];
  }

  return [];
};

const getPairingNumberSuggestions = (bid: PairingBidValue) =>
  bid.type === "pairing-id-list"
    ? bid.pairingLabels
    : bid.type === "pairing-occurrence-list"
    ? bid.suggestions
    : bid.type === "pairing-preference"
    ? bid.pairingLabels
    : undefined;

export const buildPairingIdListBid = (
  pairingIds: string[],
  pairingLabels?: string[],
): PairingBidValue => {
  const normalizedPairingIds = Array.from(
    new Set(pairingIds.map((pairingId) => pairingId.trim()).filter((pairingId) => pairingId.length > 0)),
  );
  const normalizedPairingLabels = pairingLabels?.map((label) => label.trim()).filter((label) => label.length > 0);

  return {
    type: "pairing-id-list",
    pairingIds: normalizedPairingIds,
    ...(normalizedPairingLabels?.length === normalizedPairingIds.length ? { pairingLabels: normalizedPairingLabels } : {}),
  };
};

export const buildPairingOccurrenceListBid = (
  sourceBid: PairingBidValue,
  occurrences: PairingOccurrenceBidItem[],
): PairingBidValue => {
  const suggestions = getPairingNumberSuggestions(sourceBid);
  const occurrencesByKey = new Map<string, PairingOccurrenceBidItem>();

  for (const occurrence of occurrences) {
    const pairingNumber = normalizePairingNumber(occurrence.pairingNumber);
    const pairingId = occurrence.pairingId.trim();
    const originDate = occurrence.originDate.trim();

    if (!pairingNumber || !pairingId || !originDate) {
      continue;
    }

    occurrencesByKey.set(`${pairingId}|${originDate}`, {
      pairingNumber,
      originDate,
      pairingId,
      ...(occurrence.occurrenceId?.trim() ? { occurrenceId: occurrence.occurrenceId.trim() } : {}),
    });
  }

  return {
    type: "pairing-occurrence-list",
    occurrences: Array.from(occurrencesByKey.values()).sort((left, right) => {
      if (left.pairingNumber !== right.pairingNumber) {
        return left.pairingNumber.localeCompare(right.pairingNumber);
      }

      return left.originDate.localeCompare(right.originDate);
    }),
    ...(suggestions ? { suggestions } : {}),
  };
};

export const buildPairingPreferenceBid = ({
  pairingIds,
  pairingLabels,
}: {
  pairingIds: string[];
  pairingLabels?: string[];
}): PairingBidValue => {
  const labels = pairingLabels?.map((label) => label.trim());
  const idsWithLabels = new Map<string, string | undefined>();

  pairingIds.forEach((pairingId, index) => {
    const normalizedPairingId = pairingId.trim();

    if (normalizedPairingId.length > 0 && !idsWithLabels.has(normalizedPairingId)) {
      idsWithLabels.set(normalizedPairingId, labels?.[index]);
    }
  });

  const normalizedPairingIds = Array.from(idsWithLabels.keys());
  const normalizedPairingLabels = Array.from(idsWithLabels.values()).filter((label): label is string =>
    Boolean(label));

  return {
    type: "pairing-preference",
    pairingIds: normalizedPairingIds,
    ...(normalizedPairingLabels?.length === normalizedPairingIds.length ? { pairingLabels: normalizedPairingLabels } : {}),
  };
};

export const extractPairingOccurrencesFromBid = (bid: PairingBidValue): PairingOccurrenceBidItem[] =>
  bid.type === "pairing-occurrence-list"
    ? bid.occurrences.map((occurrence) => ({ ...occurrence }))
    : [];

export const resolveFirstActivePairingTierLabel = (
  tiers: PairingTierOption[],
  fallbackTier = "T1",
) => tiers.find((tier) => tier.active)?.label ?? fallbackTier;

export const buildSinglePairingTierOptions = (tier: string): PairingTierOption[] =>
  createPairingTierOptions([tier]);
