import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsBiddingCalendarRoutes } from "../../../packages/contracts/pbs-bidding-calendar.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsBiddingCalendarService } from "../services/calendar/types.js";

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

const mockBiddingCalendarService: PbsBiddingCalendarService = {
  async getCurrentCalendar(actor) {
    assert.equal(actor.crewId, "F8030");

    return {
      periodCode: "Apr 2026",
      bidContext: "Current",
      activeTierRange: ["T1", "T2"],
      events: [
        {
          id: "day-off-1",
          type: "prefer_off_bid",
          tier: "T1",
          label: "Off",
          startDate: "2026-04-05",
          endDate: "2026-04-05",
          tone: "green",
          source: "pbs_bid_group",
          readonly: false,
        },
        {
          id: "pairing-bid-1",
          type: "pairing_bid",
          tier: "T1",
          label: "M4959",
          startDate: "2026-04-06",
          endDate: "2026-04-08",
          tone: "blue",
          source: "pbs_bid_group",
          readonly: true,
        },
      ],
      dayOffCapacity: [
        {
          date: "2026-04-05",
          requestedDayOffCount: 23,
          totalCrewCount: 120,
          pairingDemandCount: 69,
          reserveDemandCount: 8,
          preAssignedDayOffCount: 10,
          maxDaysOffCount: 33,
        },
      ],
      warnings: ["Planned absence source is not available to PBS yet; roster events were skipped."],
    };
  },
};

const buildAuthToken = () =>
  jwt.sign({
    id: "1",
    name: "casey.crew",
    employeeNo: "F8030",
    userCode: "casey.crew",
    userName: "Casey Crew",
    authMode: "password",
  }, process.env.JWT_SECRET ?? "test-secret");

test("GET /api/bidding-calendar/current returns the current AA-style bidding calendar", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    biddingCalendarService: mockBiddingCalendarService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsBiddingCalendarRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  assert.equal(response.json().data.periodCode, "Apr 2026");
  assert.equal(response.json().data.events[0].label, "Off");
  assert.equal(response.json().data.events[1].type, "pairing_bid");
  assert.deepEqual(response.json().data.activeTierRange, ["T1", "T2"]);
  assert.deepEqual(response.json().data.dayOffCapacity, [
    {
      date: "2026-04-05",
      requestedDayOffCount: 23,
      totalCrewCount: 120,
      pairingDemandCount: 69,
      reserveDemandCount: 8,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    },
  ]);

  await server.close();
});

test("GET /api/bidding-calendar/current returns 304 when the private ETag matches", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    biddingCalendarService: mockBiddingCalendarService,
    skipDatabase: true,
  });

  const authHeaders = { authorization: `Bearer ${buildAuthToken()}` };
  const first = await server.inject({
    method: "GET",
    url: `/api${pbsBiddingCalendarRoutes.current}`,
    headers: authHeaders,
  });
  assert.equal(first.statusCode, 200);
  assert.ok(first.headers.etag);

  const second = await server.inject({
    method: "GET",
    url: `/api${pbsBiddingCalendarRoutes.current}`,
    headers: { ...authHeaders, "if-none-match": String(first.headers.etag) },
  });
  assert.equal(second.statusCode, 304);
  assert.equal(second.body, "");

  await server.close();
});

test("old calendar days-off endpoint is no longer registered", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    biddingCalendarService: mockBiddingCalendarService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/calendar-days-off/current",
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 404);

  await server.close();
});
