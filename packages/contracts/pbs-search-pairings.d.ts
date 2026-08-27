import type {
  PbsPairingBidAction,
  PbsPairingBidQuantifier,
  PbsPairingBidValue,
  PbsPairingDraftProperty,
} from "./pbs-pairing-bids.js";

export declare const pbsSearchPairingRoutes: {
  readonly preview: "/pairing-search/preview";
  readonly currentRulesCounts: "/pairing-search/current-rules/counts";
  readonly currentRulesTierPools: "/pairing-search/current-rules/tier-pools";
  readonly pairingIds: "/pairing-search/pairing-ids";
  readonly pairingNumberFilterOptions: "/pairing-search/pairing-number-filter-options";
  readonly crewIds: "/pairing-search/crew-ids";
  readonly flightNumbers: "/pairing-search/flight-numbers";
  readonly pairingOccurrences: "/pairing-search/pairing-occurrences";
  readonly pairingOccurrencesByDate: "/pairing-search/pairing-occurrences/by-date";
  readonly pairingDetails: "/pairing-search/pairing-details";
  readonly airportOptions: "/pairing-search/airport-options";
  readonly timeBetweenFlightsBounds: "/pairing-search/time-between-flights-bounds";
};

export declare const pbsFlightNumberSearchTypes: readonly [
  "charter",
  "positioning-charter-network",
  "recovery-charter-network",
];

export type PbsFlightNumberSearchType = typeof pbsFlightNumberSearchTypes[number];

export type PbsPairingAirportPreferenceOption = {
  code: string;
  kind: "airport" | "city";
  label: string;
  events: Array<"landing" | "layover">;
};

export type PbsAirportPreferenceLayoverHoursConfig = {
  minHours: number;
  maxHours: number;
  stepHours: number;
  defaultHours: number;
};

export type PbsPairingAirportOptionsResponse = {
  airportPreferenceLayoverHours: PbsAirportPreferenceLayoverHoursConfig;
  airportPreferenceOptions: PbsPairingAirportPreferenceOption[];
  filterAirports: string[];
  landingAirports: string[];
  layoverAirports: string[];
  workStartStations: string[];
};

export type PbsTimeBetweenFlightsBoundsResponse = {
  minimumMinutes: number;
  maximumMinutes: number | null;
};

export type PbsPairingIdOption = {
  value: string;
  label: string;
  pairingId: string;
  pairingLabel: string;
  startDate: string | null;
  endDate: string | null;
};

export type PbsPairingIdSearchResponse = {
  query: string;
  rosterPeriodId: number;
  periodCode?: string;
  limit: number;
  options: PbsPairingIdOption[];
};

export type PbsPairingNumberFilterOption = {
  value: string;
  label: string;
};

export type PbsPairingNumberFilterOptionsResponse = {
  query: string;
  rosterPeriodId: number;
  periodCode: string;
  limit: number;
  options: PbsPairingNumberFilterOption[];
  nextCursor: string | null;
  totalCount: number;
};

export type PbsCrewIdOption = {
  value: string;
  label: string;
  crewId: string;
  firstName: string | null;
  lastName: string | null;
};

export type PbsCrewIdSearchResponse = {
  query: string;
  limit: number;
  options: PbsCrewIdOption[];
};

export declare const pbsUserRoutes: {
  readonly crewOptions: "/pbs-users/crew-options";
};

export type PbsUserCrewOption = {
  value: string;
  label: string;
  crewId: string;
  userName: string;
  userCode: string;
  base: string | null;
  rank: string | null;
  division: string | null;
};

export type PbsUserCrewOptionsResponse = {
  query: string;
  limit: number;
  options: PbsUserCrewOption[];
};

export type PbsFlightNumberOption = {
  value: string;
  label: string;
};

export type PbsFlightNumberSearchResponse = {
  query: string;
  limit: number;
  options: PbsFlightNumberOption[];
};

export type PbsPairingOccurrence = {
  occurrenceId: string;
  pairingNumber: string;
  pairingId: string;
  originDate: string;
  startDate: string;
  endDate: string;
  startLocal?: string;
  endLocal?: string;
  label: string;
};

export type PbsPairingOccurrencesResponse = {
  pairingNumber: string;
  rosterPeriodId: number;
  periodCode: string;
  occurrences: PbsPairingOccurrence[];
};

export type PbsPairingDateOccurrencesResponse = {
  originDate: string;
  rosterPeriodId: number;
  periodCode: string;
  occurrences: PbsPairingOccurrence[];
};

export type PbsPairingDetailTarget = {
  pairingId: string;
  originDate?: string;
};

export type PbsPairingDetailsRequest = {
  rosterPeriodId: number;
  periodCode?: string;
  targets: PbsPairingDetailTarget[];
};

