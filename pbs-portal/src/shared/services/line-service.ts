import {
  pbsLineBidRoutes,
  type PbsAddLineCurrentPropertyRequest,
  type PbsLineBidValue,
  type PbsLineCreditWindowConfig,
  type PbsLineCurrentDraftResponse,
  type PbsLineDraftMutationResponse,
  type PbsLineDraftPropertyMutationResponse,
  type PbsLineFavoriteMutationResponse,
  type PbsLineMinimumBaseLayoverConfig,
  type PbsPatchLineCurrentPropertyRequest,
  type PbsPatchLineCurrentPropertyResponse,
  type PbsPatchLineConfiguredFavoritePropertyRequest,
  type PbsSaveLineConfiguredFavoritePropertyRequest,
  type PbsSaveLineCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-line-bids.js";
import { mapExistingPropertiesToLineDraftDocument, mapLineDraftResponseToPageData } from "@/features/line/line-draft-mappers";
import {
  getLineBidDisplayName,
  getLineBidPersistenceName,
} from "@/features/line/mixed-line-bid";
import type {
  RuleBidAvailableProperty,
  RuleBidConfiguredFavoriteProperty,
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import { requireCurrentRuleBidContext } from "@/features/rule-bids/draft-context";
import { request } from "@/shared/services/request";

type LineDraftMeta = RuleBidRightPanelData["draftMeta"];
type LineDraftMutationFields = Pick<
  PbsAddLineCurrentPropertyRequest,
  "draftKey" | "bidId" | "periodCode" | "bidContext" | "draftVersion"
>;
type LinePropertyInput = RuleBidAvailableProperty | RuleBidExistingProperty;
type LineDraftPropertyPayload = PbsAddLineCurrentPropertyRequest["property"];

const buildLineDraftMutationFields = (draftMeta: LineDraftMeta): LineDraftMutationFields => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  bidContext: requireCurrentRuleBidContext(draftMeta.bidContext, "Line Bid"),
  draftVersion: draftMeta.draftVersion,
});

const buildLineDraftDeleteParams = (
  draftMeta: LineDraftMeta,
): Record<string, string | number | undefined> => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  draftVersion: draftMeta.draftVersion,
});

const mapLineBidValueToMutationBid = (bid: LinePropertyInput["bid"]): PbsLineBidValue => {
  if (bid.type === "flight-legs-per-duty") {
    throw new Error("Flight Legs per Duty bids are not valid for Line.");
  }

  if (bid.type === "pairing-occurrence-list") {
    throw new Error("Pairing occurrence bids are not valid for Line.");
  }

  if (bid.type === "pairing-id-list") {
    throw new Error("Pairing ID bids are not valid for Line.");
  }

  if (bid.type === "time-condition-list") {
    throw new Error("Pairing time condition bids are not valid for Line.");
  }

  if (bid.type === "duration" || bid.type === "duration-range") {
    throw new Error("Pairing duration bids are not valid for Line.");
  }

  if (bid.type === "date-or-dow-list") {
    throw new Error("Pairing date or day bids are not valid for Line.");
  }

  if (bid.type === "work-day-preference") {
    throw new Error("Work Day Preference bids are not valid for Line.");
  }

  if (bid.type === "percent-or-duration") {
    throw new Error("Pairing percent or duration bids are not valid for Line.");
  }

  if (bid.type === "airport-preference") {
    throw new Error("Pairing airport preference bids are not valid for Line.");
  }

  if (bid.type === "pairing-preference") {
    throw new Error("Pairing preference bids are not valid for Line.");
  }

  if (bid.type === "pairing-check-time") {
    throw new Error("Pairing check-time bids are not valid for Line.");
  }

  if (bid.type === "pairing-length-preference") {
    throw new Error("Pairing length bids are not valid for Line.");
  }

  if (bid.type === "flight-number-preference") {
    throw new Error("Flight number preference bids are not valid for Line.");
  }

  if (bid.type === "redeye-preference") {
    throw new Error("Redeye preference bids are not valid for Line.");
  }

  if (bid.type === "month-end-carryover") {
    throw new Error("Month-End Carryover bids are not valid for Line.");
  }

  if (bid.type === "deadhead-flying") {
    throw new Error("Deadhead Flying bids are not valid for Line.");
  }

  if (bid.type === "efficient-flying-preference") {
    throw new Error("Efficient Flying First bids are not valid for Line.");
  }

  if (bid.type === "tag-list") {
    return {
      type: "tag-list",
      values: [...bid.values],
    };
  }

  if (bid.type === "tag-list-date") {
    return {
      type: "tag-list-date",
      values: [...bid.values],
      date: bid.date,
    };
  }

  if (bid.type === "select") {
    return {
      ...bid,
      options: [...bid.options],
    };
  }

  return { ...bid };
};

const mapLineAvailablePropertyToDraftProperty = (
  property: LinePropertyInput,
): LineDraftPropertyPayload => ({
  propertyCode: property.propertyCode,
  name: getLineBidPersistenceName(property),
  action: property.action ?? null,
  bid: mapLineBidValueToMutationBid(property.bid),
  tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
});

const buildLineAddPropertyPayload = (
  property: RuleBidAvailableProperty,
  draftMeta: LineDraftMeta,
): PbsAddLineCurrentPropertyRequest => ({
  ...buildLineDraftMutationFields(draftMeta),
  remarks: draftMeta.remarks,
  property: mapLineAvailablePropertyToDraftProperty(property),
});

