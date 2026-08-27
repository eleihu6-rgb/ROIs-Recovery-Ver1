import type { PbsCurrentPeriod } from "./pbs-current-period.js";

export declare const pbsLineBidRoutes: {
  readonly current: "/line-bids/current";
  readonly currentProperties: "/line-bids/current/properties";
  readonly currentPropertyByKey: (propertyGroupKey: string) => string;
  readonly currentFavorites: "/line-bids/current/favorites";
  readonly favoriteByKey: (favoriteKey: number | string) => string;
  readonly creditWindowConfig: "/line-bids/credit-window-config";
  readonly minimumBaseLayoverConfig: "/line-bids/minimum-base-layover-config";
};

export declare const pbsLineLegacyPropertyCodes: {
  readonly maxCreditWindow: 401;
  readonly minCreditWindow: 402;
  readonly clearScheduleAndStartNextBidGroup: 403;
  readonly noSameDayPairings: 404;
  readonly waiveNoSameDayDutyStarts: 405;
  readonly forgetLine: 406;
  readonly minBaseLayover: 407;
  readonly commuterPattern: 408;
  readonly mostFlyingInLeastDays: 409;
  readonly reserveFlyingDatePattern: 410;
};

export declare const pbsLineAaPropertyCodes: {
  readonly targetCreditRange: 411;
  readonly maximizeCredit: 412;
  readonly maximizeInternationalCredit: 413;
  readonly workBlockSize: 414;
  readonly preferCadenceOnDayOfWeek: 415;
  readonly commutableWorkBlock: 416;
  readonly pairingMixInWorkBlock: 417;
  readonly allowDoubleUpOnDate: 418;
  readonly allowMultiplePairings: 419;
  readonly allowMultiplePairingsOnDate: 420;
  readonly allowCoTerminalMixInWorkBlock: 421;
  readonly clearBids: 422;
  readonly waive24HoursRestInDomicile: 423;
  readonly waiveMinimumDomicileRest: 424;
  readonly waive30HoursIn7Days: 425;
  readonly waiveCarryOverCredit: 426;
  readonly reserve: 427;
};

export declare const pbsLineReservePropertyCodes: {
  readonly shortCallType: 301;
};

export declare const pbsLineF8PropertyCodes: {
  readonly creditWindowPreference: 429;
};

export declare const pbsLineCreditWindowDeltaHoursRange: {
  readonly min: 1;
  readonly max: 20;
};

export declare const parsePbsLineCreditWindowDeltaHours: (
  value: unknown,
) => number | null;

export declare const parsePbsLineCreditWindowPreferenceBid: (
  value: unknown,
) => Extract<PbsLineBidValue, { type: "credit-window-preference" }> | null;

export declare const pbsLineLegacyPropertyCodeList: readonly number[];

export declare const pbsLineAaPropertyCodeList: readonly number[];

export declare const pbsLineF8PropertyCodeList: readonly number[];

export declare const pbsLineReserveCallTypes: readonly [
  "CRAM",
  "CRPM",
  "PRAM",
  "PRMM",
  "PRPM",
  "RESA",
  "RESB",
];

export type PbsLineReserveDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };

export type PbsLineReserveFlyingDatePatternSegment =
  | {
      workType: "reserve";
      callType: string;
      dateScope: PbsLineReserveDateScope;
    }
  | {
      workType: "flying";
      dateScope: PbsLineReserveDateScope;
    };

export type PbsLineBidValue =
  | { type: "flag" }
  | { type: "date"; value: string; operator?: "=" | "<" | ">" }
  | { type: "stepper"; value: number; min?: number; max?: number; operator?: "=" | "<" | ">" }
  | { type: "stepper-range"; from: number; to: number; min?: number; max?: number }
  | { type: "stepper-date"; value: number; date: string; min?: number; max?: number; operator?: "=" | "<" | ">" }
  | { type: "stepper-range-date"; from: number; to: number; date: string; min?: number; max?: number }
  | { type: "stepper-date-range"; value: number; from: string; to: string; min?: number; max?: number }
  | { type: "days-off-on-pattern"; minDaysOff: number; minDaysOn: number; maxDaysOn: number; dateRange?: { from: string; to: string } | null; min?: number; max?: number }
  | { type: "credit-density-preference"; minimumTotalCredit: string; maximumWorkingDays: number; strength: "normal" | "strong" | "must_try" }
  | { type: "minimum-base-layover"; minimumDuration: string }
  | {
      type: "credit-window-preference";
      direction: PbsLineCreditWindowPreferenceDirection;
    }
  | { type: "time"; value: string; operator?: "=" | "<" | ">" }
  | { type: "time-range"; from: string; to: string }
  | { type: "time-date"; value: string; date: string; operator?: "=" | "<" | ">" }
  | { type: "time-range-date"; from: string; to: string; date: string }
  | { type: "date-range"; from: string; to: string }
  | { type: "select"; value: string; options: string[] }
  | { type: "reserve-call-type-date-scope"; callType: string; options: string[]; dateScope: PbsLineReserveDateScope }
  | {
      type: "reserve-flying-date-pattern";
      segments: PbsLineReserveFlyingDatePatternSegment[];
      callTypeOptions: string[];
      strength: "normal" | "strong" | "must_try";
    }
  | { type: "tag-list"; values: string[]; suggestions?: string[] }
  | { type: "tag-list-date"; values: string[]; date: string; suggestions?: string[] }
  | { type: "crew-days-off-share"; employeeNumber: string; minimumDays: number; min?: number; max?: number }
  | {
      type: "employee-schedule-preference";
      crewId: string;
      crewName?: string;
      relationship: "together" | "apart";
      scheduleType: "work" | "days_off";
      thresholdType: "minimum" | "maximum";
      days: number;
      min?: number;
      max?: number;
    }
  | { type: "percent"; value: string; operator?: "=" | "<" | ">" }
  | { type: "percent-range"; from: string; to: string }
  | { type: "text"; value: string };

