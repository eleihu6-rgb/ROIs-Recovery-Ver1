import type { FastifyInstance } from "fastify";
import { pbsDashboardProfileRoutes } from "../../../packages/contracts/pbs-dashboard-profile.js";
import { DashboardProfileServiceError } from "../services/dashboard-profile/dashboard-profile-service.js";
import { fail } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";

declare module "fastify" {
  interface FastifyInstance {
    dashboardProfileService: import("../services/dashboard-profile/types.js").PbsDashboardProfileService;
  }
}

export default async function dashboardProfileRoutes(fastify: FastifyInstance) {
  fastify.get(pbsDashboardProfileRoutes.current, async (request, reply) => {
    if (!request.authUser) {
      return fail(reply, 401, "Not authenticated.");
    }

    try {
      const result = await fastify.dashboardProfileService.getCurrentProfile({
        crewId: request.authUser.employeeNo,
      });
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof DashboardProfileServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the dashboard user profile");
      return fail(reply, 500, "Failed to load the dashboard user profile.");
    }
  });
}
