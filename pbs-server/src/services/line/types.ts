import type {
  PbsAddLineCurrentPropertyRequest,
  PbsLineCurrentDraftResponse,
  PbsLineCreditWindowConfig,
  PbsLineDraftMutationResponse,
  PbsLineDraftPropertyMutationResponse,
  PbsLineFavoriteMutationResponse,
  PbsLineMinimumBaseLayoverConfig,
  PbsPatchLineCurrentPropertyRequest,
  PbsPatchLineCurrentPropertyResponse,
  PbsPatchLineConfiguredFavoritePropertyRequest,
  PbsSaveLineConfiguredFavoritePropertyRequest,
  PbsSaveLineCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-line-bids.js";
import type { CurrentDraftReference, LineholderDraftActor } from "../lineholder/shared.js";

export interface PbsLineBidService {
  getCreditWindowConfig: () => Promise<PbsLineCreditWindowConfig>;
  getMinimumBaseLayoverConfig: () => Promise<PbsLineMinimumBaseLayoverConfig>;
  getCurrentDraft: (actor: LineholderDraftActor) => Promise<PbsLineCurrentDraftResponse>;
  saveCurrentDraft: (
    actor: LineholderDraftActor,
    request: PbsSaveLineCurrentDraftRequest,
  ) => Promise<PbsLineCurrentDraftResponse>;
  addCurrentDraftProperty: (
    actor: LineholderDraftActor,
    request: PbsAddLineCurrentPropertyRequest,
  ) => Promise<PbsLineDraftPropertyMutationResponse>;
  removeCurrentDraftProperty: (
    actor: LineholderDraftActor,
    propertyGroupKey: string,
    reference?: CurrentDraftReference,
  ) => Promise<PbsLineDraftMutationResponse>;
  patchCurrentDraftProperty: (
    actor: LineholderDraftActor,
    propertyGroupKey: string,
    request: PbsPatchLineCurrentPropertyRequest,
  ) => Promise<PbsPatchLineCurrentPropertyResponse>;
  saveConfiguredFavoriteProperty: (
    actor: LineholderDraftActor,
    request: PbsSaveLineConfiguredFavoritePropertyRequest,
  ) => Promise<PbsLineFavoriteMutationResponse>;
  patchFavoritePropertyByKey: (
    actor: LineholderDraftActor,
    favoriteKey: string,
    request: PbsPatchLineConfiguredFavoritePropertyRequest,
  ) => Promise<PbsLineFavoriteMutationResponse>;
  removeFavoritePropertyByKey: (
    actor: LineholderDraftActor,
    favoriteKey: string,
    reference?: CurrentDraftReference,
  ) => Promise<PbsLineDraftMutationResponse>;
}
