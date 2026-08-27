import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsBidFeedbackEligibilityPairingLimit,
  pbsBidFeedbackRoutes,
} from "../../../packages/contracts/pbs-bid-feedback.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { fail, success } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";

declare module "fastify" {
  interface FastifyInstance {
    bidFeedbackService: import("../services/bid-feedback/types.js").PbsBidFeedbackService;
  }
}

const handleFeedbackError = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) => {
  if (error instanceof LineholderBidServiceError) {
    return fail(reply, error.statusCode, error.message);
  }

  request.log.error({ error }, "Failed to load Bid Feedback");
  return fail(reply, 500, "Bid Feedback could not be loaded. Please try again.");
};

const eligibilityQuerySchema = z.object({
  pairingIds: z.union([z.string(), z.array(z.string())]).optional(),
});

const parseEligibilityPairingIds = (query: unknown): string[] | null => {
  const parsed = eligibilityQuerySchema.safeParse(query);
  if (!parsed.success) return null;

  const values = Array.isArray(parsed.data.pairingIds)
    ? parsed.data.pairingIds
    : parsed.data.pairingIds ? [parsed.data.pairingIds] : [];
  const pairingIds = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const uniquePairingIds = [...new Set(pairingIds)];

  if (
    uniquePairingIds.length === 0
    || uniquePairingIds.length > pbsBidFeedbackEligibilityPairingLimit
    || uniquePairingIds.some((pairingId) => !/^\d+$/.test(pairingId))
  ) {
    return null;
  }

  return uniquePairingIds;
};

export default async function bidFeedbackRoutes(fastify: FastifyInstance) {
  fastify.get(pbsBidFeedbackRoutes.conflicts, async (request, reply) => {
    try {
      return success(reply, await fastify.bidFeedbackService.getCurrentConflicts(buildActorFromRequest(request)));
    } catch (error) {
      return handleFeedbackError(request, reply, error);
    }
  });

  fastify.get(pbsBidFeedbackRoutes.current, async (request, reply) => {
    try {
      return sendPrivateJsonWithEtag(
        request,
        reply,
        await fastify.bidFeedbackService.getCurrentFeedback(buildActorFromRequest(request)),
      );
    } catch (error) {
      return handleFeedbackError(request, reply, error);
    }
  });

  fastify.get(pbsBidFeedbackRoutes.eligibility, async (request, reply) => {
    const pairingIds = parseEligibilityPairingIds(request.query);
    if (!pairingIds) {
      return fail(reply, 400, "Invalid Bid Feedback eligibility payload.");
    }

    try {
      // Async start: returns a runId immediately; results stream over WS + the run endpoint.
      return sendPrivateJsonWithEtag(
        request,
        reply,
        await fastify.bidFeedbackService.startEligibilityRun(
          buildActorFromRequest(request),
          { pairingIds },
        ),
      );
    } catch (error) {
      return handleFeedbackError(request, reply, error);
    }
  });

  fastify.get(pbsBidFeedbackRoutes.eligibilityRun, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    if (!runId) {
      return fail(reply, 400, "Missing eligibility run id.");
    }
    try {
      const data = await fastify.bidFeedbackService.getEligibilityRun(runId);
      // Polled every few seconds; the body changes as results stream in, and the frontend's
      // http client rejects 304, so never send ETag/304 here.
      reply.header("Cache-Control", "no-store");
      return success(reply, data);
    } catch (error) {
      return handleFeedbackError(request, reply, error);
    }
  });
}
