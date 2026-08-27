import type {
  PbsAddReserveCurrentPropertyRequest,
  PbsPatchReserveCurrentPropertyRequest,
  PbsPatchReserveCurrentPropertyResponse,
  PbsReserveCoverageResponse,
  PbsReserveCurrentDraftResponse,
  PbsReserveDraftMutationResponse,
  PbsReserveDraftPropertyMutationResponse,
  PbsSaveReserveCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import type { CurrentDraftReference, LineholderDraftActor } from "../lineholder/shared.js";

export interface PbsReserveBidService {
  getCurrentDraft: (actor: LineholderDraftActor) => Promise<PbsReserveCurrentDraftResponse>;
  saveCurrentDraft: (
    actor: LineholderDraftActor,
    request: PbsSaveReserveCurrentDraftRequest,
  ) => Promise<PbsReserveCurrentDraftResponse>;
  addCurrentDraftProperty: (
    actor: LineholderDraftActor,
    request: PbsAddReserveCurrentPropertyRequest,
  ) => Promise<PbsReserveDraftPropertyMutationResponse>;
  patchCurrentDraftProperty: (
    actor: LineholderDraftActor,
    propertyGroupKey: string,
    request: PbsPatchReserveCurrentPropertyRequest,
  ) => Promise<PbsPatchReserveCurrentPropertyResponse>;
  removeCurrentDraftProperty: (
    actor: LineholderDraftActor,
    propertyGroupKey: string,
    reference?: CurrentDraftReference,
  ) => Promise<PbsReserveDraftMutationResponse>;
  getCurrentCoverage: (actor: LineholderDraftActor) => Promise<PbsReserveCoverageResponse>;
}
