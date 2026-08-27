import type { PbsCurrentPeriod } from "./pbs-current-period.js";
import type { PbsPreferOffConfig } from "./pbs-prefer-off.js";

export declare const pbsDaysOffBidRoutes: {
  readonly current: "/days-off-bids/current";
  readonly currentProperties: "/days-off-bids/current/properties";
  readonly currentPropertyByKey: (propertyGroupKey: string) => string;
  readonly currentFavorites: "/days-off-bids/current/favorites";
  readonly favoriteByCode: (propertyCode: number | string) => string;
  readonly favoriteByKey: (favoriteKey: number | string) => string;
};

export declare const pbsDaysOffAaPropertyCodes: {
  readonly minimumDaysOffBetweenWorkBlocks: 211;
  readonly maximizeWeekendDaysOff: 212;
  readonly maximizeTotalDaysOff: 213;
  readonly maximizeBlockOfDaysOff: 214;
  readonly stringOfDaysOffStartingOnDate: 215;
  readonly stringOfDaysOffEndingOnDate: 216;
  readonly waiveMinimumDaysOff: 217;
};

export declare const pbsDaysOffStandingPropertyCodes: {
  readonly dayOfWeekOff: 218;
};

export declare const pbsDaysOffAaPropertyCodeList: readonly [211, 212, 213, 214, 215, 216, 217];

export declare const pbsDaysOffMutuallyExclusivePropertyCodes: readonly [212, 213, 214, 215, 216];

export declare const pbsDaysOffUniquePerTierPropertyCodes: readonly [211, 215, 216];

export type PbsDaysOffReserveDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };

export type PbsDaysOffReserveFlyingDatePatternSegment =
  | { workType: "reserve"; callType: string; dateScope: PbsDaysOffReserveDateScope }
  | { workType: "flying"; dateScope: PbsDaysOffReserveDateScope };

export type PbsDaysOffBidValue =
  | { type: "flag" }
  | { type: "date"; value: string; operator?: "=" | "<" | ">" }
  | { type: "stepper"; value: number; min?: number; max?: number; operator?: "=" | "<" | ">" }
  | { type: "stepper-range"; from: number; to: number; min?: number; max?: number }
  | { type: "stepper-date"; value: number; date: string; min?: number; max?: number; operator?: "=" | "<" | ">" }
  | { type: "stepper-range-date"; from: number; to: number; date: string; min?: number; max?: number }
  | { type: "stepper-date-range"; value: number; from: string; to: string; min?: number; max?: number }
  | { type: "days-off-on-pattern"; minDaysOff: number; minDaysOn: number; maxDaysOn: number; dateRange?: { from: string; to: string } | null; min?: number; max?: number }
  | { type: "credit-density-preference"; minimumTotalCredit: string; maximumWorkingDays: number; strength: "normal" | "strong" | "must_try" }
  | { type: "time"; value: string; operator?: "=" | "<" | ">" }
  | { type: "time-range"; from: string; to: string }
  | { type: "time-date"; value: string; date: string; operator?: "=" | "<" | ">" }
  | { type: "time-range-date"; from: string; to: string; date: string }
  | { type: "date-range"; from: string; to: string }
  | {
      type: "date-or-dow-list";
      dates: string[];
      daysOfWeek: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
    }
  | { type: "select"; value: string; options: string[] }
  | { type: "reserve-call-type-date-scope"; callType: string; options: string[]; dateScope: PbsDaysOffReserveDateScope }
  | {
      type: "reserve-flying-date-pattern";
      segments: PbsDaysOffReserveFlyingDatePatternSegment[];
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

export type PbsDaysOffPropertyDefinition = {
  propertyCode: number;
  name: string;
  defaultBid: PbsDaysOffBidValue;
};

export declare const pbsDaysOffPropertyCatalog: readonly PbsDaysOffPropertyDefinition[];
export declare const pbsDaysOffAaPropertyCatalog: readonly PbsDaysOffPropertyDefinition[];
export declare const pbsLegacyDaysOffPropertyCatalog: readonly PbsDaysOffPropertyDefinition[];
export declare const pbsSupportedDaysOffPropertyCatalog: readonly PbsDaysOffPropertyDefinition[];
export declare const pbsDaysOffPropertyRegistry: readonly PbsDaysOffPropertyDefinition[];

export type PbsDaysOffDraftProperty = {
  propertyGroupKey?: string;
  rowSeq: number;
  propertyCode: number;
  name: string;
  action?: "award" | "avoid" | null;
  bid: PbsDaysOffBidValue;
  tiers: string[];
  allOrNothing?: boolean;
  minimumN?: number | null;
  maximumN?: number | null;
};

export type PbsDaysOffDraftDocument = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
  bidContext: "Current";
  remarks?: string;
  properties: PbsDaysOffDraftProperty[];
};

