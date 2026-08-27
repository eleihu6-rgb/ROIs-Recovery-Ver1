import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsDashboardSummaryRoutes } from "../../../packages/contracts/pbs-dashboard-summary.js";

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

test("GET /api/dashboard/summary returns the authenticated user's dashboard summary", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    skipDatabase: true,
    authService: mockAuthService,
    dashboardSummaryService: {
      async getCurrentSummary(actor) {
        assert.equal(actor.crewId, "F8001");
        assert.equal(actor.userCode, "alex.crew");

        return {
          profile: {
            id: "1",
            employeeNo: "F8001",
            name: "Alex Crew",
            email: "alex.crew@example.com",
            base: "YVR",
            rank: "FA",
            division: "C",
            fleet: ["737"],
            languages: ["EN 5"],
            seniorityLabel: "646",
            statusLabel: null,
            existingCreditLabel: "75.5",
            trainingMonthLabel: null,
            lastLoginLabel: "Apr 01, 19:30",
          },
          bidPackage: {
            rosterPeriodId: 4,
            rpStartLocal: "2026-04-01",
            rpEndLocal: "2026-04-30",
            periodCode: "Apr 2026",
            businessNow: "2026-04-02T12:00:00.000Z",
            timezoneLabel: "YVR Local Time",
            bidStartAt: "2026-04-01T07:00:00.000Z",
            bidCloseAt: "2026-04-09T06:59:00.000Z",
            bidStartLabel: "Apr 01, 00:00",
            bidCloseLabel: "Apr 08, 23:59",
            remainingLabel: "6 DAYS 11 HRS 59 MINS",
            computedStage: "OPEN",
            targetedLine: null,
            targetedReserve: null,
            totalBidder: 147,
          },
          messageCenter: {
            title: "MESSAGE CENTER",
            baseLineAverage: null,
            preAssignments: {
              totalDuties: 0,
              daysTouched: 0,
              categories: [],
              details: [],
            },
            fleetItems: [{ fleet: "737", subFleet: null, pairingCount: 24 }],
            messages: [],
          },
        };
      },
    },
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsDashboardSummaryRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  assert.equal(response.json().data.bidPackage.totalBidder, 147);
  assert.equal(response.json().data.bidPackage.targetedLine, null);
  assert.equal(response.json().data.messageCenter.baseLineAverage, null);

  await server.close();
});

test("GET /api/dashboard/summary requires a bearer token", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsDashboardSummaryRoutes.current}`,
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Authentication required. Please login first.");

  await server.close();
});
