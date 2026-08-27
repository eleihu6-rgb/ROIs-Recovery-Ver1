import type { PbsCurrentPeriod } from "./pbs-current-period.js";

export declare const pbsPairingBidRoutes: {
  readonly current: "/pairing-bids/current";
  readonly currentProperties: "/pairing-bids/current/properties";
  readonly currentPropertyByKey: (propertyGroupKey: string) => string;
  readonly currentFavorites: "/pairing-bids/current/favorites";
  readonly referenceOptions: "/pairing-bids/reference-options";
  readonly efficientFlyingConfig: "/pairing-bids/efficient-flying-config";
  readonly redeyeConfig: "/pairing-bids/redeye-config";
  readonly favoriteByKey: (favoriteKey: number | string) => string;
};

export type PbsPairingBidAction = "award" | "avoid";
export type PbsPairingBidOperator = "=" | "<" | ">" | "Between" | "In";
export type PbsPairingBidQuantifier = "any" | "every";
export type PbsPairingCreditPriority = "higher" | "lower";
export type PbsPairingDayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export type PbsWorkDayPreferenceWindow = {
  dayOfWeek: PbsPairingDayOfWeek;
  checkInFrom: string | null;
  checkInTo: string | null;
};
export type PbsPairingPropertyUsage = "multi" | "single";
export type PbsPairingRuleConflictType = "duplicate" | "single-use";
export type PbsPairingForcedOrRule =
  | "odan-pairing-length"
  | "one-day-layover-city"
  | "one-day-avoid-layover-city"
  | "one-day-minimum-layover-time"
  | "one-day-maximum-layover-time";

export type PbsPairingTimeCondition =
  | { operator: "=" | "<" | ">"; value: string }
  | { operator: "Between"; from: string; to: string };

export type PbsPairingEventDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };
export type PbsPairingAirportPreferenceDateScope = PbsPairingEventDateScope;

export type PbsPairingAirportPreferenceLocation = {
  code: string;
  kind: "airport" | "city";
};

export type PbsPairingAirportPreferenceBid = {
  type: "airport-preference";
  event: "landing" | "layover" | "landing_or_layover";
  locations: PbsPairingAirportPreferenceLocation[];
  dateScope?: PbsPairingAirportPreferenceDateScope | null;
  minimumLayoverDuration?: string | null;
};

export type PbsPairingPreferenceBid = {
  type: "pairing-preference";
  pairingIds: string[];
  pairingLabels?: string[];
};

export type PbsEfficientFlyingPreferenceBid = {
  type: "efficient-flying-preference";
  mode: "efficient" | "inefficient";
};

export type PbsEfficientFlyingConfig = {
  percentile: number;
};

export type PbsPairingCheckTimeDateScope = PbsPairingEventDateScope;

export type PbsPairingCheckTimeBid =
  | {
      type: "pairing-check-time";
      timeType: "check_in" | "check_out";
      operator: "=" | "<" | ">";
      value: string;
      dateScope?: PbsPairingCheckTimeDateScope | null;
    }
  | {
      type: "pairing-check-time";
      timeType: "check_in" | "check_out";
      operator: "Between";
      from: string;
      to: string;
      dateScope?: PbsPairingCheckTimeDateScope | null;
    };

export type PbsFlightLegsPerDutyBid =
  | {
      type: "flight-legs-per-duty";
      operator: "=" | "<" | ">";
      legs: number;
      dateScope?: PbsPairingEventDateScope | null;
    }
  | {
      type: "flight-legs-per-duty";
      operator: "Between";
      from: number;
      to: number;
      dateScope?: PbsPairingEventDateScope | null;
    };

export type PbsWorkDayPreferenceBid = {
  type: "work-day-preference";
  days: PbsWorkDayPreferenceWindow[];
  dateScope?: PbsPairingEventDateScope | null;
};

export type PbsPairingLengthDateScope = PbsPairingEventDateScope;

export type PbsPairingLengthBid = {
  type: "pairing-length-preference";
  minDays: number | null;
  maxDays: number | null;
  dateScope?: PbsPairingLengthDateScope | null;
  min?: number;
  max?: number;
};

export declare const formatPbsPairingLengthSummary: (input: {
  action: PbsPairingBidAction;
  minDays: number | null;
  maxDays: number | null;
  dateScope?: PbsPairingLengthDateScope | null;
}) => string | null;

export type PbsMonthEndCarryoverBid =
  | {
      type: "month-end-carryover";
      operator: "<" | "=" | ">";
      days: number | null;
    }
  | {
      type: "month-end-carryover";
      operator: "Between";
      from: number | null;
      to: number | null;
    };

export type PbsDeadheadFlyingBid = {
  type: "deadhead-flying";
  mode: "any-deadhead" | "deadhead-only-duty";
  dateScope?: PbsPairingEventDateScope | null;
};

export type PbsFlightNumberPreferenceDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };

export type PbsFlightNumberPreferenceBid = {
  type: "flight-number-preference";
  flightNumbers: string[];
  dateScope?: PbsFlightNumberPreferenceDateScope | null;
};

export type PbsRedeyePreferenceDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };

export type PbsRedeyePreferenceBid = {
  type: "redeye-preference";
  dateScope?: PbsRedeyePreferenceDateScope | null;
};

export type PbsPairingReserveDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };

export type PbsPairingReserveFlyingDatePatternSegment =
  | { workType: "reserve"; callType: string; dateScope: PbsPairingReserveDateScope }
  | { workType: "flying"; dateScope: PbsPairingReserveDateScope };

export type PbsPairingBidValue =
  | { type: "flag" }
  | { type: "date"; value: string; operator?: Exclude<PbsPairingBidOperator, "Between" | "In"> }
  | { type: "stepper"; value: number; min?: number; max?: number; operator?: Exclude<PbsPairingBidOperator, "Between" | "In"> }
  | { type: "stepper-range"; from: number; to: number; min?: number; max?: number }
  | { type: "stepper-date"; value: number; date: string; min?: number; max?: number; operator?: Exclude<PbsPairingBidOperator, "Between" | "In"> }
  | { type: "stepper-range-date"; from: number; to: number; date: string; min?: number; max?: number }
  | { type: "stepper-date-range"; value: number; from: string; to: string; min?: number; max?: number }
  | PbsPairingLengthBid
  | PbsMonthEndCarryoverBid
  | PbsDeadheadFlyingBid
  | PbsFlightNumberPreferenceBid
  | PbsRedeyePreferenceBid
  | { type: "days-off-on-pattern"; minDaysOff: number; minDaysOn: number; maxDaysOn: number; min?: number; max?: number }
  | { type: "credit-density-preference"; minimumTotalCredit: string; maximumWorkingDays: number; strength: "normal" | "strong" | "must_try" }
  | { type: "credit-window-preference"; direction: "more" | "less" }
  | { type: "time"; value: string; operator?: Exclude<PbsPairingBidOperator, "Between" | "In"> }
  | { type: "time-range"; from: string; to: string }
  | { type: "time-condition-list"; conditions: PbsPairingTimeCondition[] }
  | { type: "duration"; value: string; operator?: Exclude<PbsPairingBidOperator, "Between" | "In">; creditPriority?: PbsPairingCreditPriority }
  | { type: "duration-range"; from: string; to: string; creditPriority?: PbsPairingCreditPriority }
  | { type: "time-date"; value: string; date: string; operator?: Exclude<PbsPairingBidOperator, "Between" | "In"> }
  | { type: "time-range-date"; from: string; to: string; date: string }
  | { type: "date-range"; from: string; to: string }
  | { type: "date-or-dow-list"; dates: string[]; daysOfWeek: PbsPairingDayOfWeek[] }
  | PbsPairingAirportPreferenceBid
  | PbsPairingPreferenceBid
  | PbsEfficientFlyingPreferenceBid
  | PbsPairingCheckTimeBid
  | PbsFlightLegsPerDutyBid
  | PbsWorkDayPreferenceBid
  | { type: "select"; value: string; options: string[] }
  | { type: "reserve-call-type-date-scope"; callType: string; options: string[]; dateScope: PbsPairingReserveDateScope }
  | {
      type: "reserve-flying-date-pattern";
      segments: PbsPairingReserveFlyingDatePatternSegment[];
      callTypeOptions: string[];
      strength: "normal" | "strong" | "must_try";
    }
  | { type: "tag-list"; values: string[]; suggestions?: string[] }
  | { type: "tag-list-date"; values: string[]; date: string; suggestions?: string[] }
  | { type: "pairing-id-list"; pairingIds: string[]; pairingLabels?: string[] }
  | { type: "pairing-occurrence-list"; occurrences: PbsPairingOccurrenceBidItem[]; suggestions?: string[] }
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
  | { type: "percent"; value: string; operator?: Exclude<PbsPairingBidOperator, "Between" | "In"> }
  | { type: "percent-range"; from: string; to: string }
  | { type: "percent-or-duration"; unit: "percent" | "duration"; value: string; operator?: ">" | "<"; creditPriority?: PbsPairingCreditPriority }
  | { type: "text"; value: string };

export type PbsPairingOccurrenceBidItem = {
  pairingNumber: string;
  originDate: string;
  pairingId: string;
  occurrenceId?: string;
};

export type PbsPairingPropertyDefinition = {
  propertyCode: number;
  name: string;
  defaultBid: PbsPairingBidValue;
  defaultAction?: PbsPairingBidAction;
  supportedActions?: readonly PbsPairingBidAction[];
  supportedOperators?: readonly PbsPairingBidOperator[];
  supportedQuantifiers?: readonly PbsPairingBidQuantifier[];
  defaultQuantifier?: PbsPairingBidQuantifier;
  numericBounds?: { min: number; max: number };
};

