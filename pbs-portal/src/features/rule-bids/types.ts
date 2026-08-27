import type { PairingBidValue } from "@/features/pairing/types";
import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";

export type RuleMinimumBaseLayoverBid = {
  type: "minimum-base-layover";
  minimumDuration: string;
};

export type RuleBidValue = PairingBidValue | RuleMinimumBaseLayoverBid;

export const isPairingBidValue = (bid: RuleBidValue): bid is PairingBidValue =>
  bid.type !== "minimum-base-layover";

export type RuleBidTierOption = {
  key: string;
  label: string;
  active?: boolean;
};

export type RuleBidExistingProperty = {
  id: string;
  categoryLabel?: string;
  categorySortOrder?: number;
  sourceContext?: "lineholder" | "reserve";
  sourceRowSeq?: number;
  propertyCode: number;
  name: string;
  action?: "award" | "avoid" | null;
  supportedActions?: readonly ("award" | "avoid")[];
  bid: RuleBidValue;
  tiers: RuleBidTierOption[];
  allOrNothing?: boolean;
  minimumN?: number | null;
  maximumN?: number | null;
};

export type RuleBidAvailableProperty = {
  id: string;
  favoriteKey?: string;
  propertyId?: number;
  source?: "catalog" | "favorite";
  categoryLabel?: string;
  categorySortOrder?: number;
  sourceContext?: "lineholder" | "reserve";
  propertyCode: number;
  name: string;
  action?: "award" | "avoid" | null;
  supportedActions?: readonly ("award" | "avoid")[];
  favorited: boolean;
  recommendedSortOrder?: number;
  bid: RuleBidValue;
  tiers: RuleBidTierOption[];
  allOrNothing?: boolean;
  minimumN?: number | null;
  maximumN?: number | null;
};

export type RuleBidConfiguredFavoriteProperty = {
  favoriteKey: string;
  propertyId: number;
  propertyCode: number;
  name: string;
  action?: "award" | "avoid" | null;
  bid: RuleBidValue;
  allOrNothing?: boolean;
  minimumN?: number | null;
  maximumN?: number | null;
};

export type RuleBidRightPanelData = {
  draftMeta: {
    draftKey?: string;
    bidId?: number;
    periodId?: number | null;
    draftVersion: number;
    periodCode: string;
    bidContext: "Current" | "StandingLineholder" | "StandingReserve";
    remarks?: string;
    currentPeriod?: PbsCurrentPeriod;
  };
  existingTitle: string;
  addButtonLabel: string;
  addSectionTitle: string;
  allPropertiesLabel: string;
  favoritedPropertiesLabel: string;
  searchPlaceholder: string;
  showModifiers?: boolean;
  existingProperties: RuleBidExistingProperty[];
  availableProperties: RuleBidAvailableProperty[];
};

export type RuleBidPageData = {
  rightPanel: RuleBidRightPanelData;
};
