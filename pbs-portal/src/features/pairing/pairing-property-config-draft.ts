import { isPairingCreditPriorityProperty } from "@/features/pairing/pairing-property-catalog";
import type {
  PairingAvailableProperty,
  PairingBidValue,
  PairingCreditPriority,
} from "@/features/pairing/types";

export const clonePairingConfigPropertyDraft = (
  property: PairingAvailableProperty,
): PairingAvailableProperty => ({
  ...property,
  favoriteKey: property.favoriteKey,
  propertyId: property.propertyId,
  bid: structuredClone(property.bid),
  tiers: property.tiers.map((tier) => ({ ...tier })),
  actions: [...property.actions],
  effectiveDateRange: { ...property.effectiveDateRange },
});

type PairingBidWithCreditPriority = Extract<PairingBidValue, {
  type: "duration" | "duration-range" | "percent-or-duration";
}>;

export const canUsePairingCreditPriority = (
  bid: PairingBidValue,
): bid is PairingBidWithCreditPriority =>
  bid.type === "duration" || bid.type === "duration-range" || bid.type === "percent-or-duration";

export const setPairingBidCreditPriority = (
  bid: PairingBidValue,
  creditPriority: PairingCreditPriority | null,
): PairingBidValue => {
  if (!canUsePairingCreditPriority(bid)) {
    return bid;
  }

  if (bid.type === "duration") {
    const nextBid = {
      type: bid.type,
      value: bid.value,
      operator: bid.operator,
    };

    return creditPriority ? { ...nextBid, creditPriority } : nextBid;
  }

  if (bid.type === "duration-range") {
    const nextBid = {
      type: bid.type,
      from: bid.from,
      to: bid.to,
    };

    return creditPriority ? { ...nextBid, creditPriority } : nextBid;
  }

  const nextBid = {
    type: bid.type,
    unit: bid.unit,
    value: bid.value,
    operator: bid.operator,
  };

  return creditPriority ? { ...nextBid, creditPriority } : nextBid;
};

export const preservePairingBidCreditPriority = (
  propertyCode: number,
  currentBid: PairingBidValue,
  nextBid: PairingBidValue,
): PairingBidValue => {
  if (
    !isPairingCreditPriorityProperty(propertyCode)
    || !canUsePairingCreditPriority(currentBid)
    || !canUsePairingCreditPriority(nextBid)
  ) {
    return nextBid;
  }

  return nextBid.creditPriority
    ? nextBid
    : setPairingBidCreditPriority(nextBid, currentBid.creditPriority ?? null);
};
