import type { FastifyInstance } from "fastify";
import { pbsBiddingCalendarRoutes } from "../../../packages/contracts/pbs-bidding-calendar.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { fail } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";

declare module "fastify" {
  interface FastifyInstance {
    biddingCalendarService: import("../services/calendar/types.js").PbsBiddingCalendarService;
  }
}

export default async function biddingCalendarRoutes(fastify: FastifyInstance) {
  fastify.get(pbsBiddingCalendarRoutes.current, async (request, reply) => {
    try {
      const result = await fastify.biddingCalendarService.getCurrentCalendar(buildActorFromRequest(request));
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the current bidding calendar");
      return fail(reply, 500, "Failed to load the current bidding calendar.");
    }
  });
}

