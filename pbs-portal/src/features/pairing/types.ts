import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import type { PbsFlightNumberSearchType } from "../../../../packages/contracts/pbs-search-pairings.js";

export type PairingTierOption = {
  key: string;
  label: string;
  active?: boolean;
};

export type PairingBidOperator = "=" | "<" | ">" | "Between" | "In";
export type PairingBidAction = "award" | "avoid";
export type PairingBidQuantifier = "any" | "every";
export type PairingCreditPriority = "higher" | "lower";
export type PairingDayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export type WorkDayPreferenceWindow = {
  dayOfWeek: PairingDayOfWeek;
  checkInFrom: string | null;
  checkInTo: string | null;
};
export type PairingTimeCondition =
  | { operator: "=" | "<" | ">"; value: string }
  | { operator: "Between"; from: string; to: string };
export type PairingEventDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };
export type PairingAirportPreferenceDateScope = PairingEventDateScope;
export type PairingAirportPreferenceLocation = {
  code: string;
  kind: "airport" | "city";
};
export type PairingAirportPreferenceBid = {
  type: "airport-preference";
  event: "landing" | "layover" | "landing_or_layover";
  locations: PairingAirportPreferenceLocation[];
  dateScope?: PairingAirportPreferenceDateScope | null;
  minimumLayoverDuration?: string | null;
};
export type PairingPreferenceBid = {
  type: "pairing-preference";
  pairingIds: string[];
  pairingLabels?: string[];
};
export type EfficientFlyingPreferenceBid = {
  type: "efficient-flying-preference";
  mode: "efficient" | "inefficient";
};
export type PairingCheckTimeDateScope = PairingEventDateScope;
export type WorkDayPreferenceBid = {
  type: "work-day-preference";
  days: WorkDayPreferenceWindow[];
  dateScope?: PairingEventDateScope | null;
};
export type PairingCheckTimeBid =
  | {
      type: "pairing-check-time";
      timeType: "check_in" | "check_out";
      operator: "=" | "<" | ">";
      value: string;
      dateScope?: PairingCheckTimeDateScope | null;
    }
  | {
      type: "pairing-check-time";
      timeType: "check_in" | "check_out";
      operator: "Between";
      from: string;
      to: string;
      dateScope?: PairingCheckTimeDateScope | null;
    };
export type FlightLegsPerDutyBid =
  | {
      type: "flight-legs-per-duty";
      operator: "=" | "<" | ">";
      legs: number;
      dateScope?: PairingEventDateScope | null;
    }
  | {
      type: "flight-legs-per-duty";
      operator: "Between";
      from: number;
      to: number;
      dateScope?: PairingEventDateScope | null;
    };
export type PairingLengthDateScope = PairingEventDateScope;
export type PairingLengthBid = {
  type: "pairing-length-preference";
  minDays: number | null;
  maxDays: number | null;
  dateScope?: PairingLengthDateScope | null;
  min?: number;
  max?: number;
};
export type MonthEndCarryoverBid =
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
export type DeadheadFlyingBid = {
  type: "deadhead-flying";
  mode: "any-deadhead" | "deadhead-only-duty";
  dateScope?: PairingEventDateScope | null;
};
export type FlightNumberPreferenceDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };
export type FlightNumberPreferenceBid = {
  type: "flight-number-preference";
  flightNumbers: string[];
  dateScope?: FlightNumberPreferenceDateScope | null;
};
export type RedeyePreferenceDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };
export type RedeyePreferenceBid = {
  type: "redeye-preference";
  dateScope?: RedeyePreferenceDateScope | null;
};
export type ReserveDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };
export type ReserveFlyingDatePatternSegment =
  | { workType: "reserve"; callType: string; dateScope: ReserveDateScope }
  | { workType: "flying"; dateScope: ReserveDateScope };