export declare const pbsPairingPropertyCatalog: readonly PbsPairingPropertyDefinition[];
export declare const pbsPairingF8PropertyCodes: {
  readonly efficientFlyingFirst: 428;
};
export declare const pbsPairingCreditPriorityPropertyCodes: readonly number[];
export declare const isPbsPairingCreditPriorityProperty: (propertyCode: number) => boolean;
export declare const pbsPairingPropertyUsages: {
  readonly multi: "multi";
  readonly single: "single";
};
export declare const pbsPairingPropertyUsageByCode: Readonly<Record<number, PbsPairingPropertyUsage>>;

export type PbsPairingDraftProperty = {
  propertyGroupKey?: string;
  rowSeq: number;
  propertyCode: number;
  name: string;
  action?: PbsPairingBidAction | null;
  quantifier?: PbsPairingBidQuantifier | null;
  bid: PbsPairingBidValue;
  tiers: string[];
};

export type PbsPairingRuleTierInput = string | {
  key?: string;
  label?: string;
  active?: boolean;
};

export type PbsPairingRulePropertyInput = {
  id?: string;
  propertyGroupKey?: string;
  propertyCode: number;
  name: string;
  action?: PbsPairingBidAction | null;
  quantifier?: PbsPairingBidQuantifier | null;
  bid: PbsPairingBidValue;
  tiers: readonly PbsPairingRuleTierInput[];
};

export type PbsPairingRuleConflict = {
  type: PbsPairingRuleConflictType;
  tier: string;
  propertyCode: number;
  propertyName: string;
};

export declare const getPbsPairingPropertyUsage: (propertyCode: number) => PbsPairingPropertyUsage;
export declare const normalizePbsPairingBidValueForRules: (bid: PbsPairingBidValue) => unknown;
export declare const serializePbsPairingBidValueForRules: (bid: PbsPairingBidValue) => string;
export declare const buildPbsPairingConditionSignature: (property: PbsPairingRulePropertyInput) => string;
export declare const getPbsPairingActiveTierLabels: (property: PbsPairingRulePropertyInput) => string[];
export declare const findPbsPairingRuleConflict: (
  existingProperties: readonly PbsPairingRulePropertyInput[],
  candidateProperty: PbsPairingRulePropertyInput,
) => PbsPairingRuleConflict | null;
export declare const findPbsPairingRuleConflictInProperties: (
  properties: readonly PbsPairingRulePropertyInput[],
) => PbsPairingRuleConflict | null;
export declare const getPbsPairingForcedOrRule: (
  leftProperty: PbsPairingRulePropertyInput,
  rightProperty: PbsPairingRulePropertyInput,
) => PbsPairingForcedOrRule | null;

export type PbsPairingDraftDocument = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
  bidContext: "Current";
  remarks?: string;
  properties: PbsPairingDraftProperty[];
};

export type PbsPairingCurrentDraftResponse = {
  currentPeriod?: PbsCurrentPeriod;
  draft: PbsPairingDraftDocument;
  propertyCatalog: PbsPairingPropertyDefinition[];
  favoriteProperties: PbsPairingFavoriteProperty[];
  recommendedPropertyCodes: number[];
};

export type PbsSavePairingCurrentDraftRequest = {
  draft: PbsPairingDraftDocument;
};

export type PbsAddPairingCurrentPropertyRequest = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  bidContext: "Current";
  draftVersion: number;
  remarks?: string;
  property: Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq">;
};

export type PbsPairingDraftMutationResponse = {
  saved: true;
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  periodCode?: string;
  draftVersion?: number;
};

export type PbsPairingDraftPropertyMutationResponse = PbsPairingDraftMutationResponse & {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  propertyGroupKey: string;
  rowSeq: number;
};

export type PbsPatchPairingCurrentPropertyRequest = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  bidContext: "Current";
  draftVersion: number;
  property: Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq">;
};

export type PbsPatchPairingCurrentPropertyResponse = PbsPairingDraftMutationResponse & {
  propertyGroupKey: string;
  deleted: boolean;
  tiers: string[];
};

export type PbsPairingCurrentPropertyMutationReference = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  draftVersion: number;
};

export type PbsPairingFavoriteProperty = {
  favoriteKey: string;
  propertyId: number;
  propertyCode: number;
  name: string;
  action?: PbsPairingBidAction | null;
  quantifier?: PbsPairingBidQuantifier | null;
  bid: PbsPairingBidValue;
};

export type PbsSavePairingFavoritePropertyRequest = PbsPairingCurrentPropertyMutationReference & {
  property: Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq" | "tiers">;
};

export type PbsPatchPairingFavoritePropertyRequest = PbsSavePairingFavoritePropertyRequest;

export type PbsPairingFavoriteMutationResponse = PbsPairingDraftMutationResponse
  & Pick<PbsPairingDraftDocument, "draftKey" | "bidId" | "periodId">
  & PbsPairingFavoriteProperty;

export type PbsPairingFavoritePropertiesResponse = {
  favoritePropertyCodes: number[];
};

export type PbsPairingAirportOption = {
  code: string;
  name: string | null;
  icao: string | null;
  abbr: string | null;
  city: string;
};

export type PbsPairingCityOption = {
  code: string;
};

export type PbsPairingReferenceOptionsResponse = {
  airports: PbsPairingAirportOption[];
  cities: PbsPairingCityOption[];
};