const buildLinePatchPropertyPayload = (
  property: RuleBidExistingProperty,
  draftMeta: LineDraftMeta,
): PbsPatchLineCurrentPropertyRequest => ({
  ...buildLineDraftMutationFields(draftMeta),
  remarks: draftMeta.remarks,
  property: mapLineAvailablePropertyToDraftProperty(property),
});

export const lineService = {
  async getCurrentDraft(): Promise<PbsLineCurrentDraftResponse> {
    return request.get<PbsLineCurrentDraftResponse>(pbsLineBidRoutes.current);
  },

  async getCreditWindowConfig(): Promise<PbsLineCreditWindowConfig> {
    return request.get<PbsLineCreditWindowConfig>(pbsLineBidRoutes.creditWindowConfig);
  },

  async getMinimumBaseLayoverConfig(): Promise<PbsLineMinimumBaseLayoverConfig> {
    return request.get<PbsLineMinimumBaseLayoverConfig>(pbsLineBidRoutes.minimumBaseLayoverConfig);
  },

  async getPageData(): Promise<RuleBidPageData> {
    const response = await lineService.getCurrentDraft();
    return mapLineDraftResponseToPageData(response);
  },

  async saveCurrentDraft(
    existingProperties: RuleBidExistingProperty[],
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ): Promise<PbsLineCurrentDraftResponse> {
    const payload: PbsSaveLineCurrentDraftRequest = {
      draft: mapExistingPropertiesToLineDraftDocument(existingProperties, draftMeta),
    };

    return request.put<PbsLineCurrentDraftResponse, PbsSaveLineCurrentDraftRequest>(
      pbsLineBidRoutes.current,
      payload,
    );
  },

  async addCurrentDraftProperty(
    property: RuleBidAvailableProperty,
    draftMeta: LineDraftMeta,
  ): Promise<PbsLineDraftPropertyMutationResponse> {
    const payload = buildLineAddPropertyPayload(property, draftMeta);

    return request.post<PbsLineDraftPropertyMutationResponse, PbsAddLineCurrentPropertyRequest>(
      pbsLineBidRoutes.currentProperties,
      payload,
    );
  },

  async removeCurrentDraftProperty(
    propertyGroupKey: string,
    draftMeta: LineDraftMeta,
  ): Promise<PbsLineDraftMutationResponse> {
    return request.delete<PbsLineDraftMutationResponse>(
      pbsLineBidRoutes.currentPropertyByKey(propertyGroupKey),
      {
        params: buildLineDraftDeleteParams(draftMeta),
      },
    );
  },

  async patchCurrentDraftProperty(
    propertyGroupKey: string,
    property: RuleBidExistingProperty,
    draftMeta: LineDraftMeta,
  ): Promise<PbsPatchLineCurrentPropertyResponse> {
    const payload = buildLinePatchPropertyPayload(property, draftMeta);

    return request.patch<PbsPatchLineCurrentPropertyResponse, PbsPatchLineCurrentPropertyRequest>(
      pbsLineBidRoutes.currentPropertyByKey(propertyGroupKey),
      payload,
    );
  },

  async favoriteProperty(
    property: RuleBidAvailableProperty,
    draftMeta: LineDraftMeta,
  ): Promise<PbsLineDraftMutationResponse & RuleBidConfiguredFavoriteProperty> {
    return lineService.saveConfiguredFavoriteProperty(property, draftMeta);
  },

  async saveConfiguredFavoriteProperty(
    property: RuleBidAvailableProperty,
    draftMeta: LineDraftMeta,
  ): Promise<PbsLineDraftMutationResponse & RuleBidConfiguredFavoriteProperty> {
    const payload: PbsSaveLineConfiguredFavoritePropertyRequest = {
      ...buildLineDraftMutationFields(draftMeta),
      property: (() => {
        const { tiers, ...favoriteProperty } = mapLineAvailablePropertyToDraftProperty(property);
        void tiers;
        return favoriteProperty;
      })(),
    };

    const response = await request.post<PbsLineFavoriteMutationResponse, PbsSaveLineConfiguredFavoritePropertyRequest>(
      pbsLineBidRoutes.currentFavorites,
      payload,
    );

    return {
      ...response,
      favoriteKey: response.favoriteKey,
      propertyId: response.propertyId,
      propertyCode: response.propertyCode,
      name: getLineBidDisplayName(response),
      action: response.action ?? property.action ?? null,
      bid: response.bid,
    };
  },

  async patchFavoriteProperty(
    favoriteKey: string,
    property: RuleBidAvailableProperty,
    draftMeta: LineDraftMeta,
  ): Promise<PbsLineDraftMutationResponse & RuleBidConfiguredFavoriteProperty> {
    const payload: PbsPatchLineConfiguredFavoritePropertyRequest = {
      ...buildLineDraftMutationFields(draftMeta),
      property: (() => {
        const { tiers, ...favoriteProperty } = mapLineAvailablePropertyToDraftProperty(property);
        void tiers;
        return favoriteProperty;
      })(),
    };
    const response = await request.patch<PbsLineFavoriteMutationResponse, PbsPatchLineConfiguredFavoritePropertyRequest>(
      pbsLineBidRoutes.favoriteByKey(favoriteKey),
      payload,
    );

    return {
      ...response,
      favoriteKey: response.favoriteKey,
      propertyId: response.propertyId,
      propertyCode: response.propertyCode,
      name: getLineBidDisplayName(response),
      action: response.action ?? property.action ?? null,
      bid: response.bid,
    };
  },

  async unfavoriteProperty(
    favoriteKey: string,
    draftMeta: LineDraftMeta,
  ): Promise<PbsLineDraftMutationResponse> {
    return request.delete<PbsLineDraftMutationResponse>(
      pbsLineBidRoutes.favoriteByKey(favoriteKey),
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
};
