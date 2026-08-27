import type {
  PbsDaysOffDraftMutationResponse,
  PbsDaysOffDraftPropertyMutationResponse,
  PbsDaysOffFavoriteMutationResponse,
  PbsDaysOffFavoriteProperty,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { CurrentBidTarget } from "../lineholder/shared.js";

type DraftMutationDetails = Partial<
  Pick<PbsDaysOffDraftMutationResponse, "draftKey" | "bidId" | "periodId" | "periodCode" | "draftVersion">
>;

export const savedMutationResponse = (
  details: DraftMutationDetails = {},
): PbsDaysOffDraftMutationResponse => ({
  saved: true,
  draftKey: details.draftKey,
  bidId: details.bidId,
  periodId: details.periodId,
  periodCode: details.periodCode,
  draftVersion: details.draftVersion,
});

export const savedDraftMutationResponse = (targetBid: CurrentBidTarget): PbsDaysOffDraftMutationResponse =>
  savedMutationResponse({
    draftKey: targetBid.draftKey,
    bidId: targetBid.bidId,
    periodId: targetBid.periodId,
    periodCode: targetBid.periodCode,
    draftVersion: targetBid.draftVersion,
  });

export const savedPropertyMutationResponse = (
  propertyGroupKey: string,
  rowSeq: number,
  details: DraftMutationDetails = {},
): PbsDaysOffDraftPropertyMutationResponse => ({
  ...savedMutationResponse(details),
  propertyGroupKey,
  rowSeq,
});

export const savedFavoriteMutationResponse = (
  favorite: PbsDaysOffFavoriteProperty,
  details: DraftMutationDetails = {},
): PbsDaysOffFavoriteMutationResponse => ({
  ...savedMutationResponse(details),
  ...favorite,
});
