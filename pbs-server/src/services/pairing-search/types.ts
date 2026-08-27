import type { Pool } from "pg";
import type {
  PbsPairingAirportOptionsResponse,
  PbsTimeBetweenFlightsBoundsResponse,
  PbsPairingDateOccurrencesResponse,
  PbsPairingCurrentRulesCountsRequest,
  PbsPairingCurrentRulesCountsResponse,
  PbsPairingTierPoolsRequest,
  PbsPairingTierPoolsResponse,
  PbsPairingDetailsRequest,
  PbsPairingDetailsResponse,
  PbsCrewIdSearchResponse,
  PbsFlightNumberSearchType,
  PbsFlightNumberSearchResponse,
  PbsPairingIdSearchResponse,
  PbsPairingNumberFilterOptionsResponse,
  PbsPairingOccurrencesResponse,
  PbsSearchPairingsPreviewRequest,
  PbsSearchPairingsPreviewResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsCache } from "../../utils/cache.js";

export type PairingSearchActor = {
  crewId: string;
  userCode: string;
  isAdmin?: boolean;
};

export type PbsPairingFeedbackBatchItem = {
  pairing: {
    pairingId: string;
    pairingNumber: string;
    rank: string;
    base: string;
    zoneId: string;
    originDate: string;
    endDate: string;
    routeLabel: string;
    reportTime: string;
    releaseTime: string;
    durationDays: number;
    tafbDays: number | null;
    totalCredit: string;
  };
  matchedPropertyKeys: string[];
};

export type PbsPairingFeedbackResolvedContext = {
  period: {
    rosterPeriodId: number;
    rosterPeriodKey: string;
    periodCode: string;
    rpStartLocal: string;
    rpEndLocal: string;
  };
  actor?: {
    base: string | null;
    rank?: string | null;
    zoneId: string | null;
  };
};

export interface PbsPairingSearchService {
  matchFeedbackPairings: (
    actor: PairingSearchActor,
    request: {
      rosterPeriodId: number;
      periodCode: string;
      properties: Array<{ key: string; property: PbsPairingDraftProperty }>;
      resolvedContext?: PbsPairingFeedbackResolvedContext;
    },
  ) => Promise<PbsPairingFeedbackBatchItem[]>;
  previewPairings: (
    actor: PairingSearchActor,
    request: PbsSearchPairingsPreviewRequest,
  ) => Promise<PbsSearchPairingsPreviewResponse>;
  countCurrentRules: (
    actor: PairingSearchActor,
    request: PbsPairingCurrentRulesCountsRequest,
  ) => Promise<PbsPairingCurrentRulesCountsResponse>;
  countCurrentRuleTierPools: (
    actor: PairingSearchActor,
    request: PbsPairingTierPoolsRequest,
  ) => Promise<PbsPairingTierPoolsResponse>;
  getPairingDetails: (
    actor: PairingSearchActor,
    request: PbsPairingDetailsRequest,
  ) => Promise<PbsPairingDetailsResponse>;
  searchPairingIds: (
    actor: PairingSearchActor,
    request: {
      rosterPeriodId: number;
      query?: string;
      limit?: number;
      periodCode?: string;
    },
  ) => Promise<PbsPairingIdSearchResponse>;
  getPairingNumberFilterOptions: (
    actor: PairingSearchActor,
    request: {
      rosterPeriodId: number;
      periodCode: string;
      query?: string;
      cursor?: string;
      limit?: number;
    },
  ) => Promise<PbsPairingNumberFilterOptionsResponse>;
  searchCrewIds: (
    actor: PairingSearchActor,
    request: {
      query?: string;
      limit?: number;
    },
  ) => Promise<PbsCrewIdSearchResponse>;
  searchFlightNumbers: (
    actor: PairingSearchActor,
    request: {
      query?: string;
      limit?: number;
      type?: PbsFlightNumberSearchType;
    },
  ) => Promise<PbsFlightNumberSearchResponse>;
  searchPairingOccurrences: (
    actor: PairingSearchActor,
    request: {
      pairingId: string;
      rosterPeriodId: number;
      periodCode: string;
    },
  ) => Promise<PbsPairingOccurrencesResponse>;
  searchPairingOccurrencesByDate: (
    actor: PairingSearchActor,
    request: {
      originDate: string;
      rosterPeriodId: number;
      periodCode: string;
    },
  ) => Promise<PbsPairingDateOccurrencesResponse>;
  getAirportOptions: (
    actor: PairingSearchActor,
    request: { rosterPeriodId: number; periodCode?: string | null },
  ) => Promise<PbsPairingAirportOptionsResponse>;
  getTimeBetweenFlightsBounds: (
    actor: PairingSearchActor,
    request: { rosterPeriodId: number; periodCode?: string | null },
  ) => Promise<PbsTimeBetweenFlightsBoundsResponse>;
}

export type CreatePbsPairingSearchServiceOptions = {
  pgPool: Pool;
  liveSchema: string;
  pbsSchema: string;
  cache?: PbsCache;
};
