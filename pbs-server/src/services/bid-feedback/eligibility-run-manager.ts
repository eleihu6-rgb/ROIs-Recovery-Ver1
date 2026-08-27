import { randomUUID } from "node:crypto";
import type { PairingEligibility } from "./rule-eligibility.js";

/**
 * In-memory async eligibility run registry + WebSocket fan-out.
 * The /eligibility endpoint creates a run and returns immediately; a background
 * computation streams per-pairing results via WS (eligibility:update) and ends with
 * eligibility:done. Keeps per-pairing isolation (each pairing evaluated independently).
 * Runs are single-instance in-memory; a done run is evicted after a short TTL.
 */

export interface EligibilityRun {
  runId: string;
  crewId: string;
  status: "computing" | "done";
  results: Map<string, PairingEligibility>;
  eligibilityLabel: string;
  subscribers: Set<import("ws").WebSocket>;
  createdAt: number;
}

const RUN_TTL_MS = 10 * 60 * 1000;
const runs = new Map<string, EligibilityRun>();

const send = (run: EligibilityRun, msg: unknown): void => {
  const text = JSON.stringify(msg);
  for (const socket of run.subscribers) {
    if (socket.readyState === 1) socket.send(text);
  }
};

export const eligibilityRunManager = {
  createRun(crewId: string, eligibilityLabel: string): EligibilityRun {
    const run: EligibilityRun = {
      runId: randomUUID(),
      crewId,
      status: "computing",
      results: new Map(),
      eligibilityLabel,
      subscribers: new Set(),
      createdAt: Date.now(),
    };
    runs.set(run.runId, run);
    return run;
  },

  /** Register a WS socket for a run and replay accumulated results + current status. */
  subscribe(runId: string, socket: import("ws").WebSocket): boolean {
    const run = runs.get(runId);
    if (!run) return false;
    run.subscribers.add(socket);
    send(run, { type: "eligibility:status", runId, status: run.status, eligibilityLabel: run.eligibilityLabel });
    for (const [pairingId, eligibility] of run.results) {
      send(run, { type: "eligibility:update", runId, pairingId, eligibility });
    }
    if (run.status === "done") send(run, { type: "eligibility:done", runId });
    return true;
  },

  unsubscribe(runId: string, socket: import("ws").WebSocket): void {
    runs.get(runId)?.subscribers.delete(socket);
  },

  getRun(runId: string): EligibilityRun | undefined {
    const run = runs.get(runId);
    if (!run) return undefined;
    if (run.status === "done" && Date.now() - run.createdAt > RUN_TTL_MS) {
      runs.delete(runId);
      return undefined;
    }
    return run;
  },

  /**
   * Run the background eligibility computation. `compute` receives a publish callback
   * that the caller invokes per completed pairing; the manager stores + fans out each
   * update and emits eligibility:done when compute resolves/rejects.
   */
  runInBackground(
    run: EligibilityRun,
    compute: (publish: (pairingId: string, eligibility: PairingEligibility) => void) => Promise<void>,
  ): void {
    void (async () => {
      try {
        await compute((pairingId, eligibility) => {
          run.results.set(pairingId, eligibility);
          send(run, { type: "eligibility:update", runId: run.runId, pairingId, eligibility });
        });
      } finally {
        run.status = "done";
        send(run, { type: "eligibility:done", runId: run.runId });
      }
    })();
  },
};