export type PbsDaysOffCurrentDraftResponse = {
  currentPeriod?: PbsCurrentPeriod;
  preferOffConfig?: PbsPreferOffConfig;
  draft: PbsDaysOffDraftDocument;
  propertyCatalog: PbsDaysOffPropertyDefinition[];
  favoriteProperties: PbsDaysOffFavoriteProperty[];
  recommendedPropertyCodes: number[];
};

export type PbsSaveDaysOffCurrentDraftRequest = {
  draft: PbsDaysOffDraftDocument;
};

export type PbsDaysOffCurrentPropertyMutationReference = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  draftVersion: number;
};

export type PbsDaysOffPropertyMutationPayload = {
  action?: "award" | "avoid" | null;
  bid: PbsDaysOffBidValue;
  tiers: string[];
  allOrNothing?: boolean;
  minimumN?: number | null;
  maximumN?: number | null;
};

export type PbsAddDaysOffCurrentPropertyRequest = PbsDaysOffCurrentPropertyMutationReference
  & PbsDaysOffPropertyMutationPayload
  & {
    propertyCode: number;
    remarks?: string;
  };

export type PbsDaysOffDraftMutationResponse = {
  saved: true;
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  periodCode?: string;
  draftVersion?: number;
};

export type PbsDaysOffDraftPropertyMutationResponse = PbsDaysOffDraftMutationResponse & {
  propertyGroupKey: string;
  rowSeq: number;
};

export type PbsPutDaysOffCurrentPropertyRequest = PbsDaysOffCurrentPropertyMutationReference
  & PbsDaysOffPropertyMutationPayload;

export type PbsLegacyDaysOffCurrentPropertyMutationRequest = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  bidContext: "Current";
  draftVersion: number;
  property: Omit<PbsDaysOffDraftProperty, "propertyGroupKey" | "rowSeq">;
};

export type PbsPatchDaysOffCurrentPropertyRequest =
  | PbsPutDaysOffCurrentPropertyRequest
  | PbsLegacyDaysOffCurrentPropertyMutationRequest;

export type PbsPatchDaysOffCurrentPropertyResponse = PbsDaysOffDraftMutationResponse & {
  propertyGroupKey: string;
  tiers: string[];
};

export type PbsSaveDaysOffFavoritePropertyRequest = PbsDaysOffCurrentPropertyMutationReference
  & Omit<PbsDaysOffPropertyMutationPayload, "tiers">
  & {
    propertyCode: number;
  };

export type PbsPatchDaysOffFavoritePropertyRequest = PbsSaveDaysOffFavoritePropertyRequest;

export type PbsDaysOffFavoriteProperty = {
  favoriteKey: string;
  propertyId: number;
  propertyCode: number;
  name: string;
  action?: "award" | "avoid" | null;
  bid: PbsDaysOffBidValue;
  allOrNothing?: boolean;
  minimumN?: number | null;
  maximumN?: number | null;
};

export type PbsDaysOffFavoriteMutationResponse = PbsDaysOffDraftMutationResponse
  & Pick<PbsDaysOffDraftDocument, "draftKey" | "bidId" | "periodId">
  & PbsDaysOffFavoriteProperty;
