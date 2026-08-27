import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { pbsAuthRoutes } from "../../../packages/contracts/pbs-auth.js";
import { pbsBidFeedbackRoutes } from "../../../packages/contracts/pbs-bid-feedback.js";
import { env } from "../config/index.js";
import { AuthServiceError } from "../services/auth/auth-service.js";
import type { AuthPayload } from "../services/auth/types.js";

const PUBLIC_ROUTES = [
  { method: "POST", path: `/api${pbsAuthRoutes.session}` },
  { method: "POST", path: `/api${pbsAuthRoutes.legacyLogin}` },
  { method: "GET", path: `/api${pbsAuthRoutes.passwordPublicKey}` },
  { method: "GET", path: "/api/auth/sso/login" },
  { method: "POST", path: "/api/auth/sso/acs" },
  { method: "GET", path: "/api/auth/sso/metadata" },
  { method: "POST", path: "/api/auth/sso/callback" },
  { method: "GET", path: "/api/auth/sso/logout" },
  { method: "POST", path: "/api/auth/sso/logout" },
  { method: "POST", path: "/api/auth/simulated-session" },
  { method: "POST", path: "/api/internal/simulated-crew-portal/sessions" },
  { method: "GET", path: "/api/internal/simulated-crew-portal/config" },
  { method: "PUT", path: "/api/internal/simulated-crew-portal/config" },
  { method: "GET", path: "/api/internal/simulated-crew-portal/logs" },
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/metrics" },
  // Eligibility WS: browsers can't set WS headers, so the handshake is public; access is
  // gated by the unguessable runId (only the actor who started the run knows it).
  { method: "GET", path: `/api${pbsBidFeedbackRoutes.eligibilityWs}` },
] as const;

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthPayload;
  }
}

const isStatusError = (error: unknown): error is { statusCode: number; message: string } =>
  typeof error === "object"
  && error !== null
  && "statusCode" in error
  && typeof (error as { statusCode?: unknown }).statusCode === "number"
  && "message" in error
  && typeof (error as { message?: unknown }).message === "string";

export default fp(async (fastify: FastifyInstance) => {
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    const method = request.method.toUpperCase();

    if (PUBLIC_ROUTES.some((route) => route.method === method && path === route.path)) {
      return;
    }

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return reply.status(401).send({
        code: 401,
        data: null,
        message: "Authentication required. Please login first.",
      });
    }

    try {
      const verifiedPayload = jwt.verify(
        authorization.slice(7),
        env.JWT_SECRET,
      ) as AuthPayload;
      const payload = fastify.authService.validatePayload
        ? await fastify.authService.validatePayload(verifiedPayload)
        : verifiedPayload;

      request.authUser = payload;
    } catch (error) {
      if (error instanceof AuthServiceError || isStatusError(error)) {
        return reply.status(error.statusCode).send({
          code: error.statusCode,
          data: null,
          message: error.message,
        });
      }

      return reply.status(401).send({
        code: 401,
        data: null,
        message: "Token expired or invalid. Please login again.",
      });
    }
  });
});
