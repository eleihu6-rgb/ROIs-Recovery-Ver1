import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsAlgorithmExportRoutes } from "../../../packages/contracts/pbs-algorithm-export.js";
import type { PbsAuthService } from "../services/auth/types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const mockAuthService: PbsAuthService = {
  async login() {
    throw new Error("Not used in this test.");
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

const buildAuthToken = () =>
  jwt.sign({
    id: "1",
    name: "admin",
    employeeNo: "admin",
    userCode: "admin",
    userName: "System Administrator",
    authMode: "password",
    isAdmin: true,
  }, process.env.JWT_SECRET ?? "test-secret");

const buildServer = async () => {
  const appModule = await import("../app.js");
  return appModule.buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });
};

test("PBS algorithm export old GET package path returns 410", async () => {
  const server = await buildServer();

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsAlgorithmExportRoutes.currentPackage}?periodCode=Jun%202026`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 410);
  assert.equal(response.json().message, "PBS algorithm export has moved to live-server.");

  await server.close();
});

test("PBS algorithm export old YEG package path returns 410", async () => {
  const server = await buildServer();

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsAlgorithmExportRoutes.yeg14TestPackage}?periodCode=Jun%202026`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 410);
  assert.equal(response.json().message, "PBS algorithm export has moved to live-server.");

  await server.close();
});

test("PBS algorithm export old scenario package path returns 410", async () => {
  const server = await buildServer();

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsAlgorithmExportRoutes.scenarioPackage}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: { periodCode: "Jun 2026", crewIds: ["536", "247"] },
  });

  assert.equal(response.statusCode, 410);
  assert.equal(response.json().message, "PBS algorithm export has moved to live-server.");

  await server.close();
});

test("PBS algorithm export old path still requires authentication", async () => {
  const server = await buildServer();

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsAlgorithmExportRoutes.currentPackage}?periodCode=Jun%202026`,
  });

  assert.equal(response.statusCode, 401);

  await server.close();
});
