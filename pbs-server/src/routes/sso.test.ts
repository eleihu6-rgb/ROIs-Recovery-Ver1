import assert from "node:assert/strict";
import test, { before, mock } from "node:test";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.JWT_EXPIRES_IN ||= "24h";
process.env.CORS_ORIGIN ||= "http://localhost:3030";
process.env.SSO_ENABLED ||= "true";
process.env.SSO_ENTITY_ID ||= "urn:rois:pbs-sso";
process.env.SSO_CALLBACK_URL ||= "https://host/pbs/api/auth/sso/acs";
process.env.SSO_IDP_ENTRY_POINT ||= "https://login.microsoftonline.com/t/saml2";
process.env.SSO_IDP_CERT ||= "cert";
process.env.SSO_REDIRECT_BASE ||= "https://host/pbs/login";
process.env.SSO_EMAIL_ATTRS ||= "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress";
process.env.SSO_USERCODE_ATTRS ||= "employeeId";

// `mock.module` 需要 --experimental-test-module-mocks。有 flag 时 mock packages/saml 测 ACS happy path，
// 无 flag 时相关用例 skip（其余用例用真实 node-saml，不依赖 flag）。
const canMockModule = typeof mock.module === "function";

// 单例回归：mock 的 createSamlSp 计数，断言 login+acs 复用同一 SP 实例（全进程只调一次）
let createSamlSpCalls = 0;

before(async () => {
  if (!canMockModule) return;
  await mock.module("../../../packages/saml/dist/index.js", {
    namedExports: {
      createSamlSp: () => {
        createSamlSpCalls++;
        return {};
      },
      getAuthorizeUrl: async () => "https://login.microsoftonline.com/t/saml2?SAMLRequest=abc",
      validatePostResponse: async () => ({
        profile: { email: "taylor.brown@flyflair.com", employeeId: "0227" },
        loggedOut: false,
      }),
      generateMetadata: () => '<md:EntityDescriptor entityID="urn:rois:pbs-sso"/>',
      extractIdentity: (profile: { email?: string; employeeId?: string }) => ({
        email: profile.email,
        userCode: profile.employeeId,
      }),
    },
  });
});

const session = { user: { id: "1", name: "Taylor Brown", employeeNo: "0227" }, authMode: "sso" };

const buildApp = async () => {
  const { default: Fastify } = await import("fastify");
  const { default: formbody } = await import("@fastify/formbody");
  const { default: ssoRoutes } = await import("./sso.js");
  const app = Fastify();
  await app.register(formbody);
  app.decorate(
    "authService",
    {
      loginViaSso: async (identity: unknown) => ({
        token: "sso-jwt",
        ...session,
        receivedIdentity: identity,
      }),
      validatePayload: async (p: unknown) => p,
      getSessionFromPayload: () => session,
    } as never,
  );
  await app.register(ssoRoutes as unknown as import("fastify").FastifyPluginAsync, { prefix: "/api" });
  return app;
};

test("GET /auth/sso/login → 302 到 Azure entryPoint（真实 node-saml 生成 AuthnRequest）", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/auth/sso/login" });
  assert.equal(res.statusCode, 302);
  assert.ok((res.headers.location as string).startsWith("https://login.microsoftonline.com/t/saml2"));
});

test("GET /auth/sso/metadata → SP metadata XML", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/auth/sso/metadata" });
  assert.equal(res.statusCode, 200);
  assert.ok((res.headers["content-type"] as string).includes("application/xml"));
});

const realAcsErrorTest = canMockModule ? test.skip : test;
realAcsErrorTest("POST /auth/sso/acs 无效 SAMLResponse → 302 sso_error（error path，真实 node-saml）", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sso/acs",
    payload: "SAMLResponse=bogus",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert.equal(res.statusCode, 302);
  assert.ok((res.headers.location as string).includes("sso_error"));
});

const ssoToken = () =>
  jwt.sign(
    { id: "1", userCode: "0227", userName: "Taylor Brown", authMode: "sso", tokenVersion: 0, isAdmin: false },
    process.env.JWT_SECRET!,
  );

test("POST /auth/sso/callback 有效 sso token → 返回会话", async () => {
  const app = await buildApp();
  const token = ssoToken();
  const res = await app.inject({ method: "POST", url: "/api/auth/sso/callback", payload: { token } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.token, token);
  assert.equal(body.data.authMode, "sso");
  assert.equal(body.data.user.employeeNo, "0227");
});

test("POST /auth/sso/callback 非 sso token → 401", async () => {
  const app = await buildApp();
  const token = jwt.sign(
    { id: "1", userCode: "0227", userName: "Taylor Brown", authMode: "password", tokenVersion: 0, isAdmin: false },
    process.env.JWT_SECRET!,
  );
  const res = await app.inject({ method: "POST", url: "/api/auth/sso/callback", payload: { token } });
  assert.equal(res.statusCode, 401);
});

const happyPathTest = canMockModule ? test : test.skip;
happyPathTest("POST /auth/sso/acs 验签成功 → loginViaSso → 302 带 token（mock packages/saml）", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sso/acs",
    payload: "SAMLResponse=abc",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert.equal(res.statusCode, 302);
  assert.ok((res.headers.location as string).includes("token=sso-jwt"));
});

const singletonTest = canMockModule ? test : test.skip;
singletonTest("login 与 acs 复用同一 SP 实例（createSamlSp 全进程只调一次）", async () => {
  const app = await buildApp();
  await app.inject({ method: "GET", url: "/api/auth/sso/login" });
  await app.inject({
    method: "POST",
    url: "/api/auth/sso/acs",
    payload: "SAMLResponse=abc",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  // 单例：createSamlSp 只被调用一次（修复前每个 handler 各 new 一次 → 次数远大于 1）
  assert.equal(createSamlSpCalls, 1);
});
