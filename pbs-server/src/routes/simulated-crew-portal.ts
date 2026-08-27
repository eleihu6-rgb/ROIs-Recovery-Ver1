import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/index.js";
import {
  createSimulatedCrewPortalSession,
  listSimulatedCrewPortalLogs,
} from "../services/simulated-crew-portal/simulated-crew-portal-service.js";
import {
  loadSimulatedCrewPortalAdminConfig,
  saveSimulatedCrewPortalAdminConfig,
} from "../services/simulated-crew-portal/simulated-crew-portal-config.js";
import { SimulatedCrewPortalError } from "../services/simulated-crew-portal/simulated-crew-portal-error.js";
import { fail, success } from "../utils/response.js";

const createSessionSchema = z.object({
  crewCode: z.string().trim().min(1),
  adminUserCode: z.string().trim().min(1),
  adminUserName: z.string().trim().min(1),
}).strict();

const logQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const saveConfigSchema = z.object({
  portalPublicUrl: z.string(),
  loginTtlSeconds: z.number().int(),
  updatedBy: z.string().trim().min(1),
}).strict();

const hasInternalAccess = (request: FastifyRequest): boolean => {
  const secret = request.headers["x-internal-secret"];
  const value = Array.isArray(secret) ? secret[0] : secret;
  return typeof value === "string" && value === env.PBS_INTERNAL_API_SECRET;
};

export default async function simulatedCrewPortalRoutes(fastify: FastifyInstance) {
  fastify.post("/internal/simulated-crew-portal/sessions", async (request, reply) => {
    if (!hasInternalAccess(request)) {
      return fail(reply, 403, "Internal access required.");
    }

    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "Crew code and admin user are required.");
    }

    try {
      const session = await createSimulatedCrewPortalSession(fastify.db, {
        ...parsed.data,
        ipAddress: request.ip ?? null,
      });

      return success(reply, session);
    } catch (error) {
      if (error instanceof SimulatedCrewPortalError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to create simulated crew portal session");
      return fail(reply, 500, "Failed to create simulated crew portal session.");
    }
  });

  fastify.get("/internal/simulated-crew-portal/config", async (request, reply) => {
    if (!hasInternalAccess(request)) {
      return fail(reply, 403, "Internal access required.");
    }

    try {
      return success(reply, await loadSimulatedCrewPortalAdminConfig(fastify.db));
    } catch (error) {
      if (error instanceof SimulatedCrewPortalError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load simulated crew portal configuration");
      return fail(reply, 500, "Failed to load simulated crew portal configuration.");
    }
  });

  fastify.put("/internal/simulated-crew-portal/config", async (request, reply) => {
    if (!hasInternalAccess(request)) {
      return fail(reply, 403, "Internal access required.");
    }

    const parsed = saveConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "Portal configuration is invalid.");
    }

    try {
      return success(reply, await saveSimulatedCrewPortalAdminConfig(fastify.db, parsed.data));
    } catch (error) {
      if (error instanceof SimulatedCrewPortalError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to save simulated crew portal configuration");
      return fail(reply, 500, "Failed to save simulated crew portal configuration.");
    }
  });

  fastify.get("/internal/simulated-crew-portal/logs", async (request, reply) => {
    if (!hasInternalAccess(request)) {
      return fail(reply, 403, "Internal access required.");
    }

    const parsed = logQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return fail(reply, 400, "Invalid log query.");
    }

    try {
      return success(reply, {
        logs: await listSimulatedCrewPortalLogs(fastify.db, parsed.data.limit),
      });
    } catch (error) {
      request.log.error({ error }, "Failed to list simulated crew portal logs");
      return fail(reply, 500, "Failed to load simulated crew portal logs.");
    }
  });
}
