import type { FastifyInstance } from "fastify";
import { pbsLineholderBidRoutes } from "../../../packages/contracts/pbs-lineholder-summary.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { fail } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";

declare module "fastify" {
  interface FastifyInstance {
    lineholderSummaryService: import("../services/lineholder/types.js").PbsLineholderSummaryService;
  }
}

export default async function lineholderSummaryRoutes(fastify: FastifyInstance) {
  fastify.get(pbsLineholderBidRoutes.summary, async (request, reply) => {
    try {
      const result = await fastify.lineholderSummaryService.getCurrentSummary(buildActorFromRequest(request));
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the current lineholder summary");
      return fail(reply, 500, "Failed to load the current lineholder summary.");
    }
  });
}
