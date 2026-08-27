import type {
  PbsAddDaysOffCurrentPropertyRequest,
  PbsDaysOffCurrentDraftResponse,
  PbsDaysOffDraftMutationResponse,
  PbsDaysOffDraftPropertyMutationResponse,
  PbsDaysOffFavoriteMutationResponse,
  PbsPatchDaysOffCurrentPropertyRequest,
  PbsPatchDaysOffCurrentPropertyResponse,
  PbsPatchDaysOffFavoritePropertyRequest,
  PbsSaveDaysOffFavoritePropertyRequest,
  PbsSaveDaysOffCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { CurrentDraftReference, LineholderDraftActor } from "../lineholder/shared.js";

export interface PbsDaysOffBidService {
  getCurrentDraft: (actor: LineholderDraftActor) => Promise<PbsDaysOffCurrentDraftResponse>;
  saveCurrentDraft: (
    actor: LineholderDraftActor,
    request: PbsSaveDaysOffCurrentDraftRequest,
  ) => Promise<PbsDaysOffDraftMutationResponse>;
  addCurrentDraftProperty: (
    actor: LineholderDraftActor,
    request: PbsAddDaysOffCurrentPropertyRequest,
  ) => Promise<PbsDaysOffDraftPropertyMutationResponse>;
  removeCurrentDraftProperty: (
    actor: LineholderDraftActor,
    propertyGroupKey: string,
    reference?: CurrentDraftReference,
  ) => Promise<PbsDaysOffDraftMutationResponse>;
  patchCurrentDraftProperty: (
    actor: LineholderDraftActor,
    propertyGroupKey: string,
    request: PbsPatchDaysOffCurrentPropertyRequest,
  ) => Promise<PbsPatchDaysOffCurrentPropertyResponse>;
  saveFavoriteProperty: (
    actor: LineholderDraftActor,
    request: PbsSaveDaysOffFavoritePropertyRequest,
  ) => Promise<PbsDaysOffFavoriteMutationResponse>;
  patchFavoritePropertyByKey: (
    actor: LineholderDraftActor,
    favoriteKey: string,
    request: PbsPatchDaysOffFavoritePropertyRequest,
  ) => Promise<PbsDaysOffFavoriteMutationResponse>;
  removeFavoritePropertyByKey: (
    actor: LineholderDraftActor,
    favoriteKey: string,
    reference?: CurrentDraftReference,
  ) => Promise<PbsDaysOffDraftMutationResponse>;
}
