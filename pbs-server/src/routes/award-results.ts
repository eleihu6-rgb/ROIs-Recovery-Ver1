import type { FastifyInstance } from "fastify";
import { pbsAwardRoutes } from "../../../packages/contracts/pbs-award-results.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { fail } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";

declare module "fastify" {
  interface FastifyInstance {
    awardResultsService: import("../services/award/types.js").PbsAwardResultsService;
  }
}

export default async function awardResultsRoutes(fastify: FastifyInstance) {
  fastify.get(pbsAwardRoutes.current, async (request, reply) => {
    try {
      const result = await fastify.awardResultsService.getCurrentAward(buildActorFromRequest(request));
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the current award results");
      return fail(reply, 500, "Failed to load the current award results.");
    }
  });

  fastify.get(pbsAwardRoutes.periods, async (request, reply) => {
    try {
      const result = await fastify.awardResultsService.getAwardPeriods(buildActorFromRequest(request));
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }
      request.log.error({ error }, "Failed to load award periods");
      return fail(reply, 500, "Failed to load award periods.");
    }
  });

  fastify.get<{ Params: { rosterPeriodId: string } }>("/award/periods/:rosterPeriodId", async (request, reply) => {
    const rosterPeriodId = Number(request.params.rosterPeriodId);
    if (!Number.isSafeInteger(rosterPeriodId) || rosterPeriodId <= 0) {
      return fail(reply, 400, "Invalid award period.");
    }
    try {
      const result = await fastify.awardResultsService.getAwardByPeriodId(
        buildActorFromRequest(request),
        rosterPeriodId,
      );
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }
      request.log.error({ error, rosterPeriodId }, "Failed to load award period results");
      return fail(reply, 500, "Failed to load award period results.");
    }
  });
}
