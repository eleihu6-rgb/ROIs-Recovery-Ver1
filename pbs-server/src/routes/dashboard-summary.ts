import type { FastifyInstance } from "fastify";
import { pbsDashboardSummaryRoutes } from "../../../packages/contracts/pbs-dashboard-summary.js";
import { DashboardProfileServiceError } from "../services/dashboard-profile/dashboard-profile-service.js";
import { DashboardSummaryServiceError } from "../services/dashboard-summary/dashboard-summary-service.js";
import { fail } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";

declare module "fastify" {
  interface FastifyInstance {
    dashboardSummaryService: import("../services/dashboard-summary/types.js").PbsDashboardSummaryService;
  }
}

export default async function dashboardSummaryRoutes(fastify: FastifyInstance) {
  fastify.get(pbsDashboardSummaryRoutes.current, async (request, reply) => {
    try {
      const result = await fastify.dashboardSummaryService.getCurrentSummary(buildActorFromRequest(request));
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof DashboardSummaryServiceError || error instanceof DashboardProfileServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the dashboard summary");
      return fail(reply, 500, "Failed to load the dashboard summary.");
    }
  });
}
