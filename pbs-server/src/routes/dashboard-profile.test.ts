import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsDashboardProfileRoutes } from "../../../packages/contracts/pbs-dashboard-profile.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
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
    tokenVersion: 0,
  }, process.env.JWT_SECRET ?? "test-secret");

const mockAuthService = {
  async login() {
    throw new Error("Not used.");
  },
  async validatePayload(payload) {
    return payload;
  },
  getSessionFromPayload(payload) {
    return {
      user: {
        id: payload.id,
        name: payload.name,
        employeeNo: payload.employeeNo,
      },
      authMode: payload.authMode,
    };
  },
  async logout() {
    return undefined;
  },
} satisfies import("../services/auth/types.js").PbsAuthService;

test("GET /api/dashboard/profile returns the authenticated user's profile", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    skipDatabase: true,
    authService: mockAuthService,
    dashboardProfileService: {
      async getCurrentProfile(actor) {
        assert.equal(actor.crewId, "F8001");
        return {
          id: "1",
          employeeNo: "F8001",
          name: "Alex Crew",
          email: "alex.crew@example.com",
          base: "YVR",
          rank: "FA",
          division: "C",
          fleet: null,
          languages: null,
          seniorityLabel: null,
          statusLabel: null,
          existingCreditLabel: null,
          trainingMonthLabel: null,
          lastLoginLabel: null,
        };
      },
    },
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsDashboardProfileRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  assert.deepEqual(response.json(), {
    code: 200,
    data: {
      id: "1",
      employeeNo: "F8001",
      name: "Alex Crew",
      email: "alex.crew@example.com",
      base: "YVR",
      rank: "FA",
      division: "C",
      fleet: null,
      languages: null,
      seniorityLabel: null,
      statusLabel: null,
      existingCreditLabel: null,
      trainingMonthLabel: null,
      lastLoginLabel: null,
    },
    message: "ok",
  });

  await server.close();
});

test("GET /api/dashboard/profile requires a bearer token", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsDashboardProfileRoutes.current}`,
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Authentication required. Please login first.");

  await server.close();
});
