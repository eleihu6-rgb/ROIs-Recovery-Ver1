import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import type { PbsAuthService } from "../../services/auth/types.js";

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/rois";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const buildAuthToken = () =>
  jwt.sign({
    id: "1",
    name: "Alex Crew",
    employeeNo: "F8001",
    userCode: "alex.crew",
    userName: "Alex Crew",
    authMode: "password",
    isAdmin: false,
    tokenVersion: 1,
  }, process.env.JWT_SECRET ?? "test-secret");

const mockAuthService: PbsAuthService = {
  async login() {
    throw new Error("login is not used by compression tests");
  },
  async validatePayload(payload) {
    return payload;
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
    return;
  },
};

test("PBS server compresses large API JSON responses when gzip is accepted", async () => {
  const { buildServer } = await import("../../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  server.get("/api/compression-fixture", async (_request, reply) => {
    return reply.send({
      code: 200,
      data: { text: "x".repeat(4096) },
      message: "ok",
    });
  });

  await server.ready();
  const response = await server.inject({
    method: "GET",
    url: "/api/compression-fixture",
    headers: {
      "accept-encoding": "gzip",
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-encoding"] ?? ""), /gzip/);
  await server.close();
});
