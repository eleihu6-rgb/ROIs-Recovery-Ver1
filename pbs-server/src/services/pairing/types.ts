import type {
  PbsAddPairingCurrentPropertyRequest,
  PbsPairingCurrentDraftResponse,
  PbsPairingDraftMutationResponse,
  PbsPairingDraftPropertyMutationResponse,
  PbsPairingFavoriteMutationResponse,
  PbsPatchPairingFavoritePropertyRequest,
  PbsPatchPairingCurrentPropertyRequest,
  PbsPatchPairingCurrentPropertyResponse,
  PbsPairingReferenceOptionsResponse,
  PbsSavePairingFavoritePropertyRequest,
  PbsSavePairingCurrentDraftRequest,
  PbsEfficientFlyingConfig,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";
import type { CurrentDraftReference } from "../lineholder/shared.js";

export type PairingDraftActor = {
  crewId: string;
  userCode: string;
};

export interface PbsPairingBidService {
  warmUp?: () => Promise<void>;
  getEfficientFlyingConfig: () => Promise<PbsEfficientFlyingConfig>;
  getRedeyeConfig: () => Promise<PbsRedeyeDefinition>;
  getReferenceOptions: () => Promise<PbsPairingReferenceOptionsResponse>;
  getCurrentDraft: (actor: PairingDraftActor) => Promise<PbsPairingCurrentDraftResponse>;
  saveCurrentDraft: (
    actor: PairingDraftActor,
    request: PbsSavePairingCurrentDraftRequest,
  ) => Promise<PbsPairingDraftMutationResponse>;
  addCurrentDraftProperty: (
    actor: PairingDraftActor,
    request: PbsAddPairingCurrentPropertyRequest,
  ) => Promise<PbsPairingDraftPropertyMutationResponse>;
  removeCurrentDraftProperty: (
    actor: PairingDraftActor,
    propertyGroupKey: string,
    reference?: CurrentDraftReference,
  ) => Promise<PbsPairingDraftMutationResponse>;
  patchCurrentDraftProperty: (
    actor: PairingDraftActor,
    propertyGroupKey: string,
    request: PbsPatchPairingCurrentPropertyRequest,
  ) => Promise<PbsPatchPairingCurrentPropertyResponse>;
  saveConfiguredFavoriteProperty: (
    actor: PairingDraftActor,
    request: PbsSavePairingFavoritePropertyRequest,
  ) => Promise<PbsPairingFavoriteMutationResponse>;
  patchFavoritePropertyByKey: (
    actor: PairingDraftActor,
    favoriteKey: string,
    request: PbsPatchPairingFavoritePropertyRequest,
  ) => Promise<PbsPairingFavoriteMutationResponse>;
  removeFavoritePropertyByKey: (
    actor: PairingDraftActor,
    favoriteKey: string,
    reference?: CurrentDraftReference,
  ) => Promise<PbsPairingDraftMutationResponse>;
}
