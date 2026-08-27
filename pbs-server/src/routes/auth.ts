import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsAuthRoutes,
  type PbsLoginRequest,
  type PbsLogoutResponse,
} from "../../../packages/contracts/pbs-auth.js";
import { fail, success } from "../utils/response.js";
import { AuthServiceError } from "../services/auth/auth-service.js";
import {
  decryptLoginPassword,
  getPasswordPublicKey,
  PasswordDecryptionError,
} from "../services/auth/password-encryption.js";
import {
  clearSimulatedLoginCookies,
  readSimulatedLoginTokenFromCookie,
} from "../services/simulated-crew-portal/simulated-crew-portal-cookie.js";

const loginSchema: z.ZodType<PbsLoginRequest> = z.object({
  userCode: z.string().min(1),
  encryptedPassword: z.string().min(1),
  encryption: z.object({
    algorithm: z.literal("RSA-OAEP-256"),
    keyId: z.string().min(1),
  }),
}).strict();

declare module "fastify" {
  interface FastifyInstance {
    authService: import("../services/auth/types.js").PbsAuthService;
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  const handleLogin = async (
    request: FastifyRequest<{ Body: PbsLoginRequest }>,
    reply: FastifyReply,
  ) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return fail(reply, 400, "User code and encrypted password are required.");
    }

    let password: string;
    try {
      password = decryptLoginPassword(parsed.data);
    } catch (error) {
      if (error instanceof PasswordDecryptionError) {
        return fail(reply, 400, "Invalid encrypted login request.");
      }

      request.log.error({ error }, "PBS password decrypt failed unexpectedly");
      return fail(reply, 500, "PBS login failed.");
    }

    try {
      const result = await fastify.authService.login(
        parsed.data.userCode,
        password,
        {
          ipAddress: request.ip ?? null,
          userAgent: request.headers["user-agent"] ?? null,
        },
      );

      return success(reply, result);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      if (
        typeof error === "object"
        && error !== null
        && "statusCode" in error
        && "message" in error
      ) {
        return fail(reply, Number(error.statusCode), String(error.message));
      }

      request.log.error({ error }, "PBS login failed unexpectedly");
      return fail(reply, 500, "PBS login failed.");
    }
  };

  fastify.get(pbsAuthRoutes.passwordPublicKey, async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return success(reply, getPasswordPublicKey());
  });

  fastify.post(pbsAuthRoutes.session, handleLogin);
  fastify.post(pbsAuthRoutes.legacyLogin, handleLogin);

  fastify.post("/auth/simulated-session", async (request, reply) => {
    const simulateToken = readSimulatedLoginTokenFromCookie(request);

    if (!simulateToken) {
      clearSimulatedLoginCookies(reply);
      return fail(reply, 401, "Simulated login token is missing or expired.");
    }

    try {
      const result = await fastify.authService.loginViaSimulation?.(
        simulateToken,
        {
          ipAddress: request.ip ?? null,
          userAgent: request.headers["user-agent"] ?? null,
        },
      );

      if (!result) {
        clearSimulatedLoginCookies(reply);
        return fail(reply, 500, "Simulated login is not available.");
      }

      clearSimulatedLoginCookies(reply);
      return success(reply, result);
    } catch (error) {
      clearSimulatedLoginCookies(reply);

      if (error instanceof AuthServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "PBS simulated login failed unexpectedly");
      return fail(reply, 500, "PBS simulated login failed.");
    }
  });

  fastify.get(pbsAuthRoutes.session, async (request, reply) => {
    if (!request.authUser) {
      return fail(reply, 401, "Not authenticated.");
    }

    return success(reply, fastify.authService.getSessionFromPayload(request.authUser));
  });

  fastify.delete(pbsAuthRoutes.session, async (request, reply) => {
    if (!request.authUser) {
      return fail(reply, 401, "Not authenticated.");
    }

    await fastify.authService.logout(request.authUser);
    return success<PbsLogoutResponse>(reply, { loggedOut: true });
  });
}
