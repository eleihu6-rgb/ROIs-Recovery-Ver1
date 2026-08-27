import {
  pbsPairingBidRoutes,
  type PbsAddPairingCurrentPropertyRequest,
  type PbsPairingDraftMutationResponse,
  type PbsPairingDraftPropertyMutationResponse,
  type PbsPatchPairingCurrentPropertyRequest,
  type PbsPatchPairingCurrentPropertyResponse,
  type PbsPairingFavoriteMutationResponse,
  type PbsSavePairingFavoritePropertyRequest,
  type PbsPairingCurrentDraftResponse,
  type PbsPairingReferenceOptionsResponse,
  type PbsEfficientFlyingConfig,
  type PbsPatchPairingFavoritePropertyRequest,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";
import {
  pbsSearchPairingRoutes,
  type PbsCrewIdSearchResponse,
  type PbsFlightNumberSearchType,
  type PbsPairingDetailTarget,
  type PbsPairingDetailsRequest,
  type PbsPairingDetailsResponse,
  type PbsFlightNumberSearchResponse,
  type PbsPairingDateOccurrencesResponse,
  type PbsPairingCurrentRulesCountsRequest,
  type PbsPairingCurrentRulesCountsResponse,
  type PbsPairingTierPoolsRequest,
  type PbsPairingTierPoolsResponse,
  type PbsPairingIdSearchResponse,
  type PbsPairingNumberFilterOptionsResponse,
  type PbsPairingOccurrencesResponse,
  type PbsSearchPairingsPreviewFilters,
  type PbsSearchPairingsPreviewRequest,
  type PbsSearchPairingsPreviewResponse,
  type PbsPairingAirportOptionsResponse,
  type PbsTimeBetweenFlightsBoundsResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  mapPairingDraftResponseToPageData,
  mapPairingPropertyToDraftProperty,
} from "@/features/pairing/pairing-draft-mappers";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingPageData,
  PairingRightPanelData,
  PairingSearchCriteriaItem,
  PairingSearchPreviewProperty,
} from "@/features/pairing/types";
import { request } from "@/shared/services/request";

export type PairingSearchPeriodReference = {
  rosterPeriodId: number;
  periodCode?: string | null;
};

const normalizePairingSearchPeriod = (
  period: PairingSearchPeriodReference,
): { rosterPeriodId: number; periodCode?: string } => {
  if (!Number.isInteger(period.rosterPeriodId) || period.rosterPeriodId <= 0) {
    throw new Error("A valid roster period is required for pairing search.");
  }

  return {
    rosterPeriodId: period.rosterPeriodId,
    ...(period.periodCode?.trim() ? { periodCode: period.periodCode.trim() } : {}),
  };
};

const normalizePreviewFilters = (
  filters?: PbsSearchPairingsPreviewFilters,
): PbsSearchPairingsPreviewFilters | undefined => {
  if (!filters) {
    return undefined;
  }

  const normalizedFilters = Object.fromEntries(
    Object.entries(filters)
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? [...new Set(value
            .map((item) => typeof item === "string" ? item.trim().toUpperCase() : "")
            .filter((item) => item.length > 0))]
          : typeof value === "string"
          ? key === "query"
            ? value.trim().replace(/\s+/g, " ").toUpperCase()
            : value.trim()
          : value,
      ])
      .filter(([, value]) => value !== undefined
        && (typeof value !== "string" || value.length > 0)
        && (!Array.isArray(value) || value.length > 0)),
  ) as PbsSearchPairingsPreviewFilters;

  return Object.keys(normalizedFilters).length > 0 ? normalizedFilters : undefined;
};

type PairingDraftMeta = PairingRightPanelData["draftMeta"];
type PairingDraftMutationFields = Pick<
  PbsAddPairingCurrentPropertyRequest,
  "draftKey" | "bidId" | "periodCode" | "bidContext" | "draftVersion"
>;

const buildPairingDraftMutationFields = (draftMeta: PairingDraftMeta): PairingDraftMutationFields => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  bidContext: draftMeta.bidContext,
  draftVersion: draftMeta.draftVersion,
});

const buildPairingDraftDeleteParams = (
  draftMeta: PairingDraftMeta,
): Record<string, string | number | undefined> => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  draftVersion: draftMeta.draftVersion,
});

const buildPairingAddPropertyPayload = (
  property: PairingAvailableProperty | PairingSearchCriteriaItem,
  draftMeta: PairingDraftMeta,
): PbsAddPairingCurrentPropertyRequest => ({
  ...buildPairingDraftMutationFields(draftMeta),
  remarks: draftMeta.remarks,
  property: mapPairingPropertyToDraftProperty(property),
});

