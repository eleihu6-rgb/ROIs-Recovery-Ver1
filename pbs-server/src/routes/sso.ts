import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { env } from "../config/index.js";
import {
  createSamlSp,
  extractIdentity,
  generateMetadata,
  getAuthorizeUrl,
  validatePostResponse,
  type SamlProfile,
  type SamlSpConfig,
} from "../../../packages/saml/dist/index.js";
import { AuthServiceError, TOKEN_INVALID_MESSAGE } from "../services/auth/auth-service.js";
import type { AuthPayload } from "../services/auth/types.js";
import { success } from "../utils/response.js";

const samlConfig = (): SamlSpConfig => ({
  callbackUrl: env.SSO_CALLBACK_URL!,
  entryPoint: env.SSO_IDP_ENTRY_POINT!,
  issuer: env.SSO_ENTITY_ID!,
  idpCert: env.SSO_IDP_CERT!,
  privateKey: env.SSO_PRIVATE_KEY,
  publicCert: env.SSO_PUBLIC_CERT,
  wantAssertionsSigned: true,
  acceptedClockSkewMs: 30_000,
  validateInResponseTo: "ifPresent",
});

// node-saml 的 InResponseTo 校验依赖发起 AuthnRequest 时缓存的 request ID，
// 该缓存默认挂在 SAML 实例上（每实例独立 InMemoryCacheProvider，见 saml.js）。
// 若每次请求都新建实例，login 缓存的 ID 在 acs 校验时不可见 → 抛 "InResponseTo is not valid"。
// 因此 login / acs / metadata 必须复用同一 SP 实例；env 启动后不变，懒加载即可。
let samlSpInstance: ReturnType<typeof createSamlSp> | undefined;
const getSamlSp = (): ReturnType<typeof createSamlSp> =>
  (samlSpInstance ??= createSamlSp(samlConfig()));

const attrList = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const callbackSchema = z.object({ token: z.string().min(1) });

export default async function ssoRoutes(fastify: FastifyInstance) {
  fastify.get("/auth/sso/login", async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = getSamlSp();
    const url = await getAuthorizeUrl(saml);
    return reply.redirect(url);
  });

  fastify.post("/auth/sso/acs", async (request: FastifyRequest, reply: FastifyReply) => {
    const redirectBase = env.SSO_REDIRECT_BASE!;
    const errorRedirect = () => reply.redirect(`${redirectBase}?sso_error=authentication_failed`);
    try {
      const body = request.body as { SAMLResponse?: string };
      if (!body?.SAMLResponse) return errorRedirect();

      const saml = getSamlSp();
      const { profile } = await validatePostResponse(saml, body.SAMLResponse);
      if (!profile) return errorRedirect();

      const identity = extractIdentity(profile as SamlProfile, {
        emailAttrs: attrList(env.SSO_EMAIL_ATTRS),
        userCodeAttrs: attrList(env.SSO_USERCODE_ATTRS),
      });

      const result = await fastify.authService.loginViaSso!(identity, {
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });
      return reply.redirect(`${redirectBase}?token=${encodeURIComponent(result.token)}`);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        const reason = error.statusCode === 401 ? "user_not_found" : "access_denied";
        return reply.redirect(`${redirectBase}?sso_error=${reason}`);
      }
      request.log.error(
        { error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error },
        "SAML ACS validation failed",
      );
      return errorRedirect();
    }
  });

  fastify.get("/auth/sso/metadata", async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = getSamlSp();
    reply.type("application/xml").send(generateMetadata(saml));
  });

  fastify.post("/auth/sso/callback", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = callbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 400, data: null, message: "token is required" });
    }

    const payload = jwt.verify(parsed.data.token, env.JWT_SECRET) as AuthPayload;
    if (payload.authMode !== "sso") {
      return reply.code(401).send({ code: 401, data: null, message: TOKEN_INVALID_MESSAGE });
    }
    try {
      const validated = await fastify.authService.validatePayload!(payload);
      return success(reply, {
        token: parsed.data.token,
        ...fastify.authService.getSessionFromPayload(validated),
      });
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return reply.code(error.statusCode).send({ code: error.statusCode, data: null, message: error.message });
      }
      return reply.code(401).send({ code: 401, data: null, message: TOKEN_INVALID_MESSAGE });
    }
  });

  fastify.get("/auth/sso/logout", async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.redirect(env.SSO_REDIRECT_BASE!),
  );
  fastify.post("/auth/sso/logout", async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.redirect(env.SSO_REDIRECT_BASE!),
  );
}
