import {
  type PbsAddDaysOffCurrentPropertyRequest,
  pbsDaysOffBidRoutes,
  type PbsDaysOffBidValue,
  type PbsDaysOffCurrentDraftResponse,
  type PbsDaysOffDraftMutationResponse,
  type PbsDaysOffDraftPropertyMutationResponse,
  type PbsDaysOffFavoriteMutationResponse,
  type PbsDaysOffPropertyMutationPayload,
  type PbsPatchDaysOffCurrentPropertyResponse,
  type PbsPatchDaysOffFavoritePropertyRequest,
  type PbsPutDaysOffCurrentPropertyRequest,
  type PbsSaveDaysOffFavoritePropertyRequest,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import { mapDaysOffDraftResponseToPageData } from "@/features/days-off/days-off-draft-mappers";
import type { DaysOffPageData } from "@/features/days-off/days-off-draft-mappers";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import { request } from "@/shared/services/request";

type DaysOffDraftMeta = RuleBidRightPanelData["draftMeta"];
type DaysOffDraftMutationFields = Pick<
  PbsAddDaysOffCurrentPropertyRequest,
  "draftKey" | "bidId" | "periodCode" | "draftVersion"
>;
type DaysOffPropertyInput = RuleBidAvailableProperty | RuleBidExistingProperty;

const buildDaysOffDraftMutationFields = (draftMeta: DaysOffDraftMeta): DaysOffDraftMutationFields => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  draftVersion: draftMeta.draftVersion,
});

const buildDaysOffDraftDeleteParams = (
  draftMeta: DaysOffDraftMeta,
): Record<string, string | number | undefined> => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodCode: draftMeta.periodCode,
  draftVersion: draftMeta.draftVersion,
});

