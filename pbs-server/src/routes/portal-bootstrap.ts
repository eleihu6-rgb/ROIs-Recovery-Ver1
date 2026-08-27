import type { FastifyInstance } from "fastify";
import { pbsPortalBootstrapRoutes } from "../../../packages/contracts/pbs-portal-bootstrap.js";
import { fail } from "../utils/response.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";

export default async function portalBootstrapRoutes(fastify: FastifyInstance) {
  fastify.get(pbsPortalBootstrapRoutes.current, async (request, reply) => {
    if (!request.authUser) {
      return fail(reply, 401, "Not authenticated.");
    }

    const actor = buildActorFromRequest(request);
    const [profile, biddingCalendar, lineholderSummary] = await Promise.all([
      fastify.dashboardProfileService.getCurrentProfile({
        crewId: request.authUser.employeeNo,
      }),
      fastify.biddingCalendarService.getCurrentCalendar(actor),
      fastify.lineholderSummaryService.getCurrentSummary(actor),
    ]);

    return sendPrivateJsonWithEtag(request, reply, {
      profile,
      biddingCalendar,
      lineholderSummary,
    });
  });
}
