import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsPortalBootstrapRoutes } from "../../../packages/contracts/pbs-portal-bootstrap.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const buildAuthToken = () =>
  jwt.sign({
    id: "1",
    name: "Test Crew",
    employeeNo: "F8001",
    userCode: "test.crew",
    userName: "Test Crew",
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

test("GET /api/portal/bootstrap combines profile, calendar, and summary", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    skipDatabase: true,
    authService: mockAuthService,
    dashboardProfileService: {
      async getCurrentProfile(actor) {
        assert.equal(actor.crewId, "F8001");
        return { employeeNo: "F8001", name: "Test Crew" } as never;
      },
    },
    biddingCalendarService: {
      async getCurrentCalendar() {
        return { periodCode: "Jun 2026", events: [], warnings: [] } as never;
      },
    },
    lineholderSummaryService: {
      async getCurrentSummary() {
        return { periodCode: "Jun 2026", statistics: [], summaryItems: [], diagnostics: [] } as never;
      },
    },
  });

  await server.ready();
  const response = await server.inject({
    method: "GET",
    url: `/api${pbsPortalBootstrapRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.data.profile.employeeNo, "F8001");
  assert.equal(body.data.biddingCalendar.periodCode, "Jun 2026");
  assert.equal(body.data.lineholderSummary.periodCode, "Jun 2026");
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  await server.close();
});

test("GET /api/portal/bootstrap requires a bearer token", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({ skipDatabase: true });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsPortalBootstrapRoutes.current}`,
  });

  assert.equal(response.statusCode, 401);
  await server.close();
});
