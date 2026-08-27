import type { PbsLineholderCurrentSummaryResponse } from "../../../../packages/contracts/pbs-lineholder-summary.js";
import type { LineholderDraftActor } from "./shared.js";

export interface PbsLineholderSummaryService {
  getCurrentSummary: (actor: LineholderDraftActor) => Promise<PbsLineholderCurrentSummaryResponse>;
}