export type PbsLinePropertyDefinition = {
  propertyCode: number;
  name: string;
  defaultBid: PbsLineBidValue;
  defaultAction?: PbsLineBidAction | null;
  supportedActions?: readonly PbsLineBidAction[];
};

export type PbsLineBidAction = "award" | "avoid";

export type PbsLineCreditWindowPreferenceDirection = "more" | "less";

export type PbsLineCreditWindowConfig = {
  available: true;
  deltaHours: number;
} | {
  available: false;
};

export type PbsLineMinimumBaseLayoverConfig = {
  available: true;
  minDuration: string;
} | {
  available: false;
};

export declare const pbsLinePropertyCatalog: readonly PbsLinePropertyDefinition[];

export declare const pbsLineF8PropertyCatalog: readonly PbsLinePropertyDefinition[];

export declare const pbsLineAaPropertyCatalog: readonly PbsLinePropertyDefinition[];

export declare const pbsLineReservePropertyCatalog: readonly PbsLinePropertyDefinition[];

export declare const pbsSupportedLinePropertyCatalog: readonly PbsLinePropertyDefinition[];

export declare const pbsLegacyLinePropertyCatalog: readonly PbsLinePropertyDefinition[];

export type PbsLineDraftProperty = {
  propertyGroupKey?: string;
  rowSeq: number;
  propertyCode: number;
  name: string;
  action?: PbsLineBidAction | null;
  bid: PbsLineBidValue;
  tiers: string[];
};

export type PbsLineDraftDocument = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
  bidContext: "Current";
  remarks?: string;
  properties: PbsLineDraftProperty[];
};

export type PbsLineCurrentDraftResponse = {
  currentPeriod?: PbsCurrentPeriod;
  draft: PbsLineDraftDocument;
  propertyCatalog: PbsLinePropertyDefinition[];
  favoriteProperties: PbsLineFavoriteProperty[];
  recommendedPropertyCodes: number[];
};

export type PbsSaveLineCurrentDraftRequest = {
  draft: PbsLineDraftDocument;
};

export type PbsAddLineCurrentPropertyRequest = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  bidContext: "Current";
  draftVersion: number;
  remarks?: string;
  property: Omit<PbsLineDraftProperty, "propertyGroupKey" | "rowSeq">;
};

export type PbsLineDraftMutationResponse = {
  saved: true;
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  periodCode?: string;
  draftVersion?: number;
};

export type PbsLineDraftPropertyMutationResponse = PbsLineDraftMutationResponse & {
  propertyGroupKey: string;
  rowSeq: number;
};

export type PbsPatchLineCurrentPropertyRequest = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  bidContext: "Current";
  draftVersion: number;
  remarks?: string;
  property: Omit<PbsLineDraftProperty, "propertyGroupKey" | "rowSeq">;
};

export type PbsPatchLineCurrentPropertyResponse = PbsLineDraftMutationResponse & {
  propertyGroupKey: string;
  tiers: string[];
};

export type PbsLineCurrentPropertyMutationReference = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  draftVersion: number;
};

export type PbsSaveLineConfiguredFavoritePropertyRequest = PbsLineCurrentPropertyMutationReference & {
  property: Omit<PbsLineDraftProperty, "propertyGroupKey" | "rowSeq" | "tiers">;
};

export type PbsPatchLineConfiguredFavoritePropertyRequest = PbsSaveLineConfiguredFavoritePropertyRequest;

export type PbsLineFavoriteProperty = {
  favoriteKey: string;
  propertyId: number;
  propertyCode: number;
  name: string;
  action?: PbsLineBidAction | null;
  bid: PbsLineBidValue;
};

export type PbsLineFavoriteMutationResponse = PbsLineDraftMutationResponse
  & Pick<PbsLineDraftDocument, "draftKey" | "bidId" | "periodId">
  & PbsLineFavoriteProperty;
