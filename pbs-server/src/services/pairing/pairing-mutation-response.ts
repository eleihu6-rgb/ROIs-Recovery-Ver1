import type {
  PbsPairingDraftMutationResponse,
  PbsPairingDraftPropertyMutationResponse,
  PbsPairingFavoriteMutationResponse,
  PbsPairingFavoriteProperty,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { CurrentBidTarget } from "../lineholder/shared.js";

type DraftMutationDetails = Partial<
  Pick<PbsPairingDraftMutationResponse, "draftKey" | "bidId" | "periodId" | "periodCode" | "draftVersion">
>;

export const savedPairingMutationResponse = (
  details: DraftMutationDetails = {},
): PbsPairingDraftMutationResponse => ({
  saved: true,
  draftKey: details.draftKey,
  bidId: details.bidId,
  periodId: details.periodId,
  periodCode: details.periodCode,
  draftVersion: details.draftVersion,
});

export const savedPairingDraftMutationResponse = (targetBid: CurrentBidTarget): PbsPairingDraftMutationResponse =>
  savedPairingMutationResponse({
    draftKey: targetBid.draftKey,
    bidId: targetBid.bidId,
    periodId: targetBid.periodId,
    periodCode: targetBid.periodCode,
    draftVersion: targetBid.draftVersion,
  });

export const savedPairingPropertyMutationResponse = (
  propertyGroupKey: string,
  rowSeq: number,
  details: DraftMutationDetails = {},
): PbsPairingDraftPropertyMutationResponse => ({
  ...savedPairingMutationResponse(details),
  propertyGroupKey,
  rowSeq,
});

export const savedPairingFavoriteMutationResponse = (
  favorite: PbsPairingFavoriteProperty,
  details: DraftMutationDetails = {},
): PbsPairingFavoriteMutationResponse => ({
  ...savedPairingMutationResponse(details),
  ...favorite,
});
