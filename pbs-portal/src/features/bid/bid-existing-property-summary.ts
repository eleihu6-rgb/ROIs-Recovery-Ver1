import {
  buildBidPropertySummary,
  type BidSummaryProperty,
} from "@/features/bid/bid-property-summary";
import type { BidPropertySummary } from "@/features/bid/bid-property-summary-types";
import type { PairingExistingProperty } from "@/features/pairing/types";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";
import type { TierSummaryItem } from "@/features/tier/types";
import { pbsLineReservePropertyCodes } from "../../../../packages/contracts/pbs-line-bids.js";
import { pbsReserveLegacyPropertyCodes } from "../../../../packages/contracts/pbs-reserve-bids.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import type { PbsEfficientFlyingConfig } from "../../../../packages/contracts/pbs-pairing-bids.js";

type BidExistingPropertySources = {
  daysOff: RuleBidExistingProperty[];
  pairing: PairingExistingProperty[];
  line: RuleBidExistingProperty[];
  reserve: RuleBidExistingProperty[];
};

const CURRENT_PROPERTY_CODES = {
  DaysOff: new Set<number>([201, 204]),
  Pairing: new Set<number>([102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168, 428]),
  Line: new Set<number>([407, 408, 410, 427, 429, pbsLineReservePropertyCodes.shortCallType]),
  Reserve: new Set<number>([pbsReserveLegacyPropertyCodes.shortCallType]),
} as const;

const findProperty = <TProperty extends { id: string }>(
  properties: TProperty[],
  propertyGroupKey: string,
): TProperty | null =>
  properties.find((property) => property.id === propertyGroupKey) ?? null;

export const resolveBidExistingPropertySummary = (
  item: TierSummaryItem,
  sources: BidExistingPropertySources,
  preferOffConfig?: PbsPreferOffConfig,
  efficientFlyingConfig?: PbsEfficientFlyingConfig,
): BidPropertySummary | null => {
  if (!item.isEditable || !item.editableSource) {
    return null;
  }

  const { module, propertyGroupKey } = item.editableSource;

  if (module === "DaysOff") {
    const property = findProperty(sources.daysOff, propertyGroupKey);
    return property && CURRENT_PROPERTY_CODES.DaysOff.has(property.propertyCode)
      ? buildBidPropertySummary("days-off", property as BidSummaryProperty, preferOffConfig)
      : null;
  }

  if (module === "Pairing") {
    const property = findProperty(sources.pairing, propertyGroupKey);
    return property && CURRENT_PROPERTY_CODES.Pairing.has(property.propertyCode)
      ? buildBidPropertySummary("pairing", property, undefined, efficientFlyingConfig)
      : null;
  }

  if (module === "Line") {
    const property = findProperty(sources.line, propertyGroupKey);
    return property && CURRENT_PROPERTY_CODES.Line.has(property.propertyCode)
      ? buildBidPropertySummary("line", property as BidSummaryProperty)
      : null;
  }

  const property = findProperty(sources.reserve, propertyGroupKey);
  return property && CURRENT_PROPERTY_CODES.Reserve.has(property.propertyCode)
    ? buildBidPropertySummary("line", property as BidSummaryProperty)
    : null;
};