export type PairingBidValue =
  | { type: "flag" }
  | { type: "date"; value: string; operator?: Exclude<PairingBidOperator, "Between" | "In"> }
  | { type: "stepper"; value: number; min?: number; max?: number; operator?: Exclude<PairingBidOperator, "Between" | "In"> }
  | { type: "stepper-range"; from: number; to: number; min?: number; max?: number }
  | { type: "stepper-date"; value: number; date: string; min?: number; max?: number; operator?: Exclude<PairingBidOperator, "Between" | "In"> }
  | { type: "stepper-range-date"; from: number; to: number; date: string; min?: number; max?: number }
  | { type: "stepper-date-range"; value: number; from: string; to: string; min?: number; max?: number }
  | PairingLengthBid
  | MonthEndCarryoverBid
  | DeadheadFlyingBid
  | FlightNumberPreferenceBid
  | RedeyePreferenceBid
  | { type: "days-off-on-pattern"; minDaysOff: number; minDaysOn: number; maxDaysOn: number; dateRange?: { from: string; to: string } | null; min?: number; max?: number }
  | { type: "credit-density-preference"; minimumTotalCredit: string; maximumWorkingDays: number; strength: "normal" | "strong" | "must_try" }
  | { type: "credit-window-preference"; direction: "more" | "less" }
  | { type: "time"; value: string; operator?: Exclude<PairingBidOperator, "Between" | "In"> }
  | { type: "time-range"; from: string; to: string }
  | { type: "time-condition-list"; conditions: PairingTimeCondition[] }
  | { type: "duration"; value: string; operator?: Exclude<PairingBidOperator, "Between" | "In">; creditPriority?: PairingCreditPriority }
  | { type: "duration-range"; from: string; to: string; creditPriority?: PairingCreditPriority }
  | { type: "time-date"; value: string; date: string; operator?: Exclude<PairingBidOperator, "Between" | "In"> }
  | { type: "time-range-date"; from: string; to: string; date: string }
  | { type: "date-range"; from: string; to: string }
  | { type: "date-or-dow-list"; dates: string[]; daysOfWeek: PairingDayOfWeek[] }
  | PairingAirportPreferenceBid
  | PairingPreferenceBid
  | EfficientFlyingPreferenceBid
  | PairingCheckTimeBid
  | FlightLegsPerDutyBid
  | WorkDayPreferenceBid
  | { type: "select"; value: string; options: string[] }
  | { type: "reserve-call-type-date-scope"; callType: string; options: string[]; dateScope: ReserveDateScope }
  | {
      type: "reserve-flying-date-pattern";
      segments: ReserveFlyingDatePatternSegment[];
      callTypeOptions: string[];
      strength: "normal" | "strong" | "must_try";
    }
  | { type: "tag-list"; values: string[]; suggestions?: string[] }
  | { type: "tag-list-date"; values: string[]; date: string; suggestions?: string[] }
  | { type: "pairing-id-list"; pairingIds: string[]; pairingLabels?: string[] }
  | { type: "pairing-occurrence-list"; occurrences: PairingOccurrenceBidItem[]; suggestions?: string[] }
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
  | { type: "percent"; value: string; operator?: Exclude<PairingBidOperator, "Between" | "In"> }
  | { type: "percent-range"; from: string; to: string }
  | { type: "percent-or-duration"; unit: "percent" | "duration"; value: string; operator?: ">" | "<"; creditPriority?: PairingCreditPriority }
  | { type: "text"; value: string };

export type PairingOccurrenceBidItem = {
  pairingNumber: string;
  originDate: string;
  pairingId: string;
  occurrenceId?: string;
};