export type PbsPairingSearchPreviewProperty = {
  propertyCode: number;
  name: string;
  action?: PbsPairingBidAction | null;
  quantifier?: PbsPairingBidQuantifier | null;
  bid: PbsPairingBidValue;
};

export type PbsSearchPairingsPreviewFilters = {
  pairingScope?: "fly";
  pairingNumber?: string;
  pairingNumbers?: string[];
  originDateFrom?: string;
  originDateTo?: string;
  airport?: string;
  airports?: string[];
  timeFrom?: string;
  timeTo?: string;
  query?: string;
  releaseTimeFrom?: string;
  releaseTimeTo?: string;
  durationDaysMin?: number;
  durationDaysMax?: number;
  creditMinutesMin?: number;
  creditMinutesMax?: number;
  layoverAirports?: string[];
  layoverCountMin?: number;
  layoverCountMax?: number;
  hasRedeye?: true;
  hasDeadhead?: true;
};

export type PbsSearchPairingsPreviewRequest = {
  rosterPeriodId: number;
  periodCode?: string;
  preview:
    | {
        property: PbsPairingSearchPreviewProperty;
        page?: number;
        pageSize?: number;
      }
    | {
        mode: "current_rules";
        tier: string;
        properties: PbsPairingDraftProperty[];
        page?: number;
        pageSize?: number;
      }
    | {
        mode: "criteria";
        properties: PbsPairingDraftProperty[];
        page?: number;
        pageSize?: number;
      }
    | {
        mode: "all_pairings";
        page?: number;
        pageSize?: number;
        filters?: PbsSearchPairingsPreviewFilters;
      };
};

export type PbsPairingCurrentRulesCountsRequest = {
  rosterPeriodId: number;
  periodCode?: string;
  tier: string;
  properties: PbsPairingDraftProperty[];
};

export type PbsPairingPoolCountValue = {
  pairingIdCount: number;
  totalItems: number;
};

export type PbsPairingCurrentRulesCountRow = {
  propertyGroupKey: string;
  rowSeq: number;
  propertyCode: number;
  name: string;
  rule: PbsPairingPoolCountValue;
  funnel: PbsPairingPoolCountValue;
};

export type PbsPairingCurrentRulesCountsResponse = {
  mode: "current_rules_counts";
  periodCode?: string;
  tier: string;
  computedAt: string;
  summary: {
    activePropertyCount: number;
    allRules: PbsPairingPoolCountValue | null;
  };
  rows: PbsPairingCurrentRulesCountRow[];
};

export type PbsPairingTierPoolsRequest = {
  rosterPeriodId: number;
  periodCode?: string;
  tiers: string[];
  properties: PbsPairingDraftProperty[];
};

export type PbsPairingTierPoolStatus =
  | "success"
  | "no_pairing_rules"
  | "error";

export type PbsPairingTierPoolRow = {
  tier: string;
  activePropertyCount: number;
  txSet: PbsPairingPoolCountValue | null;
  totalPairings: PbsPairingPoolCountValue | null;
  pairingsByTx: PbsPairingPoolCountValue | null;
  status: PbsPairingTierPoolStatus;
  message?: string;
};

export type PbsPairingTierPoolsResponse = {
  mode: "current_rules_tier_pools";
  periodCode?: string;
  computedAt: string;
  packageTotal: PbsPairingPoolCountValue;
  rows: PbsPairingTierPoolRow[];
};

export type PbsSearchPairingsLeg = {
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

export type PbsSearchPairingsResult = {
  id: string;
  pairingId: string;
  pairingNumber: string;
  base: string;
  originDate: string;
  endDate: string;
  startDateLabel?: string;
  endDateLabel: string;
  compositionLabel?: string;
  reportTime: string;
  releaseTime: string;
  durationDays: number;
  routeLabel: string;
  priorityLabel: string;
  prioritySequence: string;
  totalBlock: string;
  totalCredit: string;
  totalDp?: string;
  totalPay: string;
  legs: PbsSearchPairingsLeg[];
  activeDates: string[];
};

export type PbsPairingDetailsResponse = {
  results: PbsSearchPairingsResult[];
};

export type PbsSearchPairingsPreviewResponse = {
  mode?: "single_property_preview" | "current_rules_preview" | "criteria_preview" | "all_pairings_preview";
  summary: {
    pairingIdCount: number;
    totalItems: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  results: PbsSearchPairingsResult[];
} & (
  | {
      mode: "single_property_preview";
      property: PbsPairingSearchPreviewProperty;
    }
  | {
      mode: "current_rules_preview";
      tier: string;
      properties: PbsPairingDraftProperty[];
    }
  | {
      mode: "criteria_preview";
      properties: PbsPairingDraftProperty[];
    }
  | {
      mode: "all_pairings_preview";
    }
);
