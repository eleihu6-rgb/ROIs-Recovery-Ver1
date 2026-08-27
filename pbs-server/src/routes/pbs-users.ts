import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsUserRoutes as pbsUserApiRoutes,
  type PbsUserCrewOptionsResponse,
} from "../../../packages/contracts/pbs-search-pairings.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { fail, success } from "../utils/response.js";

const crewOptionsQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

declare module "fastify" {
  interface FastifyInstance {
    pbsUserService: import("../services/pbs-user/types.js").PbsUserService;
  }
}

export default async function pbsUserRoutes(fastify: FastifyInstance) {
  fastify.get(
    pbsUserApiRoutes.crewOptions,
    async (
      request: FastifyRequest<{ Querystring: { query?: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = crewOptionsQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid crew search query.");
      }

      try {
        const result: PbsUserCrewOptionsResponse = await fastify.pbsUserService.searchCrewOptions(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        request.log.error({ error }, "Failed to search PBS users");
        return fail(reply, 500, "Failed to search crews.");
      }
    },
  );
}