const mapDaysOffBidValueToMutationBid = (bid: DaysOffPropertyInput["bid"]): PbsDaysOffBidValue => {
  if (bid.type === "flight-legs-per-duty") {
    throw new Error("Flight Legs per Duty bids are not valid for Days Off.");
  }

  if (bid.type === "pairing-occurrence-list") {
    throw new Error("Pairing occurrence bids are not valid for Days Off.");
  }

  if (bid.type === "pairing-id-list") {
    throw new Error("Pairing ID bids are not valid for Days Off.");
  }

  if (bid.type === "time-condition-list") {
    throw new Error("Pairing time condition bids are not valid for Days Off.");
  }

  if (bid.type === "duration" || bid.type === "duration-range") {
    throw new Error("Pairing duration bids are not valid for Days Off.");
  }

  if (bid.type === "date-or-dow-list") {
    throw new Error("Pairing date or day bids are not valid for Days Off.");
  }

  if (bid.type === "work-day-preference") {
    throw new Error("Work Day Preference bids are not valid for Days Off.");
  }

  if (bid.type === "percent-or-duration") {
    throw new Error("Pairing percent or duration bids are not valid for Days Off.");
  }

  if (bid.type === "airport-preference") {
    throw new Error("Pairing airport preference bids are not valid for Days Off.");
  }

  if (bid.type === "pairing-preference") {
    throw new Error("Pairing preference bids are not valid for Days Off.");
  }

  if (bid.type === "pairing-check-time") {
    throw new Error("Pairing check-time bids are not valid for Days Off.");
  }

  if (bid.type === "pairing-length-preference") {
    throw new Error("Pairing length bids are not valid for Days Off.");
  }

  if (bid.type === "flight-number-preference") {
    throw new Error("Flight number preference bids are not valid for Days Off.");
  }

  if (bid.type === "redeye-preference") {
    throw new Error("Redeye preference bids are not valid for Days Off.");
  }

  if (bid.type === "month-end-carryover") {
    throw new Error("Month-End Carryover bids are not valid for Days Off.");
  }

  if (bid.type === "deadhead-flying") {
    throw new Error("Deadhead Flying bids are not valid for Days Off.");
  }

  if (bid.type === "credit-window-preference") {
    throw new Error("Credit Window Preference bids are not valid for Days Off.");
  }

  if (bid.type === "minimum-base-layover") {
    throw new Error("Minimum Base Layover bids are not valid for Days Off.");
  }

  if (bid.type === "efficient-flying-preference") {
    throw new Error("Efficient Flying First bids are not valid for Days Off.");
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

const mapDaysOffPropertyToDraftProperty = (
  property: DaysOffPropertyInput,
): PbsDaysOffPropertyMutationPayload => ({
  action: property.action ?? null,
  bid: mapDaysOffBidValueToMutationBid(property.bid),
  tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
  allOrNothing: property.allOrNothing ?? false,
  minimumN: property.minimumN ?? null,
  maximumN: property.maximumN ?? null,
});

const buildDaysOffAddPropertyPayload = (
  property: RuleBidAvailableProperty,
  draftMeta: DaysOffDraftMeta,
): PbsAddDaysOffCurrentPropertyRequest => ({
  ...buildDaysOffDraftMutationFields(draftMeta),
  propertyCode: property.propertyCode,
  ...mapDaysOffPropertyToDraftProperty(property),
});

const buildDaysOffPatchPropertyPayload = (
  property: RuleBidExistingProperty,
  draftMeta: DaysOffDraftMeta,
): PbsPutDaysOffCurrentPropertyRequest => ({
  ...buildDaysOffDraftMutationFields(draftMeta),
  ...mapDaysOffPropertyToDraftProperty(property),
});

export const daysOffService = {
  async getCurrentDraft(): Promise<PbsDaysOffCurrentDraftResponse> {
    return request.get<PbsDaysOffCurrentDraftResponse>(pbsDaysOffBidRoutes.current);
  },

  async getPageData(): Promise<DaysOffPageData> {
    const response = await daysOffService.getCurrentDraft();
    return mapDaysOffDraftResponseToPageData(response);
  },

  async addCurrentDraftProperty(
    property: RuleBidAvailableProperty,
    draftMeta: DaysOffDraftMeta,
  ): Promise<PbsDaysOffDraftPropertyMutationResponse> {
    const payload = buildDaysOffAddPropertyPayload(property, draftMeta);

    return request.post<PbsDaysOffDraftPropertyMutationResponse, PbsAddDaysOffCurrentPropertyRequest>(
      pbsDaysOffBidRoutes.currentProperties,
      payload,
    );
  },

  async removeCurrentDraftProperty(
    propertyGroupKey: string,
    draftMeta: DaysOffDraftMeta,
  ): Promise<PbsDaysOffDraftMutationResponse> {
    return request.delete<PbsDaysOffDraftMutationResponse>(
      pbsDaysOffBidRoutes.currentPropertyByKey(propertyGroupKey),
      {
        params: buildDaysOffDraftDeleteParams(draftMeta),
      },
    );
  },

  async patchCurrentDraftProperty(
    propertyGroupKey: string,
    property: RuleBidExistingProperty,
    draftMeta: DaysOffDraftMeta,
  ): Promise<PbsPatchDaysOffCurrentPropertyResponse> {
    const payload = buildDaysOffPatchPropertyPayload(property, draftMeta);

    return request.put<PbsPatchDaysOffCurrentPropertyResponse, PbsPutDaysOffCurrentPropertyRequest>(
      pbsDaysOffBidRoutes.currentPropertyByKey(propertyGroupKey),
      payload,
    );
  },

  async favoriteProperty(
    property: RuleBidAvailableProperty,
    draftMeta: DaysOffDraftMeta,
  ): Promise<PbsDaysOffFavoriteMutationResponse> {
    const payload: PbsSaveDaysOffFavoritePropertyRequest = {
      ...buildDaysOffDraftMutationFields(draftMeta),
      propertyCode: property.propertyCode,
      ...(() => {
        const { tiers, ...favoriteProperty } = mapDaysOffPropertyToDraftProperty(property);
        void tiers;
        return favoriteProperty;
      })(),
    };

    return request.post<PbsDaysOffFavoriteMutationResponse, PbsSaveDaysOffFavoritePropertyRequest>(
      pbsDaysOffBidRoutes.currentFavorites,
      payload,
    );
  },

  async patchFavoriteProperty(
    favoriteKey: string,
    property: RuleBidAvailableProperty,
    draftMeta: DaysOffDraftMeta,
  ): Promise<PbsDaysOffFavoriteMutationResponse> {
    const payload: PbsPatchDaysOffFavoritePropertyRequest = {
      ...buildDaysOffDraftMutationFields(draftMeta),
      propertyCode: property.propertyCode,
      ...(() => {
        const { tiers, ...favoriteProperty } = mapDaysOffPropertyToDraftProperty(property);
        void tiers;
        return favoriteProperty;
      })(),
    };

    return request.patch<PbsDaysOffFavoriteMutationResponse, PbsPatchDaysOffFavoritePropertyRequest>(
      pbsDaysOffBidRoutes.favoriteByKey(favoriteKey),
      payload,
    );
  },

  async unfavoriteProperty(
    favoriteKey: string,
    draftMeta: DaysOffDraftMeta,
  ): Promise<PbsDaysOffDraftMutationResponse> {
    return request.delete<PbsDaysOffDraftMutationResponse>(
      pbsDaysOffBidRoutes.favoriteByKey(favoriteKey),
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
