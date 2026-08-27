import {
  pbsBidFeedbackRoutes,
  type PbsBidFeedbackConflictSummaryResponse,
  type PbsBidFeedbackEligibilityResponse,
  type PbsBidFeedbackEligibilityRunResponse,
  type PbsBidFeedbackEligibilityStartResponse,
  type PbsBidFeedbackResponse,
  type PbsBidFeedbackPairingEligibility,
} from "../../../../packages/contracts/pbs-bid-feedback.js";
import { request } from "@/shared/services/request";
import { env } from "@/shared/config/env";

const BID_FEEDBACK_ELIGIBILITY_TIMEOUT_MS = 45_000;
const BID_FEEDBACK_CURRENT_TIMEOUT_MS = 45_000;

export interface BidFeedbackEligibilityWsHandlers {
  onUpdate: (pairingId: string, eligibility: PbsBidFeedbackPairingEligibility) => void;
  onDone: () => void;
}

export const bidFeedbackService = {
  getCurrentConflicts() {
    return request.get<PbsBidFeedbackConflictSummaryResponse>(pbsBidFeedbackRoutes.conflicts);
  },
  getCurrentFeedback() {
    return request.get<PbsBidFeedbackResponse>(pbsBidFeedbackRoutes.current, {
      timeout: BID_FEEDBACK_CURRENT_TIMEOUT_MS,
    });
  },
  startEligibilityRun(pairingIds: string[]) {
    return request.get<PbsBidFeedbackEligibilityStartResponse>(pbsBidFeedbackRoutes.eligibility, {
      params: { pairingIds: pairingIds.join(",") },
      timeout: BID_FEEDBACK_ELIGIBILITY_TIMEOUT_MS,
    });
  },
  getEligibilityRun(runId: string) {
    return request.get<PbsBidFeedbackEligibilityRunResponse>(
      pbsBidFeedbackRoutes.eligibilityRun.replace(":runId", runId),
      { timeout: BID_FEEDBACK_ELIGIBILITY_TIMEOUT_MS },
    );
  },
  getCurrentEligibility(pairingIds: string[]) {
    return request.get<PbsBidFeedbackEligibilityResponse>(pbsBidFeedbackRoutes.eligibility, {
      params: { pairingIds: pairingIds.join(",") },
      timeout: BID_FEEDBACK_ELIGIBILITY_TIMEOUT_MS,
    });
  },
  /**
   * Open a WebSocket for an eligibility run and return a cleanup function.
   * The WS URL is derived from the API base (same origin + /api prefix).
   */
  openEligibilityWs(runId: string, handlers: BidFeedbackEligibilityWsHandlers): () => void {
    const apiBase = env.apiBaseUrl;
    const base = apiBase.startsWith("http")
      ? apiBase
      : `${window.location.origin}${apiBase}`;
    const url = base.replace(/^http/, "ws") + pbsBidFeedbackRoutes.eligibilityWs + `?runId=${encodeURIComponent(runId)}`;
    const socket = new WebSocket(url);
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type?: string;
          pairingId?: string;
          eligibility?: PbsBidFeedbackPairingEligibility;
        };
        if (msg.type === "eligibility:update" && msg.pairingId && msg.eligibility) {
          handlers.onUpdate(msg.pairingId, msg.eligibility);
        } else if (msg.type === "eligibility:done") {
          handlers.onDone();
        }
      } catch {
        // ignore malformed frames
      }
    };
    return () => socket.close();
  },
};
