import type { FastifyInstance } from "fastify";
import { pbsBidFeedbackRoutes } from "../../../packages/contracts/pbs-bid-feedback.js";
import { eligibilityRunManager } from "../services/bid-feedback/eligibility-run-manager.js";

/**
 * WebSocket endpoint for streaming async bid-feedback eligibility results.
 * Client connects with `?runId=<uuid>`; the runId is an unguessable capability (only the
 * actor who started the run knows it). The server replays accumulated results + streams
 * per-pairing updates (eligibility:update) and a final eligibility:done.
 */
export default async function bidFeedbackWsRoutes(fastify: FastifyInstance) {
  fastify.get(pbsBidFeedbackRoutes.eligibilityWs, { websocket: true }, (socket, request) => {
    const { runId } = request.query as { runId?: string };
    if (!runId) {
      socket.close(1008, "Missing runId");
      return;
    }
    const ok = eligibilityRunManager.subscribe(runId, socket);
    if (!ok) {
      socket.close(1008, "Unknown or expired eligibility run");
      return;
    }
    socket.on("close", () => eligibilityRunManager.unsubscribe(runId, socket));
  });
}
