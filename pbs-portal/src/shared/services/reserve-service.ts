import {
  pbsReserveBidRoutes,
  type PbsAddReserveCurrentPropertyRequest,
  type PbsReserveBidValue,
  type PbsReserveCoverageResponse,
  type PbsReserveCurrentDraftResponse,
  type PbsReserveDraftMutationResponse,
  type PbsReserveDraftPropertyMutationResponse,
  type PbsReserveMode,
  type PbsPatchReserveCurrentPropertyRequest,
  type PbsPatchReserveCurrentPropertyResponse,
  type PbsSaveReserveCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import { mapExistingPropertiesToReserveDraftDocument, mapReserveDraftResponseToPageData } from "@/features/reserve/reserve-draft-mappers";
import { requireCurrentRuleBidContext } from "@/features/rule-bids/draft-context";
import type { RuleBidAvailableProperty, RuleBidExistingProperty, RuleBidPageData, RuleBidRightPanelData } from "@/features/rule-bids/types";
import { request } from "@/shared/services/request";

type ReserveDraftMeta = RuleBidRightPanelData["draftMeta"];
type ReserveDraftMutationFields = Pick<
  PbsAddReserveCurrentPropertyRequest,
  "draftKey" | "bidId" | "periodCode" | "bidContext" | "draftVersion"
>;
type ReservePropertyInput = RuleBidAvailableProperty | RuleBidExistingProperty;
type ReserveDraftPropertyPayload = PbsAddReserveCurrentPropertyRequest["property"];

const buildReserveDraftMutationFields = (draftMeta: ReserveDraftMeta): ReserveDraftMutationFields => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  bidContext: requireCurrentRuleBidContext(draftMeta.bidContext, "Reserve Bid"),
  draftVersion: draftMeta.draftVersion,
});

const buildReserveDraftDeleteParams = (
  draftMeta: ReserveDraftMeta,
): Record<string, string | number | undefined> => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  draftVersion: draftMeta.draftVersion,
});

const mapReserveBidValueToMutationBid = (bid: ReservePropertyInput["bid"]): PbsReserveBidValue => {
  if (bid.type === "select") {
    return {
      ...bid,
      options: [...bid.options],
    };
  }

  if (bid.type === "tag-list") {
    return {
      type: "tag-list",
      values: [...bid.values],
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    };
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return {
      ...bid,
      options: [...bid.options],
      dateScope: bid.dateScope.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : { ...bid.dateScope },
    };
  }

  throw new Error("Unsupported Reserve bid value.");
};

const mapReservePropertyToDraftProperty = (
  property: ReservePropertyInput,
): ReserveDraftPropertyPayload => ({
  propertyCode: property.propertyCode,
  name: property.name,
  bid: mapReserveBidValueToMutationBid(property.bid),
  tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
});

const buildReserveAddPropertyPayload = (
  property: RuleBidAvailableProperty,
  draftMeta: ReserveDraftMeta,
): PbsAddReserveCurrentPropertyRequest => ({
  ...buildReserveDraftMutationFields(draftMeta),
  remarks: draftMeta.remarks,
  property: mapReservePropertyToDraftProperty(property),
});

const buildReservePatchPropertyPayload = (
  property: RuleBidExistingProperty,
  draftMeta: ReserveDraftMeta,
): PbsPatchReserveCurrentPropertyRequest => ({
  ...buildReserveDraftMutationFields(draftMeta),
  remarks: draftMeta.remarks,
  property: mapReservePropertyToDraftProperty(property),
});

export const reserveService = {
  async getCurrentDraft(): Promise<PbsReserveCurrentDraftResponse> {
    return request.get<PbsReserveCurrentDraftResponse>(pbsReserveBidRoutes.current);
  },

  async getCoverage(): Promise<PbsReserveCoverageResponse> {
    return request.get<PbsReserveCoverageResponse>(pbsReserveBidRoutes.currentCoverage);
  },

  async getPageData(): Promise<RuleBidPageData> {
    const response = await reserveService.getCurrentDraft();
    return mapReserveDraftResponseToPageData(response);
  },

  async saveCurrentDraft(
    existingProperties: RuleBidExistingProperty[],
    draftMeta: RuleBidRightPanelData["draftMeta"],
    mode: PbsReserveMode = "legacy",
  ): Promise<PbsReserveCurrentDraftResponse> {
    const payload: PbsSaveReserveCurrentDraftRequest = {
      draft: mapExistingPropertiesToReserveDraftDocument(existingProperties, draftMeta, mode),
    };

    return request.put<PbsReserveCurrentDraftResponse, PbsSaveReserveCurrentDraftRequest>(
      pbsReserveBidRoutes.current,
      payload,
    );
  },

  async addCurrentDraftProperty(
    property: RuleBidAvailableProperty,
    draftMeta: ReserveDraftMeta,
  ): Promise<PbsReserveDraftPropertyMutationResponse> {
    const payload = buildReserveAddPropertyPayload(property, draftMeta);

    return request.post<PbsReserveDraftPropertyMutationResponse, PbsAddReserveCurrentPropertyRequest>(
      pbsReserveBidRoutes.currentProperties,
      payload,
    );
  },

  async removeCurrentDraftProperty(
    propertyGroupKey: string,
    draftMeta: ReserveDraftMeta,
  ): Promise<PbsReserveDraftMutationResponse> {
    return request.delete<PbsReserveDraftMutationResponse>(
      pbsReserveBidRoutes.currentPropertyByKey(propertyGroupKey),
      {
        params: buildReserveDraftDeleteParams(draftMeta),
      },
    );
  },

  async patchCurrentDraftProperty(
    propertyGroupKey: string,
    property: RuleBidExistingProperty,
    draftMeta: ReserveDraftMeta,
  ): Promise<PbsPatchReserveCurrentPropertyResponse> {
    const payload = buildReservePatchPropertyPayload(property, draftMeta);

    return request.patch<PbsPatchReserveCurrentPropertyResponse, PbsPatchReserveCurrentPropertyRequest>(
      pbsReserveBidRoutes.currentPropertyByKey(propertyGroupKey),
      payload,
    );
  },
};
