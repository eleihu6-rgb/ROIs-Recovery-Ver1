import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import authRoutes from "./auth.js";
import type { PbsAuthService } from "../services/auth/types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

test("POST /api/auth/simulated-session exchanges a simulated token", async () => {
  const loginViaSimulationCalls: string[] = [];
  const app = Fastify();
  const authService: PbsAuthService = {
    async login() {
      throw new Error("not used");
    },
    async loginViaSimulation(token) {
      loginViaSimulationCalls.push(token);
      return {
        token: "pbs-jwt",
        authMode: "simulated",
        user: {
          id: "4010",
          name: "Mary Nasso",
          employeeNo: "B79185",
        },
      };
    },
    getSessionFromPayload(payload) {
      return {
        authMode: payload.authMode,
        user: {
          id: payload.id,
          name: payload.name,
          employeeNo: payload.employeeNo,
        },
      };
    },
    async logout() {
      return undefined;
    },
  };
  app.decorate("authService", authService);
  app.decorateRequest("authUser", undefined);
  await app.register(authRoutes, { prefix: "/api" });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/simulated-session",
    headers: {
      cookie: "__Secure-pbs-simulated-login=simulate-token",
    },
  });

  const setCookieHeaders = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.authMode, "simulated");
  assert.deepEqual(loginViaSimulationCalls, ["simulate-token"]);
  assert.ok(cookies.some((cookie) =>
    typeof cookie === "string"
    && cookie.includes("__Secure-pbs-simulated-login=")
    && cookie.includes("Max-Age=0")));
  await app.close();
});

test("POST /api/auth/simulated-session requires a cookie token", async () => {
  const app = Fastify();
  const authService: PbsAuthService = {
    async login() {
      throw new Error("not used");
    },
    getSessionFromPayload(payload) {
      return {
        authMode: payload.authMode,
        user: {
          id: payload.id,
          name: payload.name,
          employeeNo: payload.employeeNo,
        },
      };
    },
    async logout() {
      return undefined;
    },
  };
  app.decorate("authService", authService);
  app.decorateRequest("authUser", undefined);
  await app.register(authRoutes, { prefix: "/api" });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/simulated-session",
    payload: {},
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Simulated login token is missing or expired.");
  await app.close();
});
