import type { PbsCurrentPeriod } from "./pbs-current-period.js";
import type {
  PbsPairingBidAction,
  PbsPairingBidValue,
} from "./pbs-pairing-bids.js";
import type { PbsLineBidValue } from "./pbs-line-bids.js";
import type { PbsPreferOffConfig } from "./pbs-prefer-off.js";

export declare const pbsStandingBidRoutes: {
  readonly current: "/standing-bids/current";
};

export declare const pbsStandingBidContexts: {
  readonly lineholder: "StandingLineholder";
  readonly reserve: "StandingReserve";
};

export declare const pbsStandingPeriodCode: "STANDING";

export declare const pbsStandingLineholderPropertyCodes: {
  readonly dayOfWeekOff: 218;
};

export declare const pbsStandingReservePropertyCodes: {
  readonly reserveDayOfWeekOff: 312;
  readonly reserveWorkBlockSize: 313;
  readonly waiveCarryOverToDaysOff: 314;
};

export declare const pbsStandingWeekdayOptions: readonly [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export type PbsStandingBidMode = "lineholder" | "reserve";
export type PbsStandingBidContext = "StandingLineholder" | "StandingReserve";
export type PbsStandingBidType = "DaysOff" | "Pairing" | "Line" | "Reserve";
export type PbsStandingBidValue = PbsPairingBidValue | PbsLineBidValue;

export type PbsStandingPropertyDefinition = {
  bidType: PbsStandingBidType;
  propertyCode: number;
  name: string;
  defaultBid: PbsStandingBidValue;
  defaultAction?: PbsPairingBidAction | null;
  supportedActions?: readonly PbsPairingBidAction[];
};

export type PbsStandingDraftProperty = {
  propertyGroupKey?: string;
  rowSeq: number;
  bidType?: PbsStandingBidType;
  propertyCode: number;
  name: string;
  action?: PbsPairingBidAction | null;
  bid: PbsStandingBidValue;
  tiers: string[];
};

export type PbsStandingDraftDocument = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
  bidContext: PbsStandingBidContext;
  remarks?: string;
  properties: PbsStandingDraftProperty[];
};

export type PbsStandingCurrentResponse = {
  currentPeriod: PbsCurrentPeriod;
  lineholderDraft: PbsStandingDraftDocument;
  preferOffConfig: PbsPreferOffConfig;
  reserveDraft: PbsStandingDraftDocument;
  propertyCatalog: {
    lineholder: PbsStandingPropertyDefinition[];
    reserve: PbsStandingPropertyDefinition[];
  };
};

export type PbsSaveStandingDraftRequest = {
  mode: PbsStandingBidMode;
  draft: PbsStandingDraftDocument;
};

export type PbsStandingDraftMutationResponse = PbsStandingCurrentResponse;

export declare const pbsStandingLineholderPropertyRegistry: readonly PbsStandingPropertyDefinition[];
export declare const pbsStandingReservePropertyRegistry: readonly PbsStandingPropertyDefinition[];
