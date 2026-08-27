import type {
  PbsBidFeedbackConflictSummaryResponse,
  PbsBidFeedbackEligibilityResponse,
  PbsBidFeedbackEligibilityRunResponse,
  PbsBidFeedbackEligibilityStartResponse,
  PbsBidFeedbackResponse,
} from "../../../../packages/contracts/pbs-bid-feedback.js";
import type { LineholderDraftActor } from "../lineholder/shared.js";

export interface PbsBidFeedbackService {
  getCurrentConflicts: (actor: LineholderDraftActor) => Promise<PbsBidFeedbackConflictSummaryResponse>;
  getCurrentFeedback: (actor: LineholderDraftActor) => Promise<PbsBidFeedbackResponse>;
  getCurrentEligibility: (
    actor: LineholderDraftActor,
    input: { pairingIds: string[] },
  ) => Promise<PbsBidFeedbackEligibilityResponse>;
  /** Async start: creates a background eligibility run and returns its runId immediately. */
  startEligibilityRun: (
    actor: LineholderDraftActor,
    input: { pairingIds: string[] },
  ) => Promise<PbsBidFeedbackEligibilityStartResponse>;
  /** Accumulated snapshot of an eligibility run. */
  getEligibilityRun: (runId: string) => Promise<PbsBidFeedbackEligibilityRunResponse>;
}
