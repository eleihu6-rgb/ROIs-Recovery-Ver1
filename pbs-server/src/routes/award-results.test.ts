import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsAwardRoutes } from "../../../packages/contracts/pbs-award-results.js";
import { env } from "../config/env.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsAwardResultsService } from "../services/award/types.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";

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
    name: "Casey Crew",
    employeeNo: "13401",
    userCode: "casey.crew",
    userName: "Casey Crew",
    authMode: "password",
  }, env.JWT_SECRET);

test("GET /api/award/current returns current authenticated crew award results", async () => {
  const { buildServer } = await import("../app.js");
  const awardResultsService: PbsAwardResultsService = {
    async getAwardPeriods() {
      return { periods: [] };
    },
    async getAwardByPeriodId() {
      throw new Error("Not used in this test.");
    },
    async getCurrentAward(actor) {
      assert.equal(actor.crewId, "13401");

      return {
        periodCode: "Jun 2026",
        published: true,
        timeZone: {
          base: "YVR",
          zoneId: "America/Vancouver",
          timezoneLabel: "YVR Local Time",
          fallback: false,
        },
        summary: {
          tier: null,
          offDays: 1,
          creditMinutes: null,
          premiumMinutes: null,
          pairingCount: 1,
          activityCount: 0,
          warnings: [],
        },
        calendar: {
          monthLabel: "JUN 2026",
          weekdayLabels: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
          events: [
            {
              id: "pairing-2001",
              type: "pairing",
              label: "V4558",
              startDate: "2026-06-01",
              endDate: "2026-06-01",
              startTime: "0020",
              endTime: "0355",
              tone: "blue",
              readonly: true,
            },
          ],
        },
        items: [],
        reasonReport: {
          available: false,
          disabledReason: "No award explanations are available for this period.",
          items: [],
        },
      };
    },
  };
  const server = await buildServer({
    authService: mockAuthService,
    awardResultsService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsAwardRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  assert.equal(response.json().data.periodCode, "Jun 2026");
  assert.equal(response.json().data.calendar.events[0].label, "V4558");

  await server.close();
});

test("GET /api/award/current returns 304 when the private ETag matches", async () => {
  const { buildServer } = await import("../app.js");
  const awardResultsService: PbsAwardResultsService = {
    async getAwardPeriods() {
      return { periods: [] };
    },
    async getAwardByPeriodId() {
      throw new Error("Not used in this test.");
    },
    async getCurrentAward() {
      return {
        periodCode: "Jun 2026",
        published: false,
        timeZone: {
          base: "YVR",
          zoneId: "America/Vancouver",
          timezoneLabel: "YVR Local Time",
          fallback: false,
        },
        summary: {
          tier: null,
          offDays: 0,
          creditMinutes: null,
          premiumMinutes: null,
          pairingCount: 0,
          activityCount: 0,
          warnings: [],
        },
        calendar: {
          monthLabel: "JUN 2026",
          weekdayLabels: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
          events: [],
        },
        items: [],
        reasonReport: {
          available: false,
          disabledReason: "No award explanations are available for this period.",
          items: [],
        },
      };
    },
  };
  const server = await buildServer({
    authService: mockAuthService,
    awardResultsService,
    skipDatabase: true,
  });
  const authHeaders = { authorization: `Bearer ${buildAuthToken()}` };
  const first = await server.inject({
    method: "GET",
    url: `/api${pbsAwardRoutes.current}`,
    headers: authHeaders,
  });

  assert.equal(first.statusCode, 200);
  assert.ok(first.headers.etag);

  const second = await server.inject({
    method: "GET",
    url: `/api${pbsAwardRoutes.current}`,
    headers: {
      ...authHeaders,
      "if-none-match": String(first.headers.etag),
    },
  });

  assert.equal(second.statusCode, 304);
  assert.equal(second.body, "");

  await server.close();
});

test("GET /api/award/periods returns only the authenticated crew readable periods", async () => {
  const { buildServer } = await import("../app.js");
  const awardResultsService: PbsAwardResultsService = {
    async getCurrentAward() {
      throw new Error("Not used in this test.");
    },
    async getAwardByPeriodId() {
      throw new Error("Not used in this test.");
    },
    async getAwardPeriods(actor) {
      assert.equal(actor.crewId, "13401");
      return {
        periods: [{
          rosterPeriodId: 75,
          periodCode: "Jun 2026",
          rpStart: "2026-06-01",
          rpEnd: "2026-06-30",
          lifecycleStage: "FINAL",
          awardPublishAt: "2026-05-20T00:00:00.000Z",
          awardFinalAt: "2026-05-22T00:00:00.000Z",
          misAwardDeadlineAt: "2026-05-26T00:00:00.000Z",
          firstPublishedAt: "2026-05-20T00:05:00.000Z",
          latestPublishedAt: "2026-05-20T00:05:00.000Z",
        }],
      };
    },
  };
  const server = await buildServer({ authService: mockAuthService, awardResultsService, skipDatabase: true });
  const response = await server.inject({
    method: "GET",
    url: `/api${pbsAwardRoutes.periods}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.periods[0].rosterPeriodId, 75);
  await server.close();
});

test("GET /api/award/periods/:id returns 409 when that crew has no readable publication", async () => {
  const { buildServer } = await import("../app.js");
  const awardResultsService: PbsAwardResultsService = {
    async getCurrentAward() {
      throw new Error("Not used in this test.");
    },
    async getAwardPeriods() {
      return { periods: [] };
    },
    async getAwardByPeriodId() {
      throw new LineholderBidServiceError(409, "Award results are not available for this period.");
    },
  };
  const server = await buildServer({ authService: mockAuthService, awardResultsService, skipDatabase: true });
  const response = await server.inject({
    method: "GET",
    url: "/api/award/periods/76",
    headers: { authorization: `Bearer ${buildAuthToken()}` },
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().message, "Award results are not available for this period.");
  await server.close();
});