const buildPairingPatchPropertyPayload = (
  property: PairingExistingProperty,
  draftMeta: PairingDraftMeta,
): PbsPatchPairingCurrentPropertyRequest => ({
  ...buildPairingDraftMutationFields(draftMeta),
  property: mapPairingPropertyToDraftProperty(property),
});

const buildPairingFavoritePropertyPayload = (
  property: PairingAvailableProperty | PairingSearchCriteriaItem,
  draftMeta: PairingDraftMeta,
): PbsSavePairingFavoritePropertyRequest => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  draftVersion: draftMeta.draftVersion,
  property: (() => {
    const { tiers, ...favoriteProperty } = mapPairingPropertyToDraftProperty(property);
    void tiers;
    return favoriteProperty;
  })(),
});

export const pairingService = {
  async getCurrentDraft(): Promise<PbsPairingCurrentDraftResponse> {
    return request.get<PbsPairingCurrentDraftResponse>(pbsPairingBidRoutes.current);
  },

  async getPageData(): Promise<PairingPageData> {
    const response = await pairingService.getCurrentDraft();
    return mapPairingDraftResponseToPageData(response);
  },

  async getReferenceOptions(): Promise<PbsPairingReferenceOptionsResponse> {
    return request.get<PbsPairingReferenceOptionsResponse>(pbsPairingBidRoutes.referenceOptions);
  },

  async getEfficientFlyingConfig(): Promise<PbsEfficientFlyingConfig> {
    return request.get<PbsEfficientFlyingConfig>(pbsPairingBidRoutes.efficientFlyingConfig);
  },

  async getRedeyeConfig(): Promise<PbsRedeyeDefinition> {
    return request.get<PbsRedeyeDefinition>(pbsPairingBidRoutes.redeyeConfig);
  },

  async addCurrentDraftProperty(
    property: PairingAvailableProperty | PairingSearchCriteriaItem,
    draftMeta: PairingDraftMeta,
  ): Promise<PbsPairingDraftPropertyMutationResponse> {
    const payload = buildPairingAddPropertyPayload(property, draftMeta);

    return request.post<PbsPairingDraftPropertyMutationResponse, PbsAddPairingCurrentPropertyRequest>(
      pbsPairingBidRoutes.currentProperties,
      payload,
    );
  },

  async removeCurrentDraftProperty(
    propertyGroupKey: string,
    draftMeta: PairingDraftMeta,
  ): Promise<PbsPairingDraftMutationResponse> {
    return request.delete<PbsPairingDraftMutationResponse>(
      pbsPairingBidRoutes.currentPropertyByKey(propertyGroupKey),
      {
        params: buildPairingDraftDeleteParams(draftMeta),
      },
    );
  },

  async patchCurrentDraftProperty(
    propertyGroupKey: string,
    property: PairingExistingProperty,
    draftMeta: PairingDraftMeta,
  ): Promise<PbsPatchPairingCurrentPropertyResponse> {
    const payload = buildPairingPatchPropertyPayload(property, draftMeta);

    return request.patch<PbsPatchPairingCurrentPropertyResponse, PbsPatchPairingCurrentPropertyRequest>(
      pbsPairingBidRoutes.currentPropertyByKey(propertyGroupKey),
      payload,
    );
  },

  async saveConfiguredFavoriteProperty(
    property: PairingAvailableProperty | PairingSearchCriteriaItem,
    draftMeta: PairingDraftMeta,
  ): Promise<PbsPairingFavoriteMutationResponse> {
    const payload = buildPairingFavoritePropertyPayload(property, draftMeta);

    return request.post<PbsPairingFavoriteMutationResponse, PbsSavePairingFavoritePropertyRequest>(
      pbsPairingBidRoutes.currentFavorites,
      payload,
    );
  },

  async patchFavoriteProperty(
    favoriteKey: string,
    property: PairingAvailableProperty | PairingSearchCriteriaItem,
    draftMeta: PairingDraftMeta,
  ): Promise<PbsPairingFavoriteMutationResponse> {
    const payload = buildPairingFavoritePropertyPayload(property, draftMeta);

    return request.patch<PbsPairingFavoriteMutationResponse, PbsPatchPairingFavoritePropertyRequest>(
      pbsPairingBidRoutes.favoriteByKey(favoriteKey),
      payload,
    );
  },

  async unfavoriteProperty(
    favoriteKey: string,
    draftMeta: PairingDraftMeta,
  ): Promise<PbsPairingDraftMutationResponse> {
    return request.delete<PbsPairingDraftMutationResponse>(
      pbsPairingBidRoutes.favoriteByKey(favoriteKey),
      {
        params: {
          draftKey: draftMeta.draftKey,
          bidId: draftMeta.bidId,
          periodCode: draftMeta.periodCode,
          draftVersion: draftMeta.draftVersion,
        },
      },
    );
  },

  async previewCurrentRules(
    tier: string,
    existingProperties: PairingExistingProperty[],
    page = 1,
    pageSize = 30,
    period: PairingSearchPeriodReference,
  ): Promise<PbsSearchPairingsPreviewResponse> {
    const payload: PbsSearchPairingsPreviewRequest = {
      ...normalizePairingSearchPeriod(period),
      preview: {
        mode: "current_rules",
        tier,
        properties: existingProperties.map((property, index) => ({
          propertyGroupKey: property.id,
          rowSeq: index + 1,
          ...mapPairingPropertyToDraftProperty(property),
        })),
        page,
        pageSize,
      },
    };

    return request.post<PbsSearchPairingsPreviewResponse, PbsSearchPairingsPreviewRequest>(
      pbsSearchPairingRoutes.preview,
      payload,
    );
  },

  async countCurrentRules(
    tier: string,
    existingProperties: PairingExistingProperty[],
    period: PairingSearchPeriodReference,
  ): Promise<PbsPairingCurrentRulesCountsResponse> {
    const payload: PbsPairingCurrentRulesCountsRequest = {
      ...normalizePairingSearchPeriod(period),
      tier,
      properties: existingProperties.map((property, index) => ({
        propertyGroupKey: property.id,
        rowSeq: index + 1,
        ...mapPairingPropertyToDraftProperty(property),
      })),
    };

    return request.post<PbsPairingCurrentRulesCountsResponse, PbsPairingCurrentRulesCountsRequest>(
      pbsSearchPairingRoutes.currentRulesCounts,
      payload,
    );
  },

  async countCurrentRuleTierPools(
    tiers: string[],
    existingProperties: PairingExistingProperty[],
    period: PairingSearchPeriodReference,
  ): Promise<PbsPairingTierPoolsResponse> {
    const payload: PbsPairingTierPoolsRequest = {
      ...normalizePairingSearchPeriod(period),
      tiers,
      properties: existingProperties.map((property, index) => ({
        propertyGroupKey: property.id,
        rowSeq: index + 1,
        ...mapPairingPropertyToDraftProperty(property),
      })),
    };

    return request.post<PbsPairingTierPoolsResponse, PbsPairingTierPoolsRequest>(
      pbsSearchPairingRoutes.currentRulesTierPools,
      payload,
    );
  },

  async searchPairingIds(
    query: string,
    period: PairingSearchPeriodReference,
    limit = 20,
  ): Promise<PbsPairingIdSearchResponse> {
    const normalizedPeriod = normalizePairingSearchPeriod(period);
    return request.get<PbsPairingIdSearchResponse>(
      pbsSearchPairingRoutes.pairingIds,
      {
        params: {
          query,
          limit,
          ...normalizedPeriod,
        },
      },
    );
  },

  async getPairingNumberFilterOptions(
    period: PairingSearchPeriodReference,
    query = "",
    cursor?: string,
    limit = 30,
    signal?: AbortSignal,
  ): Promise<PbsPairingNumberFilterOptionsResponse> {
    const normalizedPeriod = normalizePairingSearchPeriod(period);
    return request.get<PbsPairingNumberFilterOptionsResponse>(
      pbsSearchPairingRoutes.pairingNumberFilterOptions,
      {
        params: {
          ...normalizedPeriod,
          query: query.trim(),
          limit,
          cursor,
        },
        signal,
      },
    );
  },

  async searchCrewIds(
    query: string,
    limit = 20,
  ): Promise<PbsCrewIdSearchResponse> {
    return request.get<PbsCrewIdSearchResponse>(
      pbsSearchPairingRoutes.crewIds,
      {
        params: {
          query,
          limit,
        },
      },
    );
  },

  async searchFlightNumbers(
    query: string,
    limit = 20,
    type?: PbsFlightNumberSearchType,
  ): Promise<PbsFlightNumberSearchResponse> {
    return request.get<PbsFlightNumberSearchResponse>(
      pbsSearchPairingRoutes.flightNumbers,
      {
        params: {
          query,
          limit,
          ...(type ? { type } : {}),
        },
      },
    );
  },

  async getTimeBetweenFlightsBounds(
    period: PairingSearchPeriodReference,
  ): Promise<PbsTimeBetweenFlightsBoundsResponse> {
    return request.get<PbsTimeBetweenFlightsBoundsResponse>(
      pbsSearchPairingRoutes.timeBetweenFlightsBounds,
      {
        params: normalizePairingSearchPeriod(period),
      },
    );
  },

  async searchPairingOccurrences(
    pairingId: string,
    period: PairingSearchPeriodReference,
  ): Promise<PbsPairingOccurrencesResponse> {
    return request.get<PbsPairingOccurrencesResponse>(
      pbsSearchPairingRoutes.pairingOccurrences,
      {
        params: {
          pairingId,
          ...normalizePairingSearchPeriod(period),
        },
      },
    );
  },

  async searchPairingOccurrencesByDate(
    originDate: string,
    period: PairingSearchPeriodReference,
  ): Promise<PbsPairingDateOccurrencesResponse> {
    return request.get<PbsPairingDateOccurrencesResponse>(
      pbsSearchPairingRoutes.pairingOccurrencesByDate,
      {
        params: {
          originDate,
          ...normalizePairingSearchPeriod(period),
        },
      },
    );
  },

  async getPairingDetails(
    period: PairingSearchPeriodReference,
    targets: PbsPairingDetailTarget[],
  ): Promise<PbsPairingDetailsResponse> {
    const payload: PbsPairingDetailsRequest = {
      ...normalizePairingSearchPeriod(period),
      targets,
    };

    return request.post<PbsPairingDetailsResponse, PbsPairingDetailsRequest>(
      pbsSearchPairingRoutes.pairingDetails,
      payload,
    );
  },

  async previewCriteria(
    criteriaItems: PairingSearchCriteriaItem[],
    page = 1,
    pageSize = 30,
    period: PairingSearchPeriodReference,
  ): Promise<PbsSearchPairingsPreviewResponse> {
    const payload: PbsSearchPairingsPreviewRequest = {
      ...normalizePairingSearchPeriod(period),
      preview: {
        mode: "criteria",
        properties: criteriaItems.map((item, index) => ({
          propertyGroupKey: item.id,
          rowSeq: index + 1,
          ...mapPairingPropertyToDraftProperty(item),
          tiers: ["T1"],
        })),
        page,
        pageSize,
      },
    };

    return request.post<PbsSearchPairingsPreviewResponse, PbsSearchPairingsPreviewRequest>(
      pbsSearchPairingRoutes.preview,
      payload,
    );
  },

  async previewSingleProperty(
    property: PairingSearchPreviewProperty,
    page = 1,
    pageSize = 30,
    period: PairingSearchPeriodReference,
  ): Promise<PbsSearchPairingsPreviewResponse> {
    const payload: PbsSearchPairingsPreviewRequest = {
      ...normalizePairingSearchPeriod(period),
      preview: {
        property: {
          propertyCode: property.propertyCode,
          name: property.name,
          action: property.action,
          quantifier: property.quantifier,
          bid: property.bid,
        },
        page,
        pageSize,
      },
    };

    return request.post<PbsSearchPairingsPreviewResponse, PbsSearchPairingsPreviewRequest>(
      pbsSearchPairingRoutes.preview,
      payload,
    );
  },

  async previewAllPairings(
    page = 1,
    pageSize = 30,
    period: PairingSearchPeriodReference,
    filters?: PbsSearchPairingsPreviewFilters,
  ): Promise<PbsSearchPairingsPreviewResponse> {
    const normalizedFilters = normalizePreviewFilters(filters);
    const payload: PbsSearchPairingsPreviewRequest = {
      ...normalizePairingSearchPeriod(period),
      preview: {
        mode: "all_pairings",
        page,
        pageSize,
        ...(normalizedFilters ? { filters: normalizedFilters } : {}),
      },
    };

    return request.post<PbsSearchPairingsPreviewResponse, PbsSearchPairingsPreviewRequest>(
      pbsSearchPairingRoutes.preview,
      payload,
    );
  },

  async getAirportOptions(period: PairingSearchPeriodReference): Promise<PbsPairingAirportOptionsResponse> {
    return request.get<PbsPairingAirportOptionsResponse>(
      pbsSearchPairingRoutes.airportOptions,
      { params: normalizePairingSearchPeriod(period) },
    );
  },
};
