import type {
  PbsSaveStandingDraftRequest,
  PbsStandingCurrentResponse,
} from "../../../../packages/contracts/pbs-standing-bids.js";
import type { LineholderDraftActor } from "../lineholder/shared.js";

export interface PbsStandingBidService {
  getCurrentStandingBid: (actor: LineholderDraftActor) => Promise<PbsStandingCurrentResponse>;
  saveStandingDraft: (
    actor: LineholderDraftActor,
    request: PbsSaveStandingDraftRequest,
  ) => Promise<PbsStandingCurrentResponse>;
}
