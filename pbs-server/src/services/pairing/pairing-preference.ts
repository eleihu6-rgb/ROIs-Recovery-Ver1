import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { isStablePairingId } from "../pairing-search/pairing-id-utils.js";
import { PairingBidServiceError } from "./pairing-bid-errors.js";

type PairingPreferenceBid = Extract<PbsPairingDraftProperty["bid"], { type: "pairing-preference" }>;

export const isPairingPreferenceBid = (
  bid: PbsPairingDraftProperty["bid"],
): bid is PairingPreferenceBid => bid.type === "pairing-preference";

export const normalizePairingPreferenceBid = (bid: PairingPreferenceBid): PairingPreferenceBid => {
  const pairingIds = bid.pairingIds.map((pairingId) => pairingId.trim()).filter(Boolean);

  if (pairingIds.length === 0) {
    throw new PairingBidServiceError(400, "Pairing Preference requires at least one Pairing Number.");
  }

  if (!pairingIds.every(isStablePairingId)) {
    throw new PairingBidServiceError(400, "Pairing Preference selections must use valid Pairing IDs.");
  }

  const labels = bid.pairingLabels?.map((label) => label.trim()).filter(Boolean);

  if (labels && labels.length !== pairingIds.length) {
    throw new PairingBidServiceError(400, "Pairing Preference labels must align with Pairing IDs.");
  }

  const idsWithLabels = new Map<string, string | undefined>();
  pairingIds.forEach((pairingId, index) => {
    if (!idsWithLabels.has(pairingId)) {
      idsWithLabels.set(pairingId, labels?.[index]);
    }
  });
  const normalizedPairingIds = Array.from(idsWithLabels.keys());
  const normalizedLabels = Array.from(idsWithLabels.values()).filter((label): label is string => Boolean(label));
  return {
    type: "pairing-preference",
    pairingIds: normalizedPairingIds,
    ...(normalizedLabels.length === normalizedPairingIds.length ? { pairingLabels: normalizedLabels } : {}),
  };
};

export const getPairingPreferenceIds = (bid: PairingPreferenceBid) =>
  normalizePairingPreferenceBid(bid).pairingIds;
