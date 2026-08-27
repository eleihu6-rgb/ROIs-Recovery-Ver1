import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bidFeedbackService } from "@/shared/services/bid-feedback-service";
import type { PbsBidFeedbackPairingEligibility } from "../../../../../packages/contracts/pbs-bid-feedback.js";

export const bidFeedbackConflictQueryKey = ["bid-feedback", "current", "conflicts"] as const;
export const bidFeedbackCurrentQueryKey = ["bid-feedback", "current"] as const;
export const bidFeedbackEligibilityQueryKey = ["bid-feedback", "current", "eligibility"] as const;

export const useBidFeedbackConflicts = (draftVersionKey: string) => useQuery({
  queryKey: [...bidFeedbackConflictQueryKey, draftVersionKey],
  queryFn: () => bidFeedbackService.getCurrentConflicts(),
});

export const useBidFeedback = (enabled: boolean, draftVersionKey: string) => useQuery({
  enabled,
  queryKey: [...bidFeedbackCurrentQueryKey, draftVersionKey],
  queryFn: () => bidFeedbackService.getCurrentFeedback(),
});

/**
 * Async rule-engine eligibility with WebSocket streaming.
 * Starts a background eligibility run, streams per-pairing results over WS as they
 * complete (spinner while computing), and falls back to polling the run endpoint if
 * the WS drops. Keeps per-pairing isolation — the UI is never blocked waiting.
 */
export const useBidFeedbackEligibility = (
  enabled: boolean,
  draftVersionKey: string,
  pairingIds: string[],
) => {
  const [state, setState] = useState<{
    status: "idle" | "computing" | "done";
    byPairingId: Map<string, PbsBidFeedbackPairingEligibility>;
    eligibilityLabel: string | null;
  }>({ status: "idle", byPairingId: new Map(), eligibilityLabel: null });
  const pairingKey = pairingIds.join(",");

  useEffect(() => {
    if (!enabled || pairingKey.length === 0) return;
    // Reconstruct ids from the stable string key so the effect does NOT re-run when the
    // caller passes a fresh array reference every render (previously this started a new
    // background run each render, cancelling the previous one → perpetual spinner).
    const ids = pairingKey.split(",").filter(Boolean);

    let cancelled = false;
    let cleanupWs: (() => void) | undefined;
    let pollId: ReturnType<typeof setInterval> | undefined;

    const start = async () => {
      try {
        const { runId, eligibilityLabel } = await bidFeedbackService.startEligibilityRun(ids);
        if (cancelled) return;
        setState({ status: "computing", byPairingId: new Map(), eligibilityLabel });

        cleanupWs = bidFeedbackService.openEligibilityWs(runId, {
          onUpdate: (pairingId, eligibility) => {
            if (cancelled) return;
            setState((prev) => {
              const next = new Map(prev.byPairingId);
              next.set(pairingId, eligibility);
              return { status: prev.status, byPairingId: next, eligibilityLabel: prev.eligibilityLabel };
            });
          },
          onDone: () => {
            if (cancelled) return;
            setState((prev) => ({ status: "done", byPairingId: prev.byPairingId, eligibilityLabel: prev.eligibilityLabel }));
          },
        });

        // Fallback poll in case the WS drops or is not available.
        pollId = setInterval(async () => {
          try {
            const run = await bidFeedbackService.getEligibilityRun(runId);
            if (cancelled) return;
            setState((prev) => {
              const next = new Map(prev.byPairingId);
              for (const p of run.pairings) next.set(p.pairingId, p.eligibility);
              return { status: run.status === "done" ? "done" : "computing", byPairingId: next, eligibilityLabel: prev.eligibilityLabel };
            });
            if (run.status === "done") {
              if (pollId) clearInterval(pollId);
              cleanupWs?.();
            }
          } catch {
            // run not ready / transient error — retry next tick
          }
        }, 3000);
      } catch {
        if (!cancelled) setState({ status: "done", byPairingId: new Map(), eligibilityLabel: null });
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      cleanupWs?.();
    };
  }, [enabled, draftVersionKey, pairingKey]);

  const pairings = useMemo(
    () => [...state.byPairingId.entries()].map(([pairingId, eligibility]) => ({ pairingId, eligibility })),
    [state.byPairingId],
  );

  return {
    status: state.status,
    checking: state.status === "computing",
    data: { pairings, eligibilityLabel: state.eligibilityLabel ?? undefined },
  };
};
