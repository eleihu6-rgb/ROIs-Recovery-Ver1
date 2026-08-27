import type { PbsCurrentPeriod } from "./pbs-current-period.js";

export declare const pbsReserveBidRoutes: {
  readonly current: "/reserve-bids/current";
  readonly currentProperties: "/reserve-bids/current/properties";
  readonly currentPropertyByKey: (propertyGroupKey: string) => string;
  readonly currentCoverage: "/reserve-bids/current/coverage";
};

export declare const pbsReserveLegacyPropertyCodes: {
  readonly shortCallType: 301;
  readonly reserveDayOn: 302;
};

export declare const pbsReserveAaPropertyCodes: {
  readonly preferOff: 311;
};

export declare const pbsReserveStandingPropertyCodes: {
  readonly reserveDayOfWeekOff: 312;
  readonly reserveWorkBlockSize: 313;
  readonly waiveCarryOverToDaysOff: 314;
};

export declare const pbsReserveShortCallTypes: readonly [
  "CRAM",
  "CRPM",
  "PRAM",
  "PRMM",
  "PRPM",
  "RESA",
  "RESB",
];

export declare const pbsReserveDateScopeModes: readonly [
  "whole_month",
  "first_half",
  "second_half",
  "date_range",
  "specific_dates",
];

export type PbsReserveDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };

export type PbsReserveBidValue =
  | { type: "select"; value: string; options: string[] }
  | { type: "reserve-call-type-date-scope"; callType: string; options: string[]; dateScope: PbsReserveDateScope }
  | { type: "tag-list"; values: string[]; suggestions?: string[] }
  | {
      type: "date-or-dow-list";
      dates: string[];
      daysOfWeek: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
    }
  | { type: "stepper-range"; from: number; to: number; min?: number; max?: number }
  | { type: "flag" };

export type PbsReservePropertyDefinition = {
  propertyCode: number;
  name: string;
  defaultBid: PbsReserveBidValue;
};

export declare const pbsReserveLegacyPropertyCatalog: readonly PbsReservePropertyDefinition[];
export declare const pbsReserveAaPropertyCatalog: readonly PbsReservePropertyDefinition[];
export declare const pbsSupportedReservePropertyCatalog: readonly PbsReservePropertyDefinition[];
export declare const pbsReservePropertyRegistry: readonly PbsReservePropertyDefinition[];

export type PbsReserveMode = "legacy" | "aa-prefer-off";

export type PbsReserveDraftProperty = {
  propertyGroupKey?: string;
  rowSeq: number;
  propertyCode: number;
  name: string;
  bid: PbsReserveBidValue;
  tiers: string[];
};

export type PbsReserveDraftDocument = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
  bidContext: "Current";
  mode: PbsReserveMode;
  remarks?: string;
  properties: PbsReserveDraftProperty[];
};

export type PbsReserveCurrentDraftResponse = {
  currentPeriod?: PbsCurrentPeriod;
  draft: PbsReserveDraftDocument;
  propertyCatalog: PbsReservePropertyDefinition[];
};

export type PbsSaveReserveCurrentDraftRequest = {
  draft: PbsReserveDraftDocument;
};

export type PbsAddReserveCurrentPropertyRequest = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  bidContext: "Current";
  draftVersion: number;
  remarks?: string;
  property: Omit<PbsReserveDraftProperty, "propertyGroupKey" | "rowSeq">;
};

export type PbsPatchReserveCurrentPropertyRequest = PbsAddReserveCurrentPropertyRequest;

export type PbsReserveDraftMutationResponse = {
  saved: true;
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  periodCode?: string;
  draftVersion?: number;
};

export type PbsReserveDraftPropertyMutationResponse = PbsReserveDraftMutationResponse & {
  propertyGroupKey: string;
  rowSeq: number;
};

export type PbsPatchReserveCurrentPropertyResponse = PbsReserveDraftMutationResponse & {
  propertyGroupKey: string;
  tiers: string[];
};

export type PbsReserveCoverageDay = {
  date: string;
  requiredReserveCount: number;
  availableOffCount: number;
};

export type PbsReserveCoverageResponse = {
  rosterPeriodId: number;
  rpStartLocal: string;
  rpEndLocal: string;
  periodCode: string;
  baseCode: string;
  days: PbsReserveCoverageDay[];
  warnings: string[];
};
