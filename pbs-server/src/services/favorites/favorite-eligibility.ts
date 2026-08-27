import {
  containsExplicitCalendarDate,
  type PbsConfiguredFavoriteBidValue,
  type PbsFavoriteDateSemanticContext,
} from "../../../../packages/contracts/pbs-favorite-eligibility.js";

export const FAVORITE_EXPLICIT_DATE_ERROR_MESSAGE =
  "Favorites cannot include specific calendar dates.";

export const assertConfiguredFavoriteCanBeSaved = (
  bid: PbsConfiguredFavoriteBidValue,
  semanticContext: PbsFavoriteDateSemanticContext,
  createError: (message: string) => Error,
): void => {
  if (containsExplicitCalendarDate(bid, semanticContext)) {
    throw createError(FAVORITE_EXPLICIT_DATE_ERROR_MESSAGE);
  }
};