export type PairingBidAutocompleteOption = {
  value: string;
  label: string;
  pairingId?: string;
  pairingLabel?: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type PairingBidAutocompleteConfig = {
  queryKey: readonly unknown[];
  placeholder: string;
  emptyLabel: string;
  errorLabel: string;
  loadingLabel: string;
  minQueryLength: number;
  debounceMs: number;
  allowCustomTokens?: boolean;
  search: (
    query: string,
    options?: { type?: PbsFlightNumberSearchType },
  ) => Promise<PairingBidAutocompleteOption[]>;
};

export type PairingExistingProperty = {
  id: string;
  propertyCode: number;
  name: string;
  action: PairingBidAction | null;
  quantifier: PairingBidQuantifier | null;
  bid: PairingBidValue;
  tiers: PairingTierOption[];
  priorityOptions: string[];
  pairingNumber: string;
  pairingType: string;
  effectiveDateRange: {
    from: string;
    to: string;
  };
};

export type PairingPropertyAction = "add" | "preview";

export type PairingAvailableProperty = {
  id: string;
  favoriteKey?: string;
  propertyId?: number;
  source?: "catalog" | "favorite";
  propertyCode: number;
  name: string;
  favorited: boolean;
  recommendedSortOrder?: number;
  action: PairingBidAction | null;
  quantifier: PairingBidQuantifier | null;
  bid: PairingBidValue;
  tiers: PairingTierOption[];
  actions: PairingPropertyAction[];
  pairingNumber: string;
  pairingType: string;
  effectiveDateRange: {
    from: string;
    to: string;
  };
};

export type PairingSearchForm = {
  pairingNumber: string;
  pairingType: string;
  dateFrom: string;
  dateTo: string;
};

export type PairingRightPanelData = {
  draftMeta: {
    draftKey?: string;
    bidId?: number;
    periodId?: number | null;
    draftVersion: number;
    periodCode: string;
    bidContext: "Current";
    remarks?: string;
    currentPeriod?: PbsCurrentPeriod;
  };
  existingTitle: string;
  addSectionTitle: string;
  allPropertiesLabel: string;
  favoritedPropertiesLabel: string;
  searchPlaceholder: string;
  searchButtonLabel: string;
  existingProperties: PairingExistingProperty[];
  availableProperties: PairingAvailableProperty[];
  initialSearchForm: PairingSearchForm;
};

export type PairingPageData = {
  rightPanel: PairingRightPanelData;
};

export type PairingSearchCriteriaItem = {
  id: string;
  favoriteKey?: string;
  propertyId?: number;
  propertyCode: number;
  name: string;
  action: PairingBidAction | null;
  quantifier: PairingBidQuantifier | null;
  bid: PairingBidValue;
  tiers: PairingTierOption[];
  favorited: boolean;
  pairingNumber: string;
  pairingType: string;
  effectiveDateRange: {
    from: string;
    to: string;
  };
};

export type PairingSearchPreviewProperty = {
  favoriteKey?: string;
  propertyId?: number;
  propertyCode: number;
  name: string;
  action: PairingBidAction | null;
  quantifier: PairingBidQuantifier | null;
  bid: PairingBidValue;
  tiers?: PairingTierOption[];
  favorited?: boolean;
  pairingNumber?: string;
  pairingType?: string;
  effectiveDateRange?: {
    from: string;
    to: string;
  };
};

export type PairingSearchLocationState = {
  previewProperty?: PairingSearchPreviewProperty;
  previewSource?:
    | {
        type: "existing";
        propertyGroupKey: string;
      }
    | {
        type: "favorite";
        favoriteKey: string;
      }
    | {
        type: "catalog";
      };
  previewMode?: "current-rules" | "all-pairings";
  initialTier?: string;
  existingProperties?: PairingExistingProperty[];
  draftMeta?: PairingRightPanelData["draftMeta"];
};

export type PairingSearchResultFilters = {
  pairingNumbers?: string[];
  airports?: string[];
  originDateFrom?: string;
  originDateTo?: string;
  timeFrom?: string;
  timeTo?: string;
};

export type PairingSearchLeg = {
  id: string;
  day: number;
  dutyDate: string;
  dutyFdp: string;
  dutyFlyingHour: string;
  dutyHour: string;
  dutyCredit: string;
  flightNumber: string;
  departureStation: string;
  arrivalStation: string;
  departureTime: string;
  arrivalTime: string;
  blockTime: string;
  equipment: string;
  ganttQual?: string;
  ganttAirline?: string;
  ganttFlight?: string;
  ganttFleet?: string;
  ganttAcc?: string;
  ganttRef?: string;
  ganttDep?: string;
  ganttPickup?: string;
  ganttReport?: string;
  ganttStd?: string;
  ganttAtd?: string;
  ganttArr?: string;
  ganttSta?: string;
  ganttAta?: string;
  ganttDropoff?: string;
  ganttGroundTime?: string;
  ganttBlockHour?: string;
  ganttFlightTime?: string;
  ganttMinimumRest?: string;
  ganttDuty?: string;
};

export type PairingSearchResult = {
  id: string;
  pairingId: string;
  pairingNumber: string;
  base: string;
  startDateLabel?: string;
  compositionLabel?: string;
  reportTime: string;
  priorityLabel: string;
  prioritySequence: string;
  totalBlock: string;
  totalCredit: string;
  totalDp?: string;
  totalPay: string;
  legs: PairingSearchLeg[];
  activeDates: string[];
};

export type PairingSearchPagination = {
  totalItems: number;
  pageSizeOptions: number[];
  defaultPageSize: number;
  currentPage?: number;
};

export type PairingSearchPageData = {
  title: string;
  criteriaTitle: string;
  criteriaItems: PairingSearchCriteriaItem[];
  resultsTitle: string;
  resultSummaryText: string;
  bidThesePropertiesLabel: string;
  addMoreCriteriaLabel: string;
  pagination: PairingSearchPagination;
  results: PairingSearchResult[];
};
